/**
 * The settler against the real database, with no chain: lock is written into the mirror, as in the other
 * market tests. The tick is always scoped to the questions this file made, because the database is the real one.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ensureUsd } from "@/lib/ledger/denominations";
import { createGroup } from "@/lib/ledger/groups";
import * as markets from "@/lib/ledger/markets";
import { cleanResolution, stateCase, tick } from "@/lib/ledger/settle";
import { cleanup, codeOf, tempSigner, track, type Signer } from "./fixture";

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

test("the toll: a void by the group or by the arbitrator counts against whoever wrote the terms, and expiry counts against nobody", async () => {
  const dana = await tempSigner("Dana");
  const before = await cleanResolution(dana.user.id);
  assert.deepEqual(before, { ended: 0, clean: 0 });
  const g = await createGroup({ name: "toll check (temporary)", createdBy: dana.user.id });
  track.group(g.id);
  const usd = await ensureUsd(g.id, dana.user.id);
  const end = async (resolvedBy: string, outcome: bigint | null) => {
    const d = await markets.draftMarket({ creatorId: dana.user.id, groupId: g.id, denomId: usd.id, title: "Toll check?", termsText: "Yes if it happens.", resolvesBy: new Date(Date.now() + 3_600_000) });
    await db.update(schema.dares).set({ creatorSignature: Buffer.from([1]), lockedAt: new Date(), resolvedAt: new Date(), resolvedBy, resolvedOutcome: outcome }).where(eq(schema.dares.id, d.id));
    return d.id;
  };
  await end("quorum", 1n);
  await end("quorum", markets.VOID_OUTCOME);
  await end("arbitration", markets.VOID_OUTCOME);
  await end("arbitration", 0n);
  const expired = await end("expired", null);
  assert.deepEqual(await cleanResolution(dana.user.id), { ended: 4, clean: 2 });
  assert.equal(markets.stateOf((await markets.marketById(expired)) as markets.DareRow), "expired");
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
