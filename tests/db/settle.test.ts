/**
 * The settler against the real database, with no chain: lock is written into the mirror, as in the other
 * market tests. The tick is always scoped to the questions this file made, because the database is the real one.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { askedRecord } from "@/lib/ledger/you";
import { warningSendTime } from "@/lib/notify/messages";
import { notAllowed } from "@/lib/ui/errors";
import { ensureUsd } from "@/lib/ledger/denominations";
import { createGroup } from "@/lib/ledger/groups";
import * as markets from "@/lib/ledger/markets";
import { cleanResolution, decidedUnresolved, stateCase, tick } from "@/lib/ledger/settle";
import { sayItHappened } from "@/lib/ledger/calls";
import { cleanup, codeOf, itHappened, tempSigner, track, type Signer } from "./fixture";

let ana: Signer, ben: Signer, cy: Signer;
before(async () => {
  [ana, ben, cy] = await Promise.all(["Ana", "Ben", "Cy"].map((n) => tempSigner(n)));
});
after(cleanup);

async function question(over: Partial<markets.DraftInput> = {}) {
  const g = await createGroup({ name: "settle check (temporary)", createdBy: ana.user.id });
  track.group(g.id);
  await db.insert(schema.groupMembers).values([ben, cy].map((p) => ({ groupId: g.id, userId: p.user.id })));
  const usd = await ensureUsd(g.id, ana.user.id);
  const d0 = await markets.draftMarket({ creatorId: ana.user.id, groupId: g.id, denomId: usd.id, title: "Is the Holland Tunnel longer than the Lincoln?", termsText: "Yes if the Holland Tunnel's longest tube is longer. Decided by official tube length.", resolvesBy: new Date(Date.now() + 3_600_000), ...over });
  const d = await markets.openMarket(d0.id, ana.user.id, await ana.ledger.signTypedData(markets.createTypedData(d0)));
  const enter = async (who: Signer, bps: bigint) => markets.enterMarket({ dareId: d.id, userId: who.user.id, stake: 1000n, value: bps, signature: await who.ledger.signTypedData(markets.enterTypedData(d, 1000n, bps)) });
  return { d, enter };
}
const lockInMirror = (id: string, set: Partial<typeof schema.dares.$inferInsert> = {}) => db.update(schema.dares).set({ lockedAt: new Date(), onchainId: Buffer.from(id.replace(/-/g, "").padEnd(64, "0"), "hex"), ...set }).where(eq(schema.dares.id, id));

test("an argument is signed as due at once, carries its tier and criterion, and refuses terms that leave the criterion out", async () => {
  const { d } = await question({ pace: "argument", resolvesBy: null, tier: "contestable", criterion: "by official tube length" });
  assert.deepEqual([d.pace, d.tier, d.criterion, d.resolvesBy], ["argument", "contestable", "by official tube length", null]);
  assert.equal(markets.createTypedData(d).message.resolvesBy, 0n);
  assert.equal(markets.createTypedData(d).message.pace, 1);
  assert.equal(await codeOf(() => question({ pace: "argument", resolvesBy: null, tier: "contestable", criterion: "by how famous it is" })), "bad_input", "the criterion is part of what is hashed and what entering accepts");
});

test("an argument is between two people: a third number is refused, and either of the two can still change theirs", async () => {
  const { d, enter } = await question({ pace: "argument", resolvesBy: null, tier: "checkable" });
  await enter(ana, 10_000n);
  await enter(ben, 0n);
  assert.equal(await codeOf(() => enter(cy, 5000n)), "wrong_state");
  await enter(ben, 2000n);
  assert.equal((await markets.positionsOf(d.id)).find((p) => p.userId === ben.user.id)?.value, 2000n);
});

test("a case is kept apart from what happened, only someone who is in can make one, and never under the void rule", async () => {
  const { d, enter } = await question();
  await enter(ana, 8000n);
  await enter(ben, 2000n);
  assert.equal(await codeOf(() => stateCase(d.id, ana.user.id, "too early")), "wrong_state");
  await lockInMirror(d.id);
  assert.equal(await codeOf(() => markets.sayWhatHappened(d.id, ana.user.id, "We measured it.")), "wrong_state", "closed, and nothing has happened yet: calls are in");
  await itHappened(d.id);
  await markets.sayWhatHappened(d.id, ana.user.id, "We measured it.");
  await stateCase(d.id, ana.user.id, "The north tube is 8,558 feet.");
  await stateCase(d.id, ana.user.id, "The north tube is 8,558 feet, per the Port Authority.");
  const rows = await db.select().from(schema.dareStatements).where(eq(schema.dareStatements.dareId, d.id));
  assert.deepEqual(rows.map((r) => `${r.kind}:${r.statement}`).sort(), ["statement:The north tube is 8,558 feet, per the Port Authority.", "update:We measured it."]);
  assert.equal(await codeOf(() => stateCase(d.id, cy.user.id, "I have views")), "not_member", "cy can see it and vote on it, but has no side to argue");
  const v = await question({ stalemate: "void" });
  await v.enter(ana, 8000n);
  await v.enter(ben, 2000n);
  await lockInMirror(v.d.id);
  assert.equal(await codeOf(() => stateCase(v.d.id, ana.user.id, "hear me out")), "wrong_state");
});

test("the toll: a void by the group or by the arbitrator counts against whoever wrote the terms, expiry counts against nobody, and only a question two or more were in is counted", async () => {
  const dana = await tempSigner("Dana");
  const eli = await tempSigner("Eli");
  const before = await cleanResolution(dana.user.id);
  assert.deepEqual(before, { ended: 0, clean: 0 });
  const g = await createGroup({ name: "toll check (temporary)", createdBy: dana.user.id });
  track.group(g.id);
  const usd = await ensureUsd(g.id, dana.user.id);
  const end = async (resolvedBy: string, outcome: bigint | null, people: Array<{ user: { id: string } }> = [dana, eli]) => {
    const d = await markets.draftMarket({ creatorId: dana.user.id, groupId: g.id, denomId: usd.id, title: "Toll check?", termsText: "Yes if it happens.", resolvesBy: new Date(Date.now() + 3_600_000) });
    await db.update(schema.dares).set({ creatorSignature: Buffer.from([1]), lockedAt: new Date(), resolvedAt: new Date(), resolvedBy, resolvedOutcome: outcome }).where(eq(schema.dares.id, d.id));
    for (const p of people) await db.insert(schema.darePositions).values({ dareId: d.id, userId: p.user.id, stake: 100n, value: 5000n, enteredBy: p.user.id, acknowledgedAt: new Date() });
    return d.id;
  };
  await end("quorum", 1n);
  await end("quorum", markets.VOID_OUTCOME);
  await end("arbitration", markets.VOID_OUTCOME);
  await end("arbitration", 0n);
  const expired = await end("expired", null);
  assert.deepEqual(await cleanResolution(dana.user.id), { ended: 4, clean: 2 });
  assert.equal(markets.stateOf((await markets.marketById(expired)) as markets.DareRow), "expired");
  // One person in says nothing about the terms, answered or voided: in neither number.
  await end("quorum", 1n, [dana]);
  await end("arbitration", markets.VOID_OUTCOME, [dana]);
  assert.deepEqual(await cleanResolution(dana.user.id), { ended: 4, clean: 2 }, "a question one person was in is left out");
  // A question with a guest in it is settled here by its quorum and recorded as provisional: a vote like any other.
  await end("provisional", 1n);
  assert.deepEqual(await cleanResolution(dana.user.id), { ended: 5, clean: 3 }, "a guest's question decided by vote counts");
  const asked = await askedRecord(dana.user.id);
  assert.deepEqual([asked.counted.length, asked.clean, asked.expired], [5, 3, 1], "the profile reads the same rule");
});

test("one warning before the backstop acts, never a second: six hours before the tiebreaker's day is up, and six hours before the void rule's deadline", async () => {
  const warned: string[] = [];
  const acts: Record<string, Date> = {};
  const notify = async (id: string, flavour: string, actsAt: Date) => {
    warned.push(`${flavour}:${id}`);
    acts[id] = actsAt;
  };
  const H = 3_600_000;
  // A warning never lands at night in the person's zone (4.10), so the seven-hours-off case needs a zone where an hour from now is daytime; the rows carry the asker's zone.
  const zone = ["UTC", "America/New_York", "America/Los_Angeles", "Pacific/Honolulu", "Asia/Tokyo", "Australia/Sydney", "Europe/London", "Asia/Kolkata"].find((z) => warningSendTime(new Date(Date.now() + 7 * H), z).getTime() > Date.now()) ?? "UTC";
  // The tiebreaker's: due and locked nineteen hours ago, so the backstop is five hours off.
  const t = await question({ resolvesBy: new Date(Date.now() + H) });
  await t.enter(ana, 8000n);
  await t.enter(ben, 2000n);
  await lockInMirror(t.d.id, { lockedAt: new Date(Date.now() - 19 * H), resolvesBy: new Date(Date.now() - 19 * H), zone });
  // The void rule's: its deadline five hours away, with a window still open; and one seven hours away, which is not yet.
  const v = await question({ stalemate: "void" });
  await v.enter(ana, 8000n);
  await v.enter(ben, 2000n);
  await lockInMirror(v.d.id, { resolvesBy: new Date(Date.now() + 5 * H), zone });
  const later = await question({ stalemate: "void" });
  await later.enter(ana, 8000n);
  await later.enter(ben, 2000n);
  await lockInMirror(later.d.id, { resolvesBy: new Date(Date.now() + 7 * H), zone });
  const ids = [t.d.id, v.d.id, later.d.id];
  const first = await tick(new Date(), async () => undefined, { onlyIds: ids, notifyWarning: notify });
  assert.deepEqual(first.warned.map((w) => `${w.flavour}:${w.id}`).sort(), [`tiebreaker:${t.d.id}`, `void:${v.d.id}`].sort(), "the two whose backstop is within six hours, each with its flavour");
  assert.deepEqual(warned.sort(), [`tiebreaker:${t.d.id}`, `void:${v.d.id}`].sort());
  assert.ok(Math.abs((acts[t.d.id]?.getTime() ?? 0) - (Date.now() + 5 * H)) < 5 * 60_000, "the warning names the moment the tiebreaker acts: a day after it was due");
  assert.equal(acts[v.d.id]?.getTime(), (await markets.marketById(v.d.id))?.resolvesBy?.getTime(), "and the void rule's, its deadline");
  const second = await tick(new Date(), async () => undefined, { onlyIds: ids, notifyWarning: notify });
  assert.deepEqual([second.warned, warned.length], [[], 2], "never a second reminder");
  assert.deepEqual(first.arbitrated, [], "the warning is not the backstop: the tiebreaker has not been asked");
});

test("the tick tells the asker their time has come exactly once, however often it runs, and never before", async () => {
  const { d, enter } = await question();
  await enter(ana, 8000n);
  await enter(ben, 2000n);
  await lockInMirror(d.id);
  const told: string[] = [];
  const notify = async (id: string, creatorId: string) => void told.push(`${id}:${creatorId}`);
  const early = await tick(new Date(), notify, { onlyIds: [d.id] });
  assert.deepEqual([early.notified, told], [[], []], "it is not due yet");
  const due = new Date(Date.now() + 2 * 3_600_000);
  const first = await tick(due, notify, { onlyIds: [d.id] });
  const second = await tick(due, notify, { onlyIds: [d.id] });
  assert.deepEqual([first.notified, second.notified, told], [[d.id], [], [`${d.id}:${ana.user.id}`]]);
  assert.deepEqual([first.arbitrated, first.expired, first.failed], [[], [], []], "a day has not passed, so the group still gets to call it");
});

test("voting opened is told once per closed question once it has happened, whichever way, and the reminder is asked for twelve hours into the vote and marked done only once nobody is waiting on their morning", async () => {
  const H = 3_600_000;
  const opened: string[] = [];
  const asked: string[] = [];
  let waiting = 1;
  const notifyVoting = {
    opened: async (id: string, c: string) => void opened.push(`${id}:${c}`),
    remind: async (id: string) => {
      asked.push(id);
      return { waiting };
    },
  };
  const run = (id: string) => tick(new Date(), async () => undefined, { onlyIds: [id], notifyVoting });
  const { d, enter } = await question();
  await enter(ana, 8000n);
  await enter(ben, 2000n);
  await lockInMirror(d.id, { lockedAt: new Date(Date.now() - 13 * H) });
  const closed = await run(d.id);
  assert.deepEqual([closed.votingOpened, closed.reminded, opened, asked], [[], [], [], []], "closed thirteen hours ago with nothing happened yet: calls are in, and nobody is told anything");
  await sayItHappened(d.id, { userId: ben.user.id });
  const first = await run(d.id);
  assert.deepEqual([first.votingOpened, opened], [[d.id], [`${d.id}:${ben.user.id}`]], "told once, Ben, who said it happened, as its cause");
  assert.deepEqual([first.reminded, asked], [[], []], "twelve hours from the vote opening, never from the close");
  const again = await run(d.id);
  assert.deepEqual([again.votingOpened, opened.length], [[], 1], "told once, however often the tick runs");
  // Eleven hours into the vote is still too early: the reminder waits the whole twelve (the submission round's audit
  // found nothing here could tell twelve hours from half an hour).
  await db.update(schema.dares).set({ voteAskedAt: new Date(Date.now() - 11 * H) }).where(eq(schema.dares.id, d.id));
  const early = await run(d.id);
  assert.deepEqual([early.reminded, asked], [[], []], "eleven hours into the vote, nobody is reminded yet");
  await db.update(schema.dares).set({ voteAskedAt: new Date(Date.now() - 13 * H) }).where(eq(schema.dares.id, d.id));
  const second = await run(d.id);
  assert.deepEqual([second.votingOpened, second.reminded, asked], [[], [], [d.id]], "someone's night: asked for, and not yet marked done");
  waiting = 0;
  const third = await run(d.id);
  assert.deepEqual([third.reminded, asked.length], [[d.id], 2], "nobody waiting: marked done");
  const fourth = await run(d.id);
  assert.deepEqual([fourth.votingOpened, fourth.reminded, asked.length], [[], [], 2], "never a second");
  // Its date coming opens it too, with the asker as its cause.
  const timed = await question();
  await timed.enter(ana, 8000n);
  await timed.enter(ben, 2000n);
  await lockInMirror(timed.d.id, { lockedAt: new Date(Date.now() - H), resolvesBy: new Date(Date.now() - 60_000) });
  const r = await run(timed.d.id);
  assert.deepEqual([r.votingOpened, r.reminded, opened.includes(`${timed.d.id}:${ana.user.id}`)], [[timed.d.id], [], true]);
});

test("a question is decided by its leading outcome, never by how many voted: a split one holds no place in the tick's list", async () => {
  const split = await question();
  const decided = await question();
  for (const q of [split, decided]) {
    await q.enter(ana, 8000n);
    await q.enter(ben, 2000n);
  }
  await lockInMirror(split.d.id, { threshold: 2, lockedAt: new Date(Date.now() - 2 * 3_600_000) });
  await lockInMirror(decided.d.id, { threshold: 2 });
  const vote = (dareId: string, userId: string, outcome: bigint) => db.insert(schema.dareVotes).values({ dareId, userId, outcome, signature: Buffer.alloc(65) });
  await vote(split.d.id, ana.user.id, 1n);
  await vote(split.d.id, ben.user.id, 0n);
  await vote(decided.d.id, ana.user.id, 1n);
  await vote(decided.d.id, ben.user.id, 1n);
  const mine = inArray(schema.dares.id, [split.d.id, decided.d.id]);
  assert.deepEqual(await decidedUnresolved(mine, 1), [{ id: decided.d.id }], "the split one, closed first, takes no place: two votes are not two for one outcome");
  assert.deepEqual(await decidedUnresolved(mine, 10), [{ id: decided.d.id }]);
});

test("a second tap on Close finds it closed and is answered as done; before its time nobody but the asker may close it, and the refusal names the asker", async () => {
  const { d, enter } = await question();
  await enter(ana, 8000n);
  await enter(ben, 2000n);
  assert.equal(await codeOf(() => markets.lockMarket(d.id, ben.user.id)), "not_yours");
  await assert.rejects(markets.lockMarket(d.id, ben.user.id), (e: unknown) => e instanceof Error && e.message === notAllowed("Ana", "close"));
  assert.equal(await codeOf(() => markets.lockMarket(d.id, cy.user.id)), "not_yours", "someone in the set but not in the question, before its time");
  await lockInMirror(d.id);
  assert.equal((await markets.lockMarket(d.id, ana.user.id)).txHash, "0x", "closed is closed: nothing is sent twice");
  assert.equal((await markets.lockMarket(d.id, ben.user.id)).txHash, "0x");
});
