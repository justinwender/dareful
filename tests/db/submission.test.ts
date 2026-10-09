/**
 * The submission round (2026-10-09), against the real database: a typed code opens its question for a guest without
 * joining anyone, its misses counted against the network; pass the phone handed over by the asker before their call;
 * the public numbers' four by /stats's own definitions, and a day already written gaining them; test accounts left
 * out of every count from the moment they are made; and an empty Now's starters never a game that has started (the
 * audit's survivor). Rows tracked and removed.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { ensureUsd } from "@/lib/ledger/denominations";
import { createGroup } from "@/lib/ledger/groups";
import { canHandOver } from "@/lib/ledger/hand-over";
import * as markets from "@/lib/ledger/markets";
import { CODE_GUESSES_PER_HOUR, marketForCode, roomCodeFor } from "@/lib/ledger/rooms";
import { starterGames, upsertGames } from "@/lib/sports";
import { parseScoreboard } from "@/lib/sports/espn";
import { countStats, dayWindow, peopleAndQuestions, refreshSnapshotPeople, windowFor } from "@/lib/usage/stats";
import { publicNumbers } from "@/lib/usage/public-numbers";
import { BEFORE_LAUNCH, cleanup, tempSigner, tempUser, track, type Signer, type User } from "./fixture";

let sam: Signer, maya: Signer, theo: Signer;
/** This run's own networks: random, so no other run's or real guest's misses are ever counted or removed here. */
const NET = `test-net-${randomUUID()}`;
const OLD_NET = `test-net-${randomUUID()}`;
const DAY = "2004-04-04";
before(async () => {
  [sam, maya, theo] = await Promise.all(["Sam", "Maya", "Theo"].map((n) => tempSigner(n)));
});
after(async () => {
  await db.delete(schema.codeAttempts).where(inArray(schema.codeAttempts.networkHash, [NET, OLD_NET]));
  await db.delete(schema.usageSnapshots).where(eq(schema.usageSnapshots.day, DAY));
  await cleanup();
});

async function question(title: string) {
  const g = await createGroup({ name: "submission check (temporary)", createdBy: sam.user.id });
  track.group(g.id);
  await db.insert(schema.groupMembers).values({ groupId: g.id, userId: maya.user.id });
  const usd = await ensureUsd(g.id, sam.user.id);
  const d0 = await markets.draftMarket({ creatorId: sam.user.id, groupId: g.id, denomId: usd.id, title, termsText: "Yes if it happens tonight.", resolvesBy: new Date(Date.now() + 3_600_000) });
  const d = await markets.openMarket(d0.id, sam.user.id, await sam.ledger.signTypedData(markets.createTypedData(d0)));
  return { d, g: g.id };
}

test("a typed code is its question's link for a guest: it opens the question and joins nobody, a code that matches nothing costs the network a guess, twenty an hour is the limit, and a guest's misses older than a day are not kept", async () => {
  const { d, g } = await question("Does the kettle get descaled by Friday?");
  const code = await roomCodeFor(d.id, sam.user.id);
  const seatsBefore = (await db.select().from(schema.groupMembers).where(eq(schema.groupMembers.groupId, g))).length;
  const found = await marketForCode(code.toLowerCase(), { network: NET });
  assert.equal(found.id, d.id, "the code's question, as its link would open it");
  assert.equal((await db.select().from(schema.groupMembers).where(eq(schema.groupMembers.groupId, g))).length, seatsBefore, "nobody joined anything: a guest joins with a name on the question");
  const misses = async () => (await db.select().from(schema.codeAttempts).where(eq(schema.codeAttempts.networkHash, NET))).length;
  assert.equal(await misses(), 0, "a code that matched cost nothing");
  await db.insert(schema.codeAttempts).values({ networkHash: OLD_NET, createdAt: new Date(Date.now() - 2 * 86_400_000) });
  // A code with the right shape that no live question holds.
  const wrong = code === "XXXXXX" ? "YYYYYY" : "XXXXXX";
  await assert.rejects(marketForCode(wrong, { network: NET }), (err: unknown) => err instanceof markets.MarketError && err.code === "not_found");
  assert.equal(await misses(), 1, "the miss is counted against the network it came from");
  assert.equal((await db.select().from(schema.codeAttempts).where(eq(schema.codeAttempts.networkHash, OLD_NET))).length, 0, "and a guest's misses from days ago are gone");
  await db.insert(schema.codeAttempts).values(Array.from({ length: CODE_GUESSES_PER_HOUR - 1 }, () => ({ networkHash: NET })));
  await assert.rejects(marketForCode(wrong, { network: NET }), (err: unknown) => err instanceof markets.MarketError && err.code === "slow_down", "twenty misses an hour from one network is the limit");
  await assert.rejects(marketForCode("O1", { network: NET }), (err: unknown) => err instanceof markets.MarketError && err.code === "bad_input", "a wrong shape is the field's, before any guess");
  // Closed, the code opens nothing.
  await db.update(schema.dares).set({ lockedAt: new Date() }).where(eq(schema.dares.id, d.id));
  await db.delete(schema.codeAttempts).where(eq(schema.codeAttempts.networkHash, NET));
  await assert.rejects(marketForCode(code, { network: NET }), (err: unknown) => err instanceof markets.MarketError && err.code === "not_found");
});

test("pass the phone is the asker's to hand over before their own call and anyone's who is in, while the question is open, and nobody else's", async () => {
  const { d } = await question("Does the train leave on time?");
  assert.equal(await canHandOver(d.id, sam.user.id), true, "the asker, before their call");
  assert.equal(await canHandOver(d.id, maya.user.id), false, "someone in the set who is not in");
  assert.equal(await canHandOver(d.id, theo.user.id), false, "someone outside it");
  await markets.enterMarket({ dareId: d.id, userId: maya.user.id, stake: 500n, value: 6000n, signature: await maya.ledger.signTypedData(markets.enterTypedData(d, 500n, 6000n)) });
  assert.equal(await canHandOver(d.id, maya.user.id), true, "once in");
  await db.update(schema.dares).set({ lockedAt: new Date() }).where(eq(schema.dares.id, d.id));
  assert.equal(await canHandOver(d.id, sam.user.id), false, "nobody once it is closed");
  assert.equal(await canHandOver(d.id, maya.user.id), false);
});

test("the public numbers: accounts and guests apart, questions asked and settled, each by /stats's own definitions in a day long before launch, and a day already written gains them", async () => {
  const w = dayWindow(DAY);
  const at = (h: number) => new Date(w.from!.getTime() + h * 3_600_000);
  const asker = await tempUser("Counted asker", undefined, { counted: true });
  const quiet = await tempUser("Counted quiet", undefined, { counted: true });
  const test = await tempUser("Excluded");
  await db.update(schema.users).set({ createdAt: at(1) }).where(inArray(schema.users.id, [asker.id, quiet.id, test.id]));
  const g = await createGroup({ name: "public numbers check (temporary)", createdBy: asker.id });
  track.group(g.id);
  await db.insert(schema.groupMembers).values([quiet, test].map((u) => ({ groupId: g.id, userId: u.id })));
  const usd = await ensureUsd(g.id, asker.id);
  const ask = async (who: User, more: Partial<typeof schema.dares.$inferInsert> = {}, sent = true) => {
    const d = await markets.draftMarket({ creatorId: who.id, groupId: g.id, denomId: usd.id, title: "Does the count land?", termsText: "Yes if it does. No if not.", resolvesBy: new Date(Date.now() + 3_600_000) });
    await db.update(schema.dares).set({ creatorSignature: sent ? Buffer.from("01", "hex") : null, createdAt: at(2), ...more }).where(eq(schema.dares.id, d.id));
    return d.id;
  };
  const settled = await ask(asker, { resolvedAt: at(5), resolvedBy: "quorum", resolvedOutcome: 1n });
  await ask(asker, { resolvedAt: at(5), resolvedBy: "expired" });
  await ask(asker, { resolvedAt: at(5), resolvedBy: "removed" });
  await ask(asker, {}, false);
  const testsOwn = await ask(test, { resolvedAt: at(5), resolvedBy: "quorum", resolvedOutcome: 1n });
  const guest = async (name: string, dareId: string, more: Partial<typeof schema.participantClaims.$inferInsert> = {}) => {
    const [c] = await db.insert(schema.participantClaims).values({ displayName: name, createdBy: asker.id, ...more }).returning({ id: schema.participantClaims.id });
    track.claim(c!.id);
    await db.insert(schema.darePositions).values({ dareId, claimId: c!.id, stake: 100n, value: 5000n, enteredBy: asker.id, enteredAt: at(3), acknowledgedAt: at(3) });
    return c!.id;
  };
  await guest("Gabe", settled);
  await guest("Bound", settled, { claimedBy: quiet.id, claimedAt: at(4) });
  await guest("Left out", settled, { excludedFromCounts: true });
  await guest("On a test's question", testsOwn);

  const four = await peopleAndQuestions(w);
  assert.deepEqual(four, { accounts: 2, guests: 1, questions: 3, settled: 1 }, "two counted accounts and one guest; three questions sent, one settled; the test's, the draft, the bound guest, the excluded one and a test's guest nowhere");
  const all = await countStats(w);
  assert.deepEqual([all.accounts, all.guests, all.questions, all.settled], [2, 1, 3, 1], "the owner's page counts them the same way");
  assert.deepEqual(await peopleAndQuestions(dayWindow("2004-04-05")), { accounts: 0, guests: 0, questions: 0, settled: 0 }, "the window holds");

  await db.insert(schema.usageSnapshots).values({ day: DAY, counts: { shares: 7 } }).onConflictDoUpdate({ target: schema.usageSnapshots.day, set: { counts: { shares: 7 } } });
  const refreshed = await refreshSnapshotPeople(true, [DAY]);
  assert.deepEqual(refreshed.map((r) => r.day), [DAY], "only the day asked for");
  const [row] = await db.select().from(schema.usageSnapshots).where(eq(schema.usageSnapshots.day, DAY));
  assert.deepEqual(row?.counts, { shares: 7, accounts: 2, guests: 1, questions: 3, settled: 1 }, "the day gains the four and keeps what it was taken with");
});

test("the public numbers are /stats's own four since launch, with real use on the chain beside them, read at the moment they were asked for", async () => {
  const now = new Date();
  const n = await publicNumbers(now);
  const four = await peopleAndQuestions(windowFor("launch", now));
  assert.deepEqual({ accounts: n.accounts, guests: n.guests, questions: n.questions, settled: n.settled }, four, "the same queries over the same window");
  assert.equal(n.at, now.toISOString());
  assert.ok(n.chain !== null && [n.chain.obligations, n.chain.questions, n.chain.people, n.chain.sets].every((x) => Number.isInteger(x) && x >= 0), "the chain's four, from the indexer");
});

test("a test account is left out of every count from the moment it is made, unless a test about counting asks for one, made long before launch", async () => {
  const plain = await tempUser("Plain");
  const counted = await tempUser("Counted", undefined, { counted: true });
  const signer = await tempSigner("Signer");
  assert.equal(plain.excludedFromCounts, true);
  assert.equal(signer.user.excludedFromCounts, true);
  assert.equal(counted.excludedFromCounts, false);
  assert.equal(counted.createdAt.toISOString(), BEFORE_LAUNCH.toISOString());
  const [{ n }] = (await db.execute(sql`select count(*)::int as n from users where id = ${plain.id} and not excluded_from_counts`)) as unknown as Array<{ n: number }>;
  assert.equal(n, 0);

});

test("an empty Now's starters are games still ahead of the moment asked about: one that has started is never offered", async () => {
  // Two games of this run's own, written straight to the table (never `syncSchedule`, which marks the real feed as just
  // read), set a day either side of a moment long before anything real, so the starters asked for then are about them.
  const prefix = track.gamePrefix(`test:starters:${randomUUID().slice(0, 8)}:`);
  const recorded = parseScoreboard("nfl", JSON.parse(readFileSync(new URL("../fixtures/sports/espn-nfl-scheduled.json", import.meta.url), "utf8")) as unknown);
  const [a, b] = recorded;
  assert.ok(a && b, "two recorded games");
  const started = { ...a, sourceId: `${prefix}started`, startsAt: new Date("2000-01-01T12:00:00Z") };
  const ahead = { ...b, sourceId: `${prefix}ahead`, startsAt: new Date("2000-01-03T12:00:00Z") };
  await upsertGames([started, ahead], new Date());
  const offered = (await starterGames(new Date("2000-01-02T12:00:00Z"))).map((g) => g.sourceId);
  assert.ok(offered.includes(ahead.sourceId), "the game still ahead is offered");
  assert.ok(!offered.includes(started.sourceId), "the one that has started is not");
});
