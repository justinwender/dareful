/**
 * The ops round (2026-10-09), against the real database. Every row a test writes to the operations tables is dated 1999
 * or keyed under this run's own names, so nothing here reaches production's alerts, its morning email or its runway: the
 * suites' own feed leaving the real schedule's mark alone; an alert told once a crossing and again only after it recovers;
 * the runway's readers; health runs and a system down ten minutes; the morning email claimed once; the questions played
 * and how they stand; and the canary, end to end on the chain, moving no number /stats shows. Rows tracked and removed.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, like, lt, sql } from "drizzle-orm";
import { english, generateMnemonic } from "viem/accounts";
import type { Hex } from "viem";
import { db, schema } from "@/db";
import { creditLeftFrom, recordAiCall, spentSince } from "@/lib/ai/spend";
import { contracts } from "@/lib/chain/contracts";
import { relayer } from "@/lib/chain/relayer";
import { ensureUsd } from "@/lib/ledger/denominations";
import { createGroup } from "@/lib/ledger/groups";
import * as markets from "@/lib/ledger/markets";
import { recordSend } from "@/lib/notify/channels";
import { observe, tellDue } from "@/lib/ops/alerts";
import { runCanary } from "@/lib/ops/canary";
import { Down, healthAnswer, pushFailures, runHealth } from "@/lib/ops/health";
import { sendMorning } from "@/lib/ops/morning";
import { cuThisMonth, flushRpcUsage, tally } from "@/lib/ops/rpc-usage";
import { databaseBytes, emailsSent, relayerLevel, storageBytes, watchRunway } from "@/lib/ops/runway";
import { claimState, putState, readState } from "@/lib/ops/state";
import { TURN } from "@/lib/ops/turns";
import { syncSchedule } from "@/lib/sports";
import { countedOnchain, countStats, dayWindow, played, windowFor } from "@/lib/usage/stats";
import { cleanup, relayerHasRoom, TEST_FEED, tempUser, testSchedule, track } from "./fixture";

const RUN = randomUUID().slice(0, 8);
/** This run's own alert and state names: production's are `runway:`, `health:`, `tick`, `morning:`. */
const P = `test:ops:${RUN}:`;
/** The canary's runs this file made, removed after it whatever an assertion did: a run left at the real time is in the owner's morning email. */
const canaryRunIds: string[] = [];
const MON = 10n ** 18n;
/** A day nobody else has rows on. */
const DAY = "1999-06-15";
const at = (h: number, m = 0) => new Date(Date.UTC(1999, 5, 15, h, m));

after(async () => {
  await db.delete(schema.opsAlerts).where(like(schema.opsAlerts.key, `${P}%`));
  await db.delete(schema.opsState).where(sql`${schema.opsState.key} like ${`${P}%`} or ${schema.opsState.key} like ${`health:claim:${P}%`} or ${schema.opsState.key} = ${`morning:${DAY}`}`);
  if (canaryRunIds.length) await db.delete(schema.canaryRuns).where(inArray(schema.canaryRuns.id, canaryRunIds));
  // The operations rows dated on this run's day, and no other day's.
  const from = new Date("1999-06-14T00:00:00Z");
  const to = new Date("1999-06-17T00:00:00Z");
  await db.delete(schema.healthRuns).where(and(gte(schema.healthRuns.at, from), lt(schema.healthRuns.at, to)));
  await db.delete(schema.channelSends).where(and(gte(schema.channelSends.at, from), lt(schema.channelSends.at, to)));
  await db.delete(schema.aiCalls).where(and(gte(schema.aiCalls.at, from), lt(schema.aiCalls.at, to)));
  await db.delete(schema.rpcCalls).where(eq(schema.rpcCalls.day, DAY));
  await cleanup();
});

// ------------------------------------------------------------------------------------------ section 0

test("a schedule read from the suites' own feed leaves the real scoreboard's refresh mark as it found it (section 0)", async () => {
  const real = async () => (await db.select().from(schema.sportsFeedReads).where(and(eq(schema.sportsFeedReads.source, "espn"), eq(schema.sportsFeedReads.sport, "nfl")))).map((r) => `${r.lastOkAt?.toISOString()}|${r.lastErrorAt?.toISOString()}`);
  const before = await real();
  await syncSchedule("nfl", new Date(), testSchedule([]));
  assert.deepEqual(await real(), before, "the real feed's mark is as it was, so production's refresh is never held back");
  const [own] = await db.select().from(schema.sportsFeedReads).where(and(eq(schema.sportsFeedReads.source, TEST_FEED), eq(schema.sportsFeedReads.sport, "nfl")));
  assert.ok(own?.lastOkAt, "the read is marked under the run's own name, which cleanup removes");
});

// ------------------------------------------------------------------------------------------ sections 1 and 5: alerts

test("a crossed line is told once by email and push, held while it lasts, cleared when it recovers, and told again when it crosses again; a telling that went nowhere stays due (sections 1 and 5)", async () => {
  const told: string[] = [];
  const teller = (went: boolean) => async (subject: string) => (told.push(subject), went);
  const low = relayerLevel(4n * MON, 0n);
  const fine = relayerLevel(40n * MON, 0n);
  // Nothing went: the alert stays due and is tried again on the next run.
  assert.deepEqual((await watchRunway(at(12), teller(false), [low], P)).told, []);
  const first = await watchRunway(at(12, 5), teller(true), [low], P);
  assert.deepEqual(first.told, [`${P}relayer:urgent`], "one telling, the urgent line, which carries the warning with it");
  assert.match(told.at(-1) ?? "", /^Dareful: Urgent: the relayer is under 5\.00 MON: 4\.00 MON$/);
  assert.deepEqual((await watchRunway(at(12, 10), teller(true), [low], P)).told, [], "still under: not told again");
  assert.deepEqual((await watchRunway(at(12, 15), teller(true), [fine], P)).told, [], "recovered: cleared, nothing told");
  const [row] = await db.select().from(schema.opsAlerts).where(eq(schema.opsAlerts.key, `${P}relayer:urgent`));
  assert.deepEqual([row?.since, row?.toldAt, row?.clearedAt?.toISOString()], [null, null, at(12, 15).toISOString()]);
  assert.deepEqual((await watchRunway(at(12, 20), teller(true), [low], P)).told, [`${P}relayer:urgent`], "crossed again: told again");
});

test("a core system down is told after ten minutes, once, and a system that decides nothing is never told (sections 2 and 5)", async () => {
  const told: string[] = [];
  const tell = async (subject: string) => (told.push(subject), true);
  const checks = [
    { name: "database" as const, core: true, limitMs: 1_000, slowMs: 500, run: async (): Promise<string | null> => { throw new Down("no answer"); } },
    { name: "resend" as const, core: false, limitMs: 1_000, slowMs: 500, run: async (): Promise<string | null> => { throw new Down("answered 500"); } },
  ];
  const first = await runHealth("tick", at(13), { tell, checks, prefix: P });
  assert.equal(first.ok, false, "a core system down: production is down");
  assert.deepEqual(told, [], "not yet ten minutes");
  await runHealth("request", at(13, 9), { tell, checks, prefix: P });
  assert.deepEqual(told, []);
  await runHealth("tick", at(13, 10), { tell, checks, prefix: P });
  assert.deepEqual(told, ["Dareful: database has been down for ten minutes (no answer)"]);
  await runHealth("tick", at(13, 15), { tell, checks, prefix: P });
  assert.equal(told.length, 1, "told once while it lasts");
  const onlyLesser = await runHealth("tick", at(13, 20), { tell, checks: [checks[1]!], prefix: P });
  assert.equal(onlyLesser.ok, true, "a system that decides nothing being down leaves production up");
  const runs = await db.select().from(schema.healthRuns).where(and(gte(schema.healthRuns.at, at(13)), lt(schema.healthRuns.at, at(14))));
  assert.deepEqual(runs.map((r) => [r.source, r.coreOk]).sort(), [["request", false], ["tick", false], ["tick", false], ["tick", false], ["tick", true]].sort(), "every run kept, with who asked");
});

test("a health run asks its checks a few at a time, never all at once, and answers each in its place (section 2)", async () => {
  // Fifteen at once over the pooler stalled the driver on October 9 and held the route for five minutes (`turns.ts`).
  let inFlight = 0;
  let most = 0;
  const names = ["database", "tick", "rpc", "contracts", "relayer", "indexer", "push"] as const;
  const checks = names.map((name) => ({
    name,
    core: false,
    limitMs: 2_000,
    slowMs: 1_000,
    run: async (): Promise<string | null> => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 40));
      inFlight -= 1;
      return name;
    },
  }));
  const run = await runHealth("tick", at(12, 30), { tell: async () => true, checks, prefix: P });
  assert.ok(most <= TURN, `at most ${TURN} in flight, saw ${most}`);
  assert.ok(most > 1, "but more than one at a time");
  assert.deepEqual(run.checks.map((c) => c.note), [...names], "each answer in its check's place");
});

test("a health answer is its own environment's: one run a minute there, its own claim, its own hourly answers, and never another's run (section 2)", async () => {
  // Every environment shares this database: a laptop's run (its own indexer, no tick) once stood in for production's.
  const A = `${P}a`;
  const B = `${P}b`;
  const T = at(15);
  const plus = (ms: number) => new Date(T.getTime() + ms);
  const quiet = async () => true;
  let asked = 0;
  const database = (up: boolean) => ({ name: "database" as const, core: true, limitMs: 1_000, slowMs: 500, run: async (): Promise<string | null> => { if (!up) throw new Down("no answer"); return null; } });
  const hourly = { name: "storage" as const, core: false, limitMs: 1_000, slowMs: 500, every: 3_600_000, run: async (): Promise<string | null> => ((asked += 1), null) };
  const old = await healthAnswer(plus(-300_000), { env: B, checks: [database(false)], tell: quiet, prefix: P });
  assert.equal(old.ok, false, "B, five minutes ago, its core down");
  const a = await healthAnswer(T, { env: A, checks: [database(true), hourly], tell: quiet, prefix: P });
  assert.deepEqual([a.ok, a.env, a.at, asked], [true, A, T.toISOString(), 1], "A's own run, its hourly check asked");
  assert.equal((await healthAnswer(plus(30_000), { env: A, checks: [database(true), hourly], tell: quiet, prefix: P })).at, T.toISOString(), "asked again within the minute, A's same run");
  const b = await healthAnswer(plus(10_000), { env: B, checks: [database(true), hourly], tell: quiet, prefix: P });
  assert.deepEqual([b.ok, b.env, b.at], [true, B, plus(10_000).toISOString()], "B runs its own in that minute: A's run and A's claim are A's");
  assert.equal(asked, 2, "and asks its hourly check itself: what A kept stands for A alone");
  const kept = await db.select({ env: schema.healthRuns.env }).from(schema.healthRuns).where(and(gte(schema.healthRuns.at, plus(-300_000)), lt(schema.healthRuns.at, plus(60_000))));
  assert.deepEqual(kept.map((k) => k.env).sort(), [A, B, B].sort(), "each run kept under its own environment");
});

// ------------------------------------------------------------------------------------------ section 1: the readers

test("the runway reads the database as Supabase counts it, the bucket's objects, and the app's own emails today and this month (section 1)", async () => {
  const [sum] = (await db.execute(sql`select sum(pg_database_size(datname))::bigint as n, pg_database_size(current_database())::bigint as here from pg_database where datallowconn`)) as unknown as Array<{ n: string; here: string }>;
  const bytes = await databaseBytes();
  assert.ok(bytes >= Number(sum?.here) && bytes > 0);
  assert.ok(Math.abs(bytes - Number(sum?.n)) < 1_000_000, "every database summed, as the usage page counts it, not this one alone");
  assert.ok(Number(sum?.n) > Number(sum?.here), "and there is more than this one to sum");
  const [objects] = (await db.execute(sql`select coalesce(sum((metadata->>'size')::bigint), 0)::bigint as n from storage.objects`)) as unknown as Array<{ n: string }>;
  assert.equal(await storageBytes(), Number(objects?.n));
  await recordSend("email", "ops", true, at(9));
  await recordSend("email", "notice", true, at(10));
  await recordSend("email", "notice", false, at(10));
  await recordSend("push", "notice", true, at(10));
  // Earlier this month and inside the cleanup's window, so a run never leaves it for the next one to count.
  await recordSend("email", "notice", true, new Date("1999-06-14T10:00:00Z"));
  assert.deepEqual(await emailsSent(at(23)), { today: 2, month: 3 }, "emails that went, today and this month, UTC; a failed one and a push are not Resend's");
});

test("the RPC's units are added up by day and method, a write at a time, and the month is summed (section 1)", async () => {
  tally(["eth_getBalance", "eth_call"], at(1));
  tally(["eth_getBalance"], at(2));
  await flushRpcUsage();
  tally(["eth_getBalance"], at(3));
  await flushRpcUsage();
  const rows = await db.select().from(schema.rpcCalls).where(eq(schema.rpcCalls.day, DAY));
  assert.deepEqual(rows.map((r) => [r.method, r.calls, r.cu]).sort(), [["eth_call", 1, 26], ["eth_getBalance", 3, 60]].sort(), "a second write adds to the day's row");
  assert.equal(await cuThisMonth(at(23)), 86);
});

test("what the model API has spent is priced from every answer kept, and what is left of the credit counts down from the moment it was entered (section 1)", async () => {
  await recordAiCall(`test ${RUN}`, "claude-haiku-5-5", { input: 10_000, output: 2_000, cacheRead: 0, cacheWrite: 0, searches: 0 }, at(8));
  await recordAiCall(`test ${RUN}`, "claude-sonnet-5-5", { input: 1_000, output: 1_000, cacheRead: 0, cacheWrite: 0, searches: 1 }, at(9));
  const spent = await spentSince(at(0), at(23));
  assert.deepEqual([spent.nano, spent.calls], [2_000_000n + 22_000_000n, 2], "Haiku's two tenths of a cent and Sonnet's call with its search");
  assert.deepEqual(await spentSince(at(8, 30), at(23)), { nano: 22_000_000n, calls: 1 }, "only what came after the moment");
  const left = await creditLeftFrom({ cents: 500n, at: at(8, 30) }, at(23));
  assert.deepEqual([left.cents, left.spentCents], [497n, 3n], "five dollars entered, three cents since, rounded up");
});

test("the push check reads the share failing over the day before its moment (section 2)", async () => {
  // A day of its own: the runway's test above puts a push on this file's first day.
  const day16 = (h: number) => new Date(Date.UTC(1999, 5, 16, h));
  for (const ok of [true, true, false]) await recordSend("push", "notice", ok, day16(20));
  await recordSend("push", "notice", false, day16(1));
  assert.deepEqual(await pushFailures(day16(21)), { sent: 4, failed: 2 });
  assert.deepEqual(await pushFailures(new Date(Date.UTC(1999, 5, 17, 3))), { sent: 3, failed: 1 }, "the day before its moment, and nothing older");
});

test("a key is taken once: a second claim of the same day's email gets nothing (section 5)", async () => {
  assert.equal(await claimState(`${P}claim`), true);
  assert.equal(await claimState(`${P}claim`), false);
  await putState(`${P}fact`, { n: 1 }, at(5));
  assert.deepEqual(await readState(`${P}fact`), { at: at(5), value: { n: 1 } });
});

test("the morning email goes once a day from 8am Eastern, with the day's failures in it, and a second tick sends nothing (section 5)", async () => {
  await runHealth("tick", at(14), { tell: async () => true, checks: [{ name: "rpc", core: true, limitMs: 1_000, slowMs: 500, run: async () => { throw new Down("latest block 9 min ago"); } }], prefix: P });
  // Another environment's run in the same hours: a laptop's, say, with its own indexer behind.
  await runHealth("request", at(14, 30), { env: `${P}elsewhere`, tell: async () => true, checks: [{ name: "indexer", core: true, limitMs: 1_000, slowMs: 500, run: async () => { throw new Down("seen only elsewhere"); } }], prefix: P });
  const sent: Array<{ subject: string; text: string }> = [];
  const send = async (subject: string, text: string) => (sent.push({ subject, text }), true);
  assert.equal(await sendMorning(at(11, 59), send), "not due", "7:59am Eastern");
  assert.equal(await sendMorning(at(16), send), "sent");
  assert.equal(await sendMorning(at(16, 1), send), "taken");
  assert.equal(sent.length, 1);
  assert.ok(sent[0]!.text.includes("- rpc down at 14:00 UTC: latest block 9 min ago"), sent[0]!.text);
  assert.ok(!sent[0]!.text.includes("seen only elsewhere"), "another environment's runs are not this one's morning");
  assert.ok(sent[0]!.text.includes("RUNWAY") && sent[0]!.text.includes("YESTERDAY (1999-06-14, Eastern)"));
});

// ------------------------------------------------------------------------------------------ section 6: questions played

test("a question is played once someone besides its asker is in, and the played are settled, still open or ended without a decision (section 6)", async () => {
  const w = dayWindow("1999-06-20");
  const when = new Date(w.from!.getTime() + 12 * 3_600_000);
  const asker = await tempUser("Played asker", undefined, { counted: true });
  const friend = await tempUser("Played friend", undefined, { counted: true });
  const g = await createGroup({ name: "played check (temporary)", createdBy: asker.id, memberUserIds: [friend.id] });
  track.group(g.id);
  const usd = await ensureUsd(g.id, asker.id);
  const ask = async (people: string[], more: Partial<typeof schema.dares.$inferInsert> = {}) => {
    const d = await markets.draftMarket({ creatorId: asker.id, groupId: g.id, denomId: usd.id, title: "Does it get played?", termsText: "Yes if it does. No if not.", resolvesBy: new Date(Date.now() + 3_600_000) });
    await db.update(schema.dares).set({ creatorSignature: Buffer.from("01", "hex"), createdAt: when, ...more }).where(eq(schema.dares.id, d.id));
    for (const userId of people) await db.insert(schema.darePositions).values({ dareId: d.id, userId, stake: 100n, value: 5000n, enteredBy: userId, enteredAt: when, acknowledgedAt: when });
  };
  await ask([asker.id, friend.id], { lockedAt: when, resolvedAt: when, resolvedBy: "quorum", resolvedOutcome: 1n });
  await ask([asker.id, friend.id]);
  await ask([asker.id, friend.id], { lockedAt: when, resolvedAt: when, resolvedBy: "expired" });
  await ask([asker.id]);
  await ask([asker.id], { lockedAt: when, resolvedAt: when, resolvedBy: "removed", resolvedOutcome: markets.VOID_OUTCOME });
  assert.deepEqual(await played(w), { played: 3, settled: 1, open: 1, undecided: 1 });
  const c = await countStats(w);
  assert.deepEqual([c.questions, c.questions_two_in, c.played_settled, c.played_open, c.played_undecided], [4, 3, 1, 1, 1], "four asked (the one called off before anyone joined is not), three played");
});

// ------------------------------------------------------------------------------------------ section 4: the canary

/** A question settled on the chain, as the contract reads it: what the hosted indexer stands in for here. */
const settledOnChain = async (onchainId: string) => {
  const { dares } = contracts();
  const d = (await relayer().publicClient.readContract({ address: dares.address, abi: dares.abi, functionName: "dareOf", args: [onchainId as Hex] })) as { status: number };
  return d.status === 1;
};
const writeUp = async () => ({ title: "Will the canary sing before the hour is out?", terms: "Yes if the canary sings before the hour is out. No if it does not.", ambiguous: false, criteria: [], decideBy: null, tooFar: null, plain: false, number: null, outcomes: null, mark: null });

/** Counted activity since a moment that is not this file's: real use landing in the middle of a run. */
async function realUseSince(since: Date): Promise<number> {
  const [r] = (await db.execute(
    sql`select (select count(*) from usage_events e left join users u on u.id = e.user_id left join participant_claims c on c.id = e.claim_id where e.at >= ${since.toISOString()}::timestamptz and not coalesce(u.excluded_from_counts, false) and not coalesce(c.excluded_from_counts, false))::int + (select count(*) from users where created_at >= ${since.toISOString()}::timestamptz and not excluded_from_counts)::int as n`,
  )) as unknown as Array<{ n: number }>;
  return Number(r?.n ?? 0);
}

test("a canary run asks, enters, closes onto the chain, settles there and leaves nothing behind: no number /stats shows moves, and its accounts count for nothing (section 4)", async (t) => {
  await relayerHasRoom();
  const ids = { a: `tmp-check:canary:${RUN}:a`, b: `tmp-check:canary:${RUN}:b` };
  const start = new Date();
  // One read after another: the database's pooler stalls on a deep queue (src/lib/ops/turns.ts).
  const numbers = async (at: Date) => [await countStats(windowFor("launch", at)), await countStats(windowFor("week", at)), await countedOnchain()] as const;
  const before = await numbers(start);
  const told: string[] = [];
  const r = await runCanary({ mnemonic: generateMnemonic(english), ids, writeUp, indexerShows: settledOnChain, tell: async (s) => (told.push(s), true), waitMs: 90_000 });
  canaryRunIds.push(r.id);
  const accounts = await db.select().from(schema.users).where(inArray(schema.users.dynamicUserId, [ids.a, ids.b]));
  for (const u of accounts) track.user(u.id);
  assert.deepEqual([r.ok, r.step, r.error], [true, "remove", null], `the run: ${r.error ?? ""}`);
  assert.deepEqual(told, [], "a run that passes tells nobody");
  assert.deepEqual(r.steps.map((s) => s.step), ["accounts", "write-up", "ask", "enter", "close", "vote", "settle", "indexer", "remove"]);
  assert.ok(r.txs.some((x) => x.step === "close") && r.txs.some((x) => x.step === "settle"), "its create and its resolve, by hash");
  assert.ok(accounts.length === 2 && accounts.every((u) => u.excludedFromCounts), "two accounts, out of every count");
  const id = r.dareId as string;
  const left = await Promise.all([db.select().from(schema.dares).where(eq(schema.dares.id, id)), db.select().from(schema.darePositions).where(eq(schema.darePositions.dareId, id)), db.select().from(schema.dareVotes).where(eq(schema.dareVotes.dareId, id)), db.select().from(schema.obligations).where(eq(schema.obligations.originId, id)), db.select().from(schema.usageEvents).where(eq(schema.usageEvents.dareId, id))]);
  assert.deepEqual(left.map((rows) => rows.length), [0, 0, 0, 0, 0], "the question, its entries, its votes, what it minted and its events are gone");
  const [run] = await db.select().from(schema.canaryRuns).where(eq(schema.canaryRuns.id, r.id));
  assert.deepEqual([run?.ok, run?.step], [true, "remove"], "the run is kept");
  const after = await numbers(start);
  if (JSON.stringify(after.slice(0, 2)) !== JSON.stringify(before.slice(0, 2)) && (await realUseSince(start)) > 0) return t.skip("a real person used the app while it ran, so the numbers moved for them");
  assert.deepEqual(after[0], before[0], "since launch, every number the same");
  assert.deepEqual(after[1], before[1], "the last seven days, every number the same");
  assert.deepEqual([after[2].dareIds, after[2].ledgers].map((x) => [...x].sort()), [before[2].dareIds, before[2].ledgers].map((x) => [...x].sort()), "the chain's counted questions and people the same");
});

test("a canary step that fails is told at once by name, with what it said, the run kept and no question left (section 4)", async () => {
  const ids = { a: `tmp-check:canary:${RUN}:fa`, b: `tmp-check:canary:${RUN}:fb` };
  const told: Array<{ subject: string; text: string }> = [];
  const r = await runCanary({ mnemonic: generateMnemonic(english), ids, writeUp: async () => ({ error: "Ask it in a line." }), tell: async (subject, text) => (told.push({ subject, text }), true) });
  canaryRunIds.push(r.id);
  for (const u of await db.select().from(schema.users).where(inArray(schema.users.dynamicUserId, [ids.a, ids.b]))) track.user(u.id);
  assert.deepEqual([r.ok, r.step, r.error, r.dareId], [false, "write-up", "Ask it in a line.", null]);
  assert.deepEqual(told.map((x) => x.subject), ["Dareful: the canary failed at write-up"]);
  assert.ok(told[0]!.text.includes('failed at the step "write-up": Ask it in a line.'));
  const [run] = await db.select().from(schema.canaryRuns).where(eq(schema.canaryRuns.id, r.id));
  assert.deepEqual([run?.ok, run?.step, run?.error], [false, "write-up", "Ask it in a line."]);
});

// The observe() rule on the database, by itself: a delay counted from when it began.
test("an alert row remembers when its condition began, and is due only once its delay has passed (section 5)", async () => {
  assert.equal(await observe(`${P}delay`, true, "down", at(18), 600_000), false);
  assert.equal(await observe(`${P}delay`, true, "down", at(18, 10), 600_000), true);
  assert.deepEqual(await tellDue([{ key: `${P}delay`, line: "x" }], at(18, 10), async () => true), [`${P}delay`]);
  assert.equal(await observe(`${P}delay`, true, "down", at(18, 11), 600_000), false, "told: not due again while it lasts");
});
