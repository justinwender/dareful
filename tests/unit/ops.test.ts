/**
 * The ops round (2026-10-09), the parts that need no database: section 0's cover rule and the suites' own feed; the
 * owner's lines and every runway level read against them; the alert's rule (once a crossing, again only after it
 * recovers); what the RPC's calls and the model's answers cost; health's own rules; the morning email's words; the
 * canary's keys; and the outside check, run against a stand-in for production.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { coversOnly } from "@/lib/ledger/proposals";
import { columnOf, numberAxis, serialiseAxis } from "@/lib/ledger/number-axis";
import { marginShift } from "@/lib/sports/templates";
import { BY_HAND, DOWN_TELLS_AFTER_MS, LINES, REFUSAL_HOLDS_MS } from "@/lib/ops/lines";
import { alertsOf, alchemyLevel, creditLevel, indexerLevel, percentLevel, relayerLevel, resendLevels } from "@/lib/ops/runway";
import { alertStep, tellerOf } from "@/lib/ops/alerts";
import { cuFor, isAlchemy, methodsOf, refusalOf, UNLISTED_CU } from "@/lib/ops/rpc-usage";
import { centsFromTyped, centsUp, nanoOf, outOfCredit, usageOf } from "@/lib/ai/spend";
import { blockFresh, Down, hereEnv, indexerCaughtUp, modelWords, pushState, runCheck, shareable, stillStands, tickFresh, watchesHere, type CheckResult } from "@/lib/ops/health";
import { composeMorning, failureSpans, morningDue, yesterdayOf, type MorningFacts } from "@/lib/ops/morning";
import { opsDue } from "@/lib/ops/tick";
import { canaryKeys, canaryOff } from "@/lib/ops/canary";
import { redactKeys } from "@/lib/redact";
import { refusalDue, REFUSAL_NOTE_EVERY_MS } from "@/lib/ops/state";
import { allInTurns, inTurns, TURN } from "@/lib/ops/turns";

const MON = 10n ** 18n;
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const at = (iso: string) => new Date(iso);
const kept = (iso: string, why = "for rate") => ({ at: at(iso), value: { why } });

// ------------------------------------------------------------------------------------------ section 0

test("nothing a question left is drawn as a cover: its proposals are its story's, whatever page reads them (section 0)", () => {
  const rows = [
    { id: "cover", origin: "manual" },
    { id: "split", origin: "expense" },
    { id: "result", origin: "dare" },
  ];
  assert.deepEqual(
    coversOnly(rows).map((r) => r.id),
    ["cover", "split"],
  );
  for (const page of ["src/app/p/c/[id]/page.tsx", "src/lib/ledger/person.ts"]) assert.ok(read(page).includes("coversOnly("), `${page} draws covers only`);
});

/** Every test file under tests/, read as text: not the recorded fixtures, and not the mutants, which spell out breaks on purpose. */
function testFiles(dir = "tests"): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? (f === "fixtures" || f === "mutation" ? [] : testFiles(p)) : p.endsWith(".ts") ? [p] : [];
  });
}

test("no test reads games under the real scoreboard's name, so no run marks the real schedule as just read (section 0)", () => {
  const offenders = testFiles().filter((f) => /name:\s*"espn",\s*(listGames|firstDriveOf)/.test(read(f)));
  assert.deepEqual(offenders, [], "a test's feed is the run's own (testSchedule, testPlays)");
  assert.match(read("tests/db/fixture.ts"), /export const TEST_FEED = `test:feed:\$\{randomUUID\(\)\.slice\(0, 8\)\}`;/);
});

test("a margin past four either way stands in its slice, read from the axis's ends and never from its words (section 0)", () => {
  // The crash: "Packers by 7" made the axis ten slices labelled in words, and the column was found by reading "Bears by 7" as a number.
  const shift = marginShift("nfl");
  const unit = { singular: "point", plural: "points", margin: { shift: shift.toString(), home: "Packers", away: "Bears" } };
  const axisOf = (margins: bigint[]) => serialiseAxis(numberAxis(margins.map((m, i) => ({ id: `p${i}`, stake: 500n, value: shift + m })), unit)!);
  for (const m of [7n, -7n, 5n, -5n, 20n, -20n]) {
    const axis = axisOf([m]);
    assert.equal(axis.mode, "slices", `a margin of ${m} draws ten slices`);
    // As wide as the call either way, up to half the scale; a call past that stands on the end (3.40).
    const reach = (m < 0n ? -m : m) > shift ? shift : m < 0n ? -m : m;
    assert.deepEqual([axis.columns[0]!.label, axis.columns[4]!.label, axis.columns[9]!.label], [`Bears by ${reach}`, "Tie", `Packers by ${reach}`], "its labels stay words, a tie in the middle");
    assert.equal(columnOf(shift + m, axis), m > 0n ? 9 : 0, "the call stands at its own end");
  }
  const three = axisOf([7n, -7n, 3n]);
  assert.deepEqual([7n, -7n, 3n].map((m) => columnOf(shift + m, three)), [9, 0, 7], "everyone's call at the reveal, each in its slice");
  const near = axisOf([3n]);
  assert.equal(near.mode, "values", "four or under draws a column per point");
  assert.equal(columnOf(shift + 3n, near), Number(BigInt(near.hi) - BigInt(near.lo)), "the call in its own column at the high end");
  assert.equal(columnOf(shift + 30n, near), -1, "and a value with no column has none");
});

// ------------------------------------------------------------------------------------------ section 1: the lines

test("the owner's lines are the brief's table, in one file (section 1)", () => {
  assert.deepEqual([LINES.relayer.warn, LINES.relayer.urgent, LINES.relayer.urgentDays], [10n * MON, 5n * MON, 3]);
  assert.deepEqual([LINES.anthropic.warnCents, LINES.anthropic.urgentCents], [500n, 200n]);
  assert.deepEqual([LINES.database.limitBytes, LINES.database.warnPercent, LINES.database.urgentPercent], [500_000_000, 70, 90]);
  assert.deepEqual([LINES.storage.limitBytes, LINES.storage.warnPercent, LINES.storage.urgentPercent], [1_000_000_000, 70, 90]);
  assert.deepEqual([LINES.resend.dayLimit, LINES.resend.dayWarn, LINES.resend.dayUrgent, LINES.resend.monthLimit, LINES.resend.monthWarn, LINES.resend.monthUrgent], [100, 70, 90, 3_000, 2_100, 2_700]);
  assert.deepEqual([LINES.alchemy.limitCu, LINES.alchemy.warnPercent, LINES.alchemy.urgentPercent], [30_000_000, 70, 90]);
  assert.deepEqual([LINES.indexer.lifespanDays, LINES.indexer.warnDaysLeft, LINES.indexer.urgentDaysLeft], [30, 7, 3]);
  assert.equal(DOWN_TELLS_AFTER_MS, 10 * 60_000, "a core system down ten minutes reaches the owner");
  assert.equal(REFUSAL_HOLDS_MS, 60 * 60_000);
  assert.deepEqual(
    BY_HAND.map((h) => h.what),
    ["Vercel's Active CPU", "Supabase's egress"],
    "the two no API answers, named with where to read them",
  );
  assert.ok(BY_HAND.every((h) => h.url.startsWith("https://")) && BY_HAND[0].line.includes("2 of the Hobby plan's 4 hours") && BY_HAND[1].line.includes("70% of the free plan's 5 GB"));
});

test("the relayer is warned under ten MON and urgent under five or three days at the past week's rate, folding in its old email (section 1)", () => {
  assert.equal(relayerLevel(23n * MON, MON / 20n).state, "ok");
  assert.equal(relayerLevel(10n * MON, 0n).state, "ok", "exactly ten is not under ten");
  assert.equal(relayerLevel(10n * MON - 1n, 0n).state, "warn");
  assert.equal(relayerLevel(5n * MON - 1n, 0n).state, "urgent");
  assert.equal(relayerLevel(8n * MON, 3n * MON).state, "urgent", "eight MON at three a day is under three days");
  assert.match(relayerLevel(8n * MON, 3n * MON).why ?? "", /under 3 days/);
  assert.match(relayerLevel(23n * MON, MON).reading, /^23\.00 MON, about 23 days at the past week's rate of 1\.00 a day$/);
});

test("the model API's credit counts down from what was entered and is urgent on any answer saying it is gone, for an hour (section 1)", () => {
  const now = at("2026-10-10T12:00:00Z");
  const left = (cents: bigint) => ({ cents, enteredCents: 2_000n, enteredAt: at("2026-10-09T00:00:00Z"), spentCents: 2_000n - cents });
  assert.equal(creditLevel(null, null, now).state, "unread", "never entered: said, never guessed");
  assert.match(creditLevel(null, null, now).reading, /enter it on dareful\.app\/stats/);
  assert.equal(creditLevel(left(500n), null, now).state, "ok");
  assert.equal(creditLevel(left(499n), null, now).state, "warn");
  assert.equal(creditLevel(left(199n), null, now).state, "urgent");
  assert.equal(creditLevel(left(1_500n), kept("2026-10-10T11:30:00Z", "the credit balance is too low"), now).state, "urgent", "the API's own word beats the arithmetic");
  assert.equal(creditLevel(left(1_500n), kept("2026-10-10T10:59:00Z", "the credit balance is too low"), now).state, "ok", "an hour on, the refusal no longer holds the line");
});

test("Supabase's database and storage are warned at 70% and urgent at 90% of the free plan, Resend at 70 and 90 a day or 2,100 and 2,700 a month (section 1)", () => {
  assert.deepEqual(["database", "storage"].map((k) => percentLevel(k as "database", 0.69 * LINES[k as "database"].limitBytes).state), ["ok", "ok"]);
  assert.equal(percentLevel("database", 349_999_999).state, "ok", "69.99% is under seventy");
  assert.equal(percentLevel("database", 350_000_000).state, "warn");
  assert.equal(percentLevel("database", 450_000_000).state, "urgent");
  assert.equal(percentLevel("storage", 700_000_000).state, "warn");
  assert.equal(percentLevel("storage", 900_000_000).state, "urgent");
  assert.match(percentLevel("database", 40_529_043).reading, /^40\.5 MB of 500\.0 MB \(8%\)$/);
  assert.equal(percentLevel("database", 40_529_043, { ...LINES.database, warnPercent: 5 }).state, "warn", "a line lowered for a walk is crossed by today's 8%");
  assert.deepEqual(resendLevels(69, 2_099).map((l) => l.state), ["ok", "ok"]);
  assert.deepEqual(resendLevels(70, 2_100).map((l) => l.state), ["warn", "warn"]);
  assert.deepEqual(resendLevels(90, 2_700).map((l) => l.state), ["urgent", "urgent"]);
});

test("Alchemy is warned at 70% of the month's thirty million units and urgent at 90% or any refusal; the indexer at seven days left and three or a refusal (section 1)", () => {
  const now = at("2026-10-10T12:00:00Z");
  assert.equal(alchemyLevel(20_999_999, null, now).state, "ok");
  assert.equal(alchemyLevel(21_000_000, null, now).state, "warn");
  assert.equal(alchemyLevel(27_000_000, null, now).state, "urgent");
  assert.equal(alchemyLevel(1_000, kept("2026-10-10T11:59:00Z"), now).state, "urgent");
  const started = at("2026-09-19T02:19:24Z");
  assert.equal(indexerLevel(started, null, at("2026-10-09T12:00:00Z")).state, "ok", "nine whole days left");
  assert.equal(indexerLevel(started, null, at("2026-10-11T02:00:00Z")).state, "ok", "eight whole days left");
  assert.equal(indexerLevel(started, null, at("2026-10-11T03:00:00Z")).state, "warn", "seven whole days left");
  assert.equal(indexerLevel(started, null, at("2026-10-15T02:00:00Z")).state, "warn", "four");
  assert.equal(indexerLevel(started, null, at("2026-10-15T03:00:00Z")).state, "urgent", "three whole days left");
  assert.equal(indexerLevel(started, kept("2026-10-09T11:30:00Z"), at("2026-10-09T12:00:00Z")).state, "urgent", "a refusal of its hundred a minute");
  assert.match(indexerLevel(started, null, at("2026-10-09T12:00:00Z")).reading, /^started 2026-09-19, 9 days before/);
});

test("a level holds two alerts, past its warning line and past its urgent line, and a level that could not be read touches neither (section 1)", () => {
  const warn = relayerLevel(9n * MON, 0n);
  assert.deepEqual(
    alertsOf(warn).map((a) => [a.key, a.active]),
    [
      ["runway:relayer:warn", true],
      ["runway:relayer:urgent", false],
    ],
  );
  assert.deepEqual(alertsOf(relayerLevel(4n * MON, 0n)).map((a) => a.active), [true, true]);
  assert.deepEqual(alertsOf({ ...warn, state: "unread" }), []);
  assert.equal(alertsOf(warn, "test:x:")[0]?.key, "test:x:relayer:warn", "a test's own names");
});

// ------------------------------------------------------------------------------------------ sections 1 and 5: telling

test("an alert is told once when it begins, holds while it lasts, clears when it recovers, and is told again only after it begins again (sections 1 and 5)", () => {
  const t = (m: number) => new Date(Date.UTC(2026, 9, 10, 12, m));
  const first = alertStep(null, true, t(0), 0);
  assert.deepEqual([first.due, first.next.since?.toISOString()], [true, t(0).toISOString()]);
  const told = { since: first.next.since, toldAt: t(0) };
  assert.equal(alertStep(told, true, t(5), 0).due, false, "still past the line: not told again");
  const cleared = alertStep(told, false, t(10), 0);
  assert.deepEqual([cleared.cleared, cleared.next.since, cleared.next.toldAt], [true, null, null]);
  assert.equal(alertStep(cleared.next, true, t(15), 0).due, true, "crossed again: told again");
  assert.deepEqual(alertStep(null, false, t(0), 0), { next: { since: null, toldAt: null }, due: false, cleared: false });
});

test("the owner is told by one email and a push to each of his accounts' phones, and a telling counts as gone if either went (sections 1 and 5)", async () => {
  const sent: string[] = [];
  const teller = (emailWorks: boolean, pushWorks: boolean) =>
    tellerOf({ email: async (subject) => (sent.push(`email ${subject}`), emailWorks), push: async (id, n) => (sent.push(`push ${id} ${n.title}: ${n.body} -> ${n.url}`), pushWorks), owners: () => ["owner-1", "owner-2"] });
  assert.equal(await teller(true, false)("Dareful: x", "text", { title: "Dareful", body: "x" }), true);
  assert.deepEqual(sent, ["email Dareful: x", "push owner-1 Dareful: x -> /stats", "push owner-2 Dareful: x -> /stats"]);
  assert.equal(await teller(false, true)("s", "t", { title: "Dareful", body: "y" }), true, "a push alone is a telling");
  assert.equal(await teller(false, false)("s", "t", { title: "Dareful", body: "z" }), false, "nothing went: stays due");
});

test("a core system down is told only once it has been down ten minutes (section 5)", () => {
  const t = (m: number) => new Date(Date.UTC(2026, 9, 10, 12, m));
  const began = alertStep(null, true, t(0), DOWN_TELLS_AFTER_MS);
  assert.equal(began.due, false);
  assert.equal(alertStep(began.next, true, t(9), DOWN_TELLS_AFTER_MS).due, false);
  assert.equal(alertStep(began.next, true, t(10), DOWN_TELLS_AFTER_MS).due, true);
  assert.equal(alertStep(alertStep(began.next, false, t(4), DOWN_TELLS_AFTER_MS).next, true, t(11), DOWN_TELLS_AFTER_MS).due, false, "back up in between: the ten minutes start again");
});

// ------------------------------------------------------------------------------------------ section 1: what things cost

test("the RPC's calls are weighed at each method's units, a batch call by call, and only Alchemy's are counted (section 1)", () => {
  assert.deepEqual(methodsOf('{"jsonrpc":"2.0","id":1,"method":"eth_getBalance","params":[]}'), ["eth_getBalance"]);
  assert.deepEqual(methodsOf('[{"method":"eth_call"},{"method":"eth_blockNumber"}]'), ["eth_call", "eth_blockNumber"]);
  assert.deepEqual(methodsOf("not json"), []);
  assert.deepEqual(["eth_blockNumber", "eth_getBalance", "eth_call", "eth_sendRawTransaction", "eth_chainId", "eth_getLogs"].map(cuFor), [10, 20, 26, 40, 0, 60]);
  assert.equal(cuFor("eth_somethingNew"), UNLISTED_CU);
  assert.equal(UNLISTED_CU, 26, "a method the table does not list costs what an eth_call does, never nothing");
  assert.equal(refusalOf(429, ""), "rate");
  assert.equal(refusalOf(403, '{"error":{"code":-32600,"message":"Monthly capacity limit exceeded."}}'), "month");
  assert.equal(refusalOf(200, '{"result":"0x1"}'), null);
  assert.equal(refusalOf(500, "internal"), null);
  assert.equal(isAlchemy("https://monad-testnet.g.alchemy.com/v2/abc"), true);
  assert.equal(isAlchemy("https://testnet-rpc.monad.xyz"), false, "the audit's public RPC is nobody's quota");
});

test("a model answer is priced from its usage at the published prices, searches and cache included, and what is left never overstated (section 1)", () => {
  assert.equal(nanoOf("claude-haiku-5-5", { input: 1_000, output: 200, cacheRead: 0, cacheWrite: 0, searches: 0 }), 200_000n);
  assert.equal(nanoOf("claude-sonnet-5-5", { input: 1_000, output: 1_000, cacheRead: 0, cacheWrite: 0, searches: 2 }), 2_000_000n + 10_000_000n + 20_000_000n);
  assert.equal(nanoOf("claude-opus-5-5", { input: 0, output: 0, cacheRead: 1_000, cacheWrite: 1_000, searches: 0 }), 400_000n + 5_000_000n);
  assert.equal(nanoOf("some-new-model", { input: 1, output: 0, cacheRead: 0, cacheWrite: 0, searches: 0 }), 10_000n, "a model nobody priced is priced as the dearest");
  assert.deepEqual([centsUp(0n), centsUp(1n), centsUp(10_000_000n), centsUp(10_000_001n)], [0n, 1n, 1n, 2n]);
  assert.deepEqual(usageOf({ usage: { input_tokens: 5, output_tokens: 7, cache_read_input_tokens: 1, cache_creation_input_tokens: 2, server_tool_use: { web_search_requests: 3 } } }), { input: 5, output: 7, cacheRead: 1, cacheWrite: 2, searches: 3 });
  assert.deepEqual(usageOf({}), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, searches: 0 });
});

test("the API saying the credit is gone is known by its billing error or by the words it still sends with a 400 (section 1)", () => {
  assert.equal(outOfCredit(Object.assign(new Error("payment"), { status: 402 })), true);
  assert.equal(outOfCredit(Object.assign(new Error("x"), { type: "billing_error" })), true);
  assert.equal(outOfCredit(Object.assign(new Error("400 Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."), { status: 400 })), true);
  assert.equal(outOfCredit(Object.assign(new Error("overloaded"), { status: 529 })), false);
  assert.equal(outOfCredit("nothing"), false);
});

test("the credit the owner types is read as dollars and cents, and nothing else is taken (section 1)", () => {
  assert.deepEqual(["20", "12.5", "$1,250.07", "0.99"].map(centsFromTyped), [2_000n, 1_250n, 125_007n, 99n]);
  assert.deepEqual(["", "abc", "1.234", "-5", "1e3"].map(centsFromTyped), [null, null, null, null, null]);
});

test("every answer the model API gives is kept as its usage, the health check's one token included, and every send through Resend and every push is counted (section 1)", () => {
  const client = read("src/lib/ai/client.ts");
  assert.equal(client.match(/await recordAiCall\(/g)?.length, 3, "the unstreamed answer, the streamed one and the health check's");
  assert.ok(client.includes("noteIfOutOfCredit(err);"), "an answer saying the credit is gone is noted");
  const channels = read("src/lib/notify/channels.ts");
  assert.equal(channels.match(/\.emails\.send\(/g)?.length, 2);
  assert.ok(channels.includes('await recordSend("email", "ops", !error);') && channels.includes('await recordSend("email", "notice", !error);'), "both emails counted");
  assert.ok(channels.includes('await recordSend("push", kind, went);'), "every push tried counted");
  assert.ok(read("src/lib/chain/relayer.ts").includes("fetchFn: countedFetch"), "the relayer's calls are weighed");
  assert.equal(refusalDue(undefined, 0), true);
  assert.equal(refusalDue(0, REFUSAL_NOTE_EVERY_MS - 1), false, "a burst of refusals is one fact");
  assert.equal(refusalDue(0, REFUSAL_NOTE_EVERY_MS), true);
});

// ------------------------------------------------------------------------------------------ the pooler's queue

test("reads go in turns of three, never more in flight, each answer in its place, so the pooler's queue never gets deep (the ops round)", async () => {
  assert.equal(TURN, 3);
  let inFlight = 0;
  let most = 0;
  const task = (i: number) => async () => {
    inFlight += 1;
    most = Math.max(most, inFlight);
    await new Promise((r) => setTimeout(r, 5 + (i % 3) * 3));
    inFlight -= 1;
    return i * 10;
  };
  assert.deepEqual(await inTurns(Array.from({ length: 10 }, (_, i) => task(i))), [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
  assert.equal(most, 3, "never more than three at once");
  const [n, word] = await allInTurns([async () => 7, async () => "seven"]);
  assert.deepEqual([n, word], [7, "seven"]);
  for (const f of ["src/lib/usage/stats.ts", "src/lib/ops/runway.ts", "src/lib/ops/morning.ts"]) assert.ok(read(f).includes("allInTurns(["), `${f} reads in turns`);
});

// ------------------------------------------------------------------------------------------ section 2: health

test("a health run is its environment's, by the platform's own word, and only production's look at the core for the owner (section 2)", () => {
  assert.equal(hereEnv({ VERCEL_ENV: "production" }), "production");
  assert.equal(hereEnv({ VERCEL_ENV: "preview" }), "preview");
  assert.equal(hereEnv({ VERCEL_ENV: "development" }), "local", "the platform's own development server is a laptop's");
  assert.equal(hereEnv({}), "local", "a laptop, a test run, a script");
  assert.equal(watchesHere("production", false), true, "production tells the owner");
  assert.equal(watchesHere("local", false), false, "a laptop's run, with its own indexer and no tick, never tells the owner about production");
  assert.equal(watchesHere("preview", false), false);
  assert.equal(watchesHere("local", true), true, "a test with a teller of its own");
});

test("health's core rules: the tick within three minutes, a block within two, the indexer within a minute of the head (section 2)", () => {
  const now = at("2026-10-10T12:00:00Z");
  assert.equal(tickFresh(at("2026-10-10T11:57:00.001Z"), now), true);
  assert.equal(tickFresh(at("2026-10-10T11:57:00Z"), now), false);
  assert.equal(blockFresh(BigInt(Math.floor(now.getTime() / 1000) - 119), now), true);
  assert.equal(blockFresh(BigInt(Math.floor(now.getTime() / 1000) - 120), now), false);
  assert.equal(indexerCaughtUp(60_000), true);
  assert.equal(indexerCaughtUp(60_001), false);
});

test("the push check is down past half failing and slow past a fifth, from five sends; an hourly check's answer stands an hour unless it was down; a run is shared a minute (section 2)", () => {
  assert.deepEqual([pushState(4, 4), pushState(5, 3), pushState(5, 2), pushState(10, 2), pushState(10, 1)], ["ok", "down", "slow", "ok", "ok"]);
  const now = at("2026-10-10T12:00:00Z");
  const was = (iso: string, state: CheckResult["state"]) => ({ at: iso, state });
  assert.equal(stillStands(was("2026-10-10T11:00:00.001Z", "ok"), now, 3_600_000), true);
  assert.equal(stillStands(was("2026-10-10T11:00:00Z", "ok"), now, 3_600_000), false);
  assert.equal(stillStands(was("2026-10-10T11:59:00Z", "down"), now, 3_600_000), false, "a failure is asked again on the next run");
  assert.equal(stillStands(undefined, now, 3_600_000), false);
  assert.equal(shareable(at("2026-10-10T11:59:00.001Z"), now), true);
  assert.equal(shareable(at("2026-10-10T11:59:00Z"), now), false);
});

test("a check's answer carries a few plain words and never what a failure said: past its time it is down, past its slow mark slow (section 2)", async () => {
  const ctx = { now: at("2026-10-10T12:00:00Z"), head: Promise.resolve({ number: 1n, timestamp: 1n }) };
  const leaky = await runCheck({ name: "rpc", core: true, limitMs: 1_000, slowMs: 500, run: async () => { throw new Error("https://monad-testnet.g.alchemy.com/v2/SECRETKEY123 refused"); } }, ctx);
  assert.deepEqual([leaky.state, leaky.note], ["down", "failed"], "an unknown failure is 'failed', its text never repeated");
  const said = await runCheck({ name: "relayer", core: true, limitMs: 1_000, slowMs: 500, run: async () => { throw new Down("2.00 MON, under the 3.00 floor"); } }, ctx);
  assert.deepEqual([said.state, said.note], ["down", "2.00 MON, under the 3.00 floor"]);
  const late = await runCheck({ name: "resend", core: false, limitMs: 50, slowMs: 20, run: () => new Promise((r) => setTimeout(() => r(null), 200)) }, ctx);
  assert.deepEqual([late.state, late.note], ["down", "no answer in 0.05s"]);
  const slow = await runCheck({ name: "dynamic", core: false, limitMs: 500, slowMs: 20, run: () => new Promise((r) => setTimeout(() => r("fine"), 60)) }, ctx);
  assert.deepEqual([slow.state, slow.note], ["slow", "fine"]);
  assert.deepEqual([modelWords(Object.assign(new Error("Your credit balance is too low"), { status: 400 })), modelWords(Object.assign(new Error("x"), { status: 401 })), modelWords(new Error("Request timed out."))], ["the credit balance is too low", "the key was refused", "took too long"]);
  const route = read("src/app/api/health/route.ts");
  assert.ok(route.includes("checks: run.checks.map((c) => ({ name: c.name, core: c.core, state: c.state, ms: c.ms, note: c.note, at: c.at }))"), "the route answers the fields and nothing more");
  assert.ok(route.includes("status: run.ok ? 200 : 503"), "the core systems decide 200 or 503");
});

// ------------------------------------------------------------------------------------------ section 5: the morning email

test("the morning email goes from 8am Eastern, about the day before, and every failure is a span with when it began and ended (section 5)", () => {
  assert.equal(morningDue(at("2026-10-10T11:59:00Z")), false, "7:59am in October, Eastern daylight time");
  assert.equal(morningDue(at("2026-10-10T12:00:00Z")), true);
  assert.equal(morningDue(at("2026-12-10T12:59:00Z")), false, "7:59am in December, Eastern standard time");
  assert.equal(yesterdayOf(at("2026-10-10T12:00:00Z")), "2026-10-09");
  assert.equal(yesterdayOf(at("2026-11-01T12:00:00Z")), "2026-10-31");
  const c = (name: CheckResult["name"], state: CheckResult["state"], note: string | null = null): CheckResult => ({ name, core: true, state, ms: 1, note, at: "" });
  const runs = [
    { at: at("2026-10-10T03:00:00Z"), checks: [c("rpc", "ok"), c("indexer", "ok")] },
    { at: at("2026-10-10T03:05:00Z"), checks: [c("rpc", "down", "latest block 3 min ago"), c("indexer", "slow")] },
    { at: at("2026-10-10T03:10:00Z"), checks: [c("rpc", "down", "latest block 8 min ago"), c("indexer", "ok")] },
    { at: at("2026-10-10T03:15:00Z"), checks: [c("rpc", "ok"), c("indexer", "ok")] },
    { at: at("2026-10-10T04:00:00Z"), checks: [c("rpc", "down"), c("indexer", "ok")] },
  ];
  assert.deepEqual(
    failureSpans([...runs].reverse()).map((s) => [s.name, s.state, s.from.toISOString().slice(11, 16), s.to.toISOString().slice(11, 16), s.runs]),
    [
      ["indexer", "slow", "03:05", "03:05", 1],
      ["rpc", "down", "03:05", "03:10", 2],
      ["rpc", "down", "04:00", "04:00", 1],
    ],
  );
});

test("the morning email names every level against its lines, the two read by hand, each system, the canary, the model's cost, the errors and yesterday's numbers (section 5)", () => {
  const f: MorningFacts = {
    now: at("2026-10-10T12:00:00Z"),
    levels: [relayerLevel(9n * MON, 0n), percentLevel("database", 40_529_043)],
    latest: { at: at("2026-10-10T11:55:00Z"), checks: [{ name: "database", core: true, state: "ok", ms: 4, note: null, at: "" }] },
    spans: failureSpans([{ at: at("2026-10-10T03:05:00Z"), checks: [{ name: "rpc", core: true, state: "down", ms: 1, note: "latest block 3 min ago", at: "" }] }]),
    canary: [{ startedAt: at("2026-10-10T06:17:00Z"), ok: false, step: "indexer", error: "the hosted indexer did not show the settlement in time", ms: 90_000 }],
    canaryOff: null,
    ai: { cents: 42n, calls: 31 },
    errors: [{ cause: "nothing_came_back", n: 2 }],
    yesterday: { day: "2026-10-09", counts: { accounts: 3, guests: 1 } },
  };
  const { subject, text } = composeMorning(f);
  assert.equal(subject, "Dareful this morning has something to look at", "a level past its warning line, nothing urgent");
  for (const needed of ["RUNWAY", "The relayer's MON: 9.00 MON. Past the warning line (warned under 10.00 MON", "Supabase's database: 40.5 MB of 500.0 MB (8%). Fine", "Vercel's Active CPU: against 2 of the Hobby plan's 4 hours", "https://vercel.com/justinwenders-projects/~/usage", "Supabase's egress", "SYSTEMS", "At 11:55 UTC: database ok.", "- rpc down at 03:05 UTC: latest block 3 min ago", "THE CANARY", "- 06:17 UTC: failed at indexer: the hosted indexer did not show the settlement in time", "THE MODEL API", "$0.42 across 31 calls", "ERRORS PEOPLE SAW", "nothing came back 2", "YESTERDAY (2026-10-09, Eastern)", "- Accounts: 3", "- Guests: 1"]) {
    assert.ok(text.includes(needed), `the email says: ${needed}`);
  }
  assert.equal(composeMorning({ ...f, levels: [relayerLevel(4n * MON, 0n)] }).subject, "Dareful this morning needs you", "an urgent level");
  assert.equal(composeMorning({ ...f, levels: [], spans: [], canary: [], latest: null }).subject, "Dareful this morning is fine");
  assert.ok(composeMorning({ ...f, canaryOff: "CANARY_MNEMONIC is not set" }).text.includes("Off: CANARY_MNEMONIC is not set."));
});

test("health and the runway are read every five minutes from the tick, which records each run it finishes (sections 2 and 5)", () => {
  assert.deepEqual([0, 5, 55].map((m) => opsDue(new Date(Date.UTC(2026, 9, 10, 12, m)))), [true, true, true]);
  assert.deepEqual([1, 4, 59].map((m) => opsDue(new Date(Date.UTC(2026, 9, 10, 12, m)))), [false, false, false]);
  const tick = read("src/app/api/tick/route.ts");
  assert.ok(tick.indexOf("const ops = await opsTick(now);") > tick.indexOf("const report = await tick("), "after the ledger's jobs, never beside them");
  assert.ok(tick.includes("await beat(now, summary)"), "the run recorded once it is done");
  assert.ok(read("src/lib/ops/tick.ts").includes('    const run = await runHealth("tick", now).catch(say("the health checks failed"));\n    const runway = await watchRunway(now)'), "health, then the runway, one after the other");
});

// ------------------------------------------------------------------------------------------ section 4: the canary

test("the canary signs as two accounts of its own, from its own mnemonic, whose words never reach a log, and is off until one is set (section 4)", () => {
  assert.equal(canaryOff({} as NodeJS.ProcessEnv), "CANARY_MNEMONIC is not set");
  assert.equal(canaryOff({ CANARY_MNEMONIC: "x" } as unknown as NodeJS.ProcessEnv), null);
  const words = "test test test test test test test test test test test junk";
  const k = canaryKeys(words);
  const addresses = [k.a.ledger, k.a.governance, k.b.ledger, k.b.governance].map((a) => a.address);
  assert.equal(new Set(addresses).size, 4, "four keys, none shared: a governance key is never a ledger key");
  assert.deepEqual(canaryKeys(words).a.ledger.address, k.a.ledger.address, "the same mnemonic, the same accounts, run after run");
  assert.ok(!redactKeys(`the canary failed holding ${words}`, { CANARY_MNEMONIC: words }).includes(words), "its words come out of anything printed, by their value");
  const route = read("src/app/api/canary/route.ts");
  assert.ok(route.includes("if (!ok) return new NextResponse(null, { status: 404 });") && route.includes("const off = canaryOff();"), "secret first, then off until set");
});

// ------------------------------------------------------------------------------------------ section 3: outside the app

/** A stand-in for production: health, the home page and the picture, each as a test says. */
async function standIn(answers: { health: { status: number; body: unknown }; home: number; png: boolean; title?: string }): Promise<{ url: string; server: Server }> {
  const server = createServer((req, res) => {
    if (req.url === "/api/health") return res.writeHead(answers.health.status, { "content-type": "application/json" }).end(JSON.stringify(answers.health.body));
    if (req.url === "/") return res.writeHead(answers.home, { "content-type": "text/html" }).end(`<html><head><title>${answers.title ?? "Dareful"}</title></head></html>`);
    // A missing picture answers a page in its place, as an error page would.
    if (req.url === "/numbers") return answers.png ? res.writeHead(200, { "content-type": "image/png" }).end(Buffer.alloc(5_000, 1)) : res.writeHead(200, { "content-type": "text/html" }).end("<html>not a picture</html>");
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  return { url: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`, server };
}

function outsideCheck(url: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/ops/outside-check.mjs"], { env: { ...process.env, WATCH_URL: url, WATCH_PAUSE_MS: "10", GITHUB_STEP_SUMMARY: "" } });
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.on("close", (code) => resolve({ code: code ?? -1, out }));
  });
}

test("the outside check passes production that answers, and fails on a core system down, on a run kept as anywhere but production, on a page that does not answer, and on a missing picture (section 3)", async () => {
  const healthy = { ok: true, at: "2026-10-10T12:00:00Z", env: "production", checks: [{ name: "database", core: true, state: "ok", ms: 3, note: null }, { name: "resend", core: false, state: "down", ms: 3, note: "answered 500" }] };
  const cases: Array<[string, Parameters<typeof standIn>[0], number]> = [
    ["all up, a check that decides nothing down", { health: { status: 200, body: healthy }, home: 200, png: true }, 0],
    ["a core system down", { health: { status: 503, body: { ...healthy, ok: false, checks: [{ name: "tick", core: true, state: "down", ms: 3, note: "last ran 9 min ago" }] } }, home: 200, png: true }, 1],
    ["up, but a laptop's run (production stored its runs under another name)", { health: { status: 200, body: { ...healthy, env: "local" } }, home: 200, png: true }, 1],
    ["the home page down", { health: { status: 200, body: healthy }, home: 500, png: true }, 1],
    ["a home page that is not Dareful's", { health: { status: 200, body: healthy }, home: 200, png: true, title: "Domain parked" }, 1],
    ["no picture", { health: { status: 200, body: healthy }, home: 200, png: false }, 1],
  ];
  for (const [what, answers, code] of cases) {
    const s = await standIn(answers);
    try {
      const r = await outsideCheck(s.url);
      assert.equal(r.code, code, `${what}: ${r.out}`);
    } finally {
      s.server.close();
    }
  }
});

test("the outside watch runs every fifteen minutes and after every production deploy, and signs in every six hours once the secrets exist (section 3)", () => {
  const yml = read(".github/workflows/watch.yml");
  assert.ok(yml.includes('- cron: "*/15 * * * *"') && yml.includes('- cron: "7 */6 * * *"') && yml.includes("deployment_status:"));
  assert.ok(yml.includes("github.event.deployment_status.state == 'success' && github.event.deployment.environment == 'Production'"), "only a production deploy that succeeded");
  assert.ok(yml.includes("run: node scripts/ops/outside-check.mjs") && yml.includes("WATCH_URL: https://dareful.app"));
  assert.ok(yml.includes("github.event.schedule == '7 */6 * * *'") && yml.includes("WATCH_EMAIL: ${{ secrets.WATCH_EMAIL }}") && yml.includes("if: env.WATCH_EMAIL == '' || env.WATCH_CODE == ''"), "the sign-in pass skips, saying so, until the secrets exist");
  const signInSteps = yml.slice(yml.indexOf("  sign-in:"));
  const guard = "if: env.WATCH_EMAIL != '' && env.WATCH_CODE != ''";
  assert.equal(signInSteps.split(guard).length - 1, 4, "and every step that needs the browser waits for them: the checkout, Node, the browser and the pass (the pass's folder exists only once the browser step made it)");
  const signIn = read("scripts/ops/watch-sign-in.mjs");
  assert.ok(signIn.includes('(req.postData() ?? "").includes("/tips/")) return route.abort();'), "it marks no tip seen on a shared test account");
  assert.ok(!/^import .* from "playwright";$/m.test(signIn) && signIn.indexOf('await import("playwright")') > signIn.indexOf("if (!email || !code)"), "and it skips without a browser installed: the browser is loaded only after the secrets are checked");
});
