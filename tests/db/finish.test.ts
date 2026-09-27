/**
 * The tick finishes a resolution the votes already decided (docs/decisions.md 2026-09-27): a question locked on
 * the real chain, both votes signed and stored without the last voter's request resolving it (a dropped send,
 * or a request that failed past the vote), and the tick lands `resolve` from the signatures already there. Never
 * while a send for it is still in flight, which is what a planted pending write stands for. Costs one create and
 * one resolve on Monad.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { subjectKey } from "@/lib/chain/relayer";
import { ensureUsd } from "@/lib/ledger/denominations";
import { createGroup } from "@/lib/ledger/groups";
import * as markets from "@/lib/ledger/markets";
import { tick } from "@/lib/ledger/settle";
import { cleanup, tempSigner, track, type Signer } from "./fixture";

let ana: Signer, ben: Signer;
const planted: Buffer[] = [];
before(async () => {
  [ana, ben] = await Promise.all(["Ana", "Ben"].map((n) => tempSigner(n)));
});
after(async () => {
  if (planted.length) await db.delete(schema.chainWrites).where(inArray(schema.chainWrites.hash, planted));
  await cleanup();
});

test("a question whose votes already decided it and whose resolution never landed is resolved by the tick from the signatures there, and never while a send for it is in flight", async () => {
  const g = await createGroup({ name: "finish check (temporary)", createdBy: ana.user.id });
  track.group(g.id);
  await db.insert(schema.groupMembers).values([{ groupId: g.id, userId: ben.user.id }]);
  const usd = await ensureUsd(g.id, ana.user.id);
  const d0 = await markets.draftMarket({ creatorId: ana.user.id, groupId: g.id, denomId: usd.id, title: "Does the tick finish it?", termsText: "Yes if the tick resolves it from the votes. No if it waits forever.", resolvesBy: new Date(Date.now() + 3_600_000) });
  const d = await markets.openMarket(d0.id, ana.user.id, await ana.ledger.signTypedData(markets.createTypedData(d0)));
  for (const [who, bps] of [[ana, 7000n], [ben, 3000n]] as const) await markets.enterMarket({ dareId: d.id, userId: who.user.id, stake: 1000n, value: bps, signature: await who.ledger.signTypedData(markets.enterTypedData(d, 1000n, bps)) });
  await markets.lockMarket(d.id, ana.user.id);
  const locked = (await markets.marketById(d.id))!;
  assert.equal(locked.threshold, 2);
  // Both votes, stored as castVote stores them, without the last one's request resolving it.
  for (const who of [ana, ben]) await db.insert(schema.dareVotes).values({ dareId: d.id, userId: who.user.id, outcome: 1n, signature: Buffer.from((await who.governance.signTypedData(markets.voteTypedData(locked, 1n))).slice(2), "hex") });

  // A send for it still in flight: the tick leaves it to the reconciler.
  const hash = randomBytes(32);
  planted.push(hash);
  await db.insert(schema.chainWrites).values({ hash, raw: randomBytes(64), label: `resolve market ${d.id}`, kind: "resolve", subject: subjectKey({ dareId: d.id }), nonce: 7, status: "pending" });
  const r1 = await tick(new Date(), async () => undefined, { onlyIds: [d.id] });
  assert.deepEqual([r1.resolved, r1.failed], [[], []], "nothing is resolved twice");
  assert.equal((await markets.marketById(d.id))!.resolvedAt, null);

  // The send was dropped: the tick resolves it from the votes.
  await db.update(schema.chainWrites).set({ status: "dropped", completedAt: new Date() }).where(eq(schema.chainWrites.hash, hash));
  const r2 = await tick(new Date(), async () => undefined, { onlyIds: [d.id] });
  assert.deepEqual([r2.resolved, r2.failed], [[d.id], []]);
  const done = (await markets.marketById(d.id))!;
  assert.deepEqual([done.resolvedAt !== null, done.resolvedBy, done.resolvedOutcome], [true, "quorum", 1n]);
  const positions = await markets.positionsOf(d.id);
  assert.ok(positions.every((p) => p.score !== null), "scored, as any resolution is");
});
