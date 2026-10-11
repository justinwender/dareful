/**
 * Pre-submission bug fixes 1 (2026-10-10), against the real database. Every row the health check's email line could
 * read is dated 1999 or carries a reason it never counts, and every kept line is under this run's own prefix, so nothing
 * here reaches production's health, its outbox or its morning email: a notice keeps why its email did not go; the day's
 * misses count only counted accounts' email failing; a line to the owner no channel carried is kept until one does, and
 * sent once; and a morning email that did not go is kept for the tick. Rows tracked and removed.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { and, eq, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { db, schema } from "@/db";
import { guardPool } from "@/db/pool";
import { appDatabaseUrl } from "@/db/url";
import { notifyPinLocked } from "@/lib/notify";
import { emailMisses } from "@/lib/notify/channels";
import { sendMorning } from "@/lib/ops/morning";
import { keepUntold, tellKept, tellOrKeep, UNTOLD_PREFIX } from "@/lib/ops/untold";
import { ensureUsd } from "@/lib/ledger/denominations";
import { createGroup } from "@/lib/ledger/groups";
import { draftMarket, feedWritesFor } from "@/lib/ledger/markets";
import { countStats } from "@/lib/usage/stats";
import { cleanup, tempUser, track } from "./fixture";

const RUN = randomUUID().slice(0, 8);
/** This run's own outbox: production's is `untold:`, which no test writes or reads. */
const P = `test:ops:${RUN}:untold:`;
/** A day nobody else's morning email claims (the ops suite's is 1999-06-15). */
const MORNING_DAY = "1999-06-18";
const day = (h: number, m = 0) => new Date(Date.UTC(1999, 5, 18, h, m));

/** The chain-write rows this file made, mined and completed so the tick never looks at them, removed after. */
const writeHashes: Buffer[] = [];

after(async () => {
  for (const h of writeHashes) await db.delete(schema.chainWrites).where(eq(schema.chainWrites.hash, h));
  await db.delete(schema.opsState).where(sql`${schema.opsState.key} like ${`${P}%`} or ${schema.opsState.key} = ${`morning:${MORNING_DAY}`}`);
  await cleanup();
});

test("a notice whose email did not go keeps why on its row: from a laptop, that email is off on purpose (section 1)", async () => {
  const owner = await tempUser("Skip owner");
  const host = await tempUser("Skip host");
  const seq = Math.floor(Math.random() * 1_000_000);
  await notifyPinLocked(owner.id, host.id, seq);
  const [row] = await db.select().from(schema.notificationLog).where(and(eq(schema.notificationLog.userId, owner.id), eq(schema.notificationLog.kind, "pin_locked"), eq(schema.notificationLog.seq, seq)));
  assert.ok(row, "the notice was claimed");
  assert.deepEqual([row.channels, row.emailSkipped, row.emailSkipCause], [[], "not_production", null], "no push to take it, and the email off here on purpose, said so on the row");
});

test("the day's misses are the counted accounts' email failing, by reason and cause, and nothing else (section 1)", async () => {
  const counted = await tempUser("Miss counted", undefined, { counted: true });
  const excluded = await tempUser("Miss excluded");
  const at = (h: number) => new Date(Date.UTC(1999, 5, 15, h));
  const row = (userId: string, emailSkipped: (typeof schema.notificationLog.$inferInsert)["emailSkipped"], emailSkipCause: string | null, createdAt: Date) => ({ userId, kind: "pin_locked" as const, seq: Math.floor(Math.random() * 1_000_000_000), causedBy: userId, emailSkipped, emailSkipCause, createdAt });
  await db.insert(schema.notificationLog).values([
    row(counted.id, "unread", "Dynamic answered 401", at(10)),
    row(counted.id, "unread", "Dynamic answered 401", at(11)),
    row(counted.id, "refused", "Resend said validation_error", at(11)),
    row(counted.id, "off", "EMAIL_FROM not set", at(12)),
    row(counted.id, "test_account", null, at(12)),
    row(counted.id, "no_address", null, at(12)),
    row(counted.id, "not_production", null, at(12)),
    row(counted.id, null, null, at(12)),
    row(counted.id, "refused", "Resend said too_old", new Date(Date.UTC(1999, 5, 14, 11))),
    row(counted.id, "refused", "Resend said after_now", at(14)),
    row(excluded.id, "refused", "Resend said a_test", at(12)),
  ]);
  const misses = await emailMisses(at(13));
  const mine = misses.filter((m) => m.cause !== null && /401|validation_error|EMAIL_FROM|too_old|after_now|a_test/.test(m.cause)).sort((a, b) => a.skip.localeCompare(b.skip));
  assert.deepEqual(mine, [
    { skip: "off", cause: "EMAIL_FROM not set", n: 1 },
    { skip: "refused", cause: "Resend said validation_error", n: 1 },
    { skip: "unread", cause: "Dynamic answered 401", n: 2 },
  ]);
});

test("a line to the owner no channel carried is kept until one does, sent late once, oldest first, and let go after three days (section 1)", async () => {
  const now = new Date();
  const subject = `kept ${RUN}`;
  const nope = async () => false;
  assert.equal(await tellOrKeep(`${subject} a`, "first", new Date(now.getTime() - 60_000), nope, P), false);
  const kept = await db.select().from(schema.opsState).where(like(schema.opsState.key, `${P}%`));
  assert.equal(kept.length, 1, "kept under the run's own prefix");
  assert.equal(await tellOrKeep(`${subject} x`, "never kept", now, nope), false);
  const leaked = await db.select({ key: schema.opsState.key }).from(schema.opsState).where(and(like(schema.opsState.key, `${UNTOLD_PREFIX}%`), sql`${schema.opsState.value}->>'subject' = ${`${subject} x`}`));
  assert.equal(leaked.length, 0, "a sender of a test's own keeps nothing in production's outbox");
  assert.equal(await tellOrKeep(`${subject} gone`, "went", now, async () => true, P), true);
  assert.equal((await db.select().from(schema.opsState).where(like(schema.opsState.key, `${P}%`))).length, 1, "one that went is not kept");

  assert.equal(await tellKept(now, nope, P), 0, "email still off: nothing went");
  const still = await db.select().from(schema.opsState).where(like(schema.opsState.key, `${P}%`));
  assert.deepEqual([still.length, still[0]?.at.getTime()], [1, kept[0]?.at.getTime()], "kept again as it was, its moment unchanged");

  await keepUntold(`${subject} b`, "second", now, P);
  await keepUntold(`${subject} old`, "stale", new Date(now.getTime() - 4 * 86_400_000), P);
  const sent: Array<{ subject: string; text: string }> = [];
  const slowYes = async (s: string, t: string) => (await new Promise((r) => setTimeout(r, 30)), sent.push({ subject: s, text: t }), true);
  const [x, y] = await Promise.all([tellKept(now, slowYes, P), tellKept(now, slowYes, P)]);
  assert.equal(x + y, 2, "two ticks at once send each kept line once");
  assert.deepEqual(sent.map((s) => s.subject), [`${subject} a`, `${subject} b`], "oldest first, and the one past three days let go");
  assert.ok(sent[0]?.text.startsWith("This could not be sent at ") && sent[0].text.endsWith("\n\nfirst"), "sent late, saying so");
  assert.equal((await db.select().from(schema.opsState).where(like(schema.opsState.key, `${P}%`))).length, 0, "nothing kept once it went");
});

test("a morning email no channel carried is kept for the tick (section 1)", async () => {
  const keptHere: string[] = [];
  assert.equal(await sendMorning(day(16), async () => false, async (subject) => void keptHere.push(subject)), "failed");
  assert.equal(keptHere.length, 1, "kept");
  assert.ok(keptHere[0]?.startsWith("Dareful this morning"));
  const [state] = await db.select().from(schema.opsState).where(eq(schema.opsState.key, `morning:${MORNING_DAY}`));
  assert.deepEqual(state?.value, { sent: false });
});

// ------------------------------------------------------------------------------------------ section 2

/** A pool as the app makes one, over the transaction pooler: five connections, no prepared statements. */
const bare = () => postgres(appDatabaseUrl(process.env.DATABASE_URL), { max: 5, idle_timeout: 20, prepare: false });
/** Whether every one answers within the time, or the lot is still waiting. */
const answersWithin = (ms: number, work: Promise<unknown>) => Promise.race([work.then(() => "answered" as const), new Promise<"stalled">((r) => setTimeout(() => r("stalled"), ms).unref())]);
const AT_ONCE = 40;
/** The one device the counting test's rows carry (section 3), by which they are removed. */
const NOBODYS_DEVICE = "00000000-0000-4000-8000-0000000b0f01";

test("forty parameterless queries at once stall a bare pool over Supabase's transaction pooler, and every one answers through the guard and through the app's own client (section 2)", async () => {
  const loose = bare();
  try {
    assert.equal(await answersWithin(8_000, Promise.all(Array.from({ length: AT_ONCE }, () => loose.unsafe("select 1")))), "stalled", "the stall, reproduced: the driver queues them behind each other and the pooler stops answering");
  } finally {
    await loose.end({ timeout: 0 }).catch(() => undefined);
  }
  const guard = guardPool(bare, { slots: 5 });
  try {
    assert.equal(await answersWithin(8_000, Promise.all(Array.from({ length: AT_ONCE }, () => guard.client.unsafe("select 1") as unknown as Promise<unknown>))), "answered");
  } finally {
    await guard.client.end({ timeout: 0 });
  }
  // A client that stalls is ended before the assertion fails: what it held would otherwise keep the run open for good,
  // and the run would end on a timeout instead of this failure.
  const fail = async (answered: string) => (answered === "answered" ? answered : (await db.$client.end({ timeout: 0 }).catch(() => undefined), answered));
  assert.equal(await fail(await answersWithin(8_000, Promise.all(Array.from({ length: AT_ONCE }, () => db.execute(sql`select 1`))))), "answered", "the app's client is guarded");
  assert.equal(await fail(await answersWithin(8_000, Promise.all([...Array.from({ length: 10 }, () => db.transaction((tx) => tx.execute(sql`select 1`))), ...Array.from({ length: AT_ONCE }, () => db.execute(sql`select 2`))]))), "answered", "transactions and queries together");
});

test("a pool that stops answering is replaced within seconds: what it held fails at once, and what waited answers on a fresh one (section 2)", async () => {
  // Five statements hold every slot past the limit and a read waits behind them: a pool answering nothing, as one the
  // pooler stalled was (the stall itself is the test above, and the guard keeps it from happening).
  const replaced: string[] = [];
  const guard = guardPool(bare, { slots: 5, stallMs: 1_500, onReplace: (why) => void replaced.push(why) });
  try {
    const started = Date.now();
    const settle = (p: unknown) => (p as Promise<unknown>).then(() => "answered", (e: { code?: string }) => e.code ?? "failed");
    const holding = Array.from({ length: 5 }, () => settle(guard.client.unsafe("select pg_sleep(5)")));
    const waited = settle(guard.client.unsafe("select 1"));
    // Bounded, so a pool never replaced fails here (and `finally` ends it) instead of holding the run open.
    assert.equal(await answersWithin(4_500, waited), "answered", "the waiting read answered on a fresh pool, before the five ended");
    assert.equal(await waited, "answered");
    assert.ok(Date.now() - started < 4_500);
    assert.equal(replaced.length, 1, "replaced once");
    assert.deepEqual(await Promise.all(holding), Array(5).fill("CONNECTION_DESTROYED"), "what the pool held failed at once");
  } finally {
    await guard.client.end({ timeout: 0 });
  }
});

test("a transaction holds one slot from its begin to its end and asks through its own client without one; what it asks of the app's client takes the slot no transaction can hold, past a transaction waiting for its own (section 2)", async () => {
  // Two slots: one a transaction may hold, one only reads may (src/db/pool.ts).
  const guard = guardPool(bare, { slots: 2, stallMs: 60_000 });
  const gdb = drizzle(guard.client);
  const started = Date.now();
  let release: () => void = () => undefined;
  const held = new Promise<void>((r) => (release = r));
  let ownAt: number | null = null;
  let plainAt: number | null = null;
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
  try {
    // Started now (drizzle's query waits for a `then`): the read slot, held for two seconds.
    const sleeping = gdb.execute(sql`select pg_sleep(2)`).then(() => undefined);
    await pause(100);
    const first = gdb.transaction(async (tx) => {
      await tx.execute(sql`select 1`);
      ownAt = Date.now() - started;
      await gdb.execute(sql`select 3`);
      plainAt = Date.now() - started;
      await held;
    });
    const second = gdb.transaction(async (tx) => tx.execute(sql`select 2`));
    await pause(900);
    assert.ok(ownAt !== null && ownAt < 1_500, `the transaction's own query took no slot: it answered at ${ownAt}ms, with both slots taken`);
    assert.equal(plainAt, null, "what it asks of the app's client waits for the read slot");
    assert.deepEqual(guard.stats(), { inFlight: 2, waiting: 2, replaced: 0 }, "the second transaction and the inner read both wait");
    await sleeping;
    await pause(400);
    assert.ok(plainAt !== null, "the inner read took the read slot once it was free");
    assert.deepEqual(guard.stats(), { inFlight: 1, waiting: 1, replaced: 0 }, "past the second transaction, which waits for the first's slot as long as the first lives");
    release();
    await first;
    await second;
    assert.deepEqual(guard.stats(), { inFlight: 0, waiting: 0, replaced: 0 }, "and goes once it ends");
  } finally {
    release();
    await guard.client.end({ timeout: 0 });
  }
});

// ------------------------------------------------------------------------------------------ section 3

test("the final-score writes a question was sent are read with the ruling each carried, and nothing else is taken for one (section 3)", async () => {
  const dareId = randomUUID();
  const row = (kind: string, subject: unknown) => {
    const hash = Buffer.from(randomUUID().replaceAll("-", "").repeat(2), "hex");
    writeHashes.push(hash);
    return { hash, label: `test ${RUN}`, kind, subject: typeof subject === "string" ? subject : JSON.stringify(subject), nonce: 0, raw: Buffer.from([0]), status: "mined", completedAt: new Date(), blockNumber: 1n };
  };
  const feedHash = "0x" + "cd".repeat(32);
  await db.insert(schema.chainWrites).values([
    row("feed", { dareId, rulingText: "Decided by the final score, as the terms said.", rulingHash: feedHash, ending: "agreed" }),
    row("arbitrate", { dareId, rulingText: "The tiebreaker's words.", rulingHash: "0x" + "ef".repeat(32), by: "arbitration" }),
    row("feed", { dareId: randomUUID(), rulingText: "Another question's.", rulingHash: "0x" + "12".repeat(32), ending: "alone" }),
    row("feed", { dareId: randomUUID(), rulingText: `Another question's, naming ${dareId} in its words.`, rulingHash: "0x" + "34".repeat(32), ending: "alone" }),
    row("feed", `not json, though it names ${dareId}`),
  ]);
  assert.deepEqual(await feedWritesFor(dareId), [{ rulingHash: feedHash, rulingText: "Decided by the final score, as the terms said.", ending: "agreed" }]);
});

test("an event with nobody on it counts only for a question a counted person asked or is in: a test account's question never moves a number, however it ends (section 3)", async () => {
  // A window nobody else has events in; the questions are drafts, which the tick never closes, expires or settles.
  const at = new Date("2002-03-03T17:00:00Z");
  const w = { from: new Date("2002-03-03T05:00:00Z"), to: new Date("2002-03-04T05:00:00Z") };
  const [asker, judge] = await Promise.all([tempUser("Asker", undefined, { counted: true }), tempUser("Judge")]);
  const g = await createGroup({ name: `nobody's events ${RUN} (temporary)`, createdBy: asker.id });
  track.group(g.id);
  await db.insert(schema.groupMembers).values({ groupId: g.id, userId: judge.id });
  const usd = await ensureUsd(g.id, asker.id);
  const ask = (creatorId: string, title: string) => draftMarket({ creatorId, groupId: g.id, denomId: usd.id, title, termsText: "Yes if it happens. No if it does not.", resolvesBy: new Date(Date.now() + 86_400_000) });
  const [judges, joined, counted] = await Promise.all([ask(judge.id, "A judge's question nobody counted joined?"), ask(judge.id, "A judge's question a counted person joined?"), ask(asker.id, "A counted asker's question?")]);
  await db.insert(schema.darePositions).values([
    { dareId: judges.id, userId: judge.id, stake: 500n, value: 7000n, enteredBy: judge.id, acknowledgedAt: at },
    { dareId: joined.id, userId: asker.id, stake: 500n, value: 3000n, enteredBy: asker.id, acknowledgedAt: at },
  ]);
  // Every row carries this file's one device, so a row with no question behind it (the game's link) is removed by it,
  // before and after, whatever a run under a mutant left behind.
  const wipe = () => db.delete(schema.usageEvents).where(eq(schema.usageEvents.deviceId, NOBODYS_DEVICE));
  const nobodys = (dareId: string) => [
    { name: "settled", dareId, deviceId: NOBODYS_DEVICE, at, props: { by: "expired", outcome: "none" } },
    { name: "link_opened", dareId, deviceId: NOBODYS_DEVICE, at, props: { link: "market", signedIn: false, installed: false } },
  ];
  await wipe();
  try {
    await db.insert(schema.usageEvents).values([...nobodys(judges.id), ...nobodys(joined.id), ...nobodys(counted.id), { name: "link_opened", deviceId: NOBODYS_DEVICE, at, props: { link: "game", signedIn: false, installed: false } }]);
    const day = await countStats(w);
    assert.equal(day.expired, 2, "the judge's question that nobody counted joined never counts; one a counted person joined does, and a counted asker's always");
    assert.equal(day.link_opens, 3, "the same for a link opened on a phone with no account, and one on no question at all counts as ever");
  } finally {
    await wipe();
  }
});
