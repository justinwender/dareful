/**
 * A number market, end to end on the real chain (PLANNING.md 8c; docs/design.md 3.26; docs/decisions.md
 * 2026-09-24): five people, the shirts example from tests/unit/numbers.test.ts (a spread and one far outlier,
 * a scale of 20 the asker set), one atomic `create` carrying the scale, three votes for 14 with one dissenter at
 * 15, one `resolve`, and then the chain, the mirror and the hand figures compared edge by edge. The dissent is the
 * split-vote case: it lands as a dissent, and the three who agree settle it. It costs a little testnet gas per run.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { and, eq } from "drizzle-orm";
import type { Hex } from "viem";
import { db, schema } from "@/db";
import { contracts } from "@/lib/chain/contracts";
import { relayer } from "@/lib/chain/relayer";
import { ensureUsd } from "@/lib/ledger/denominations";
import { createGroup } from "@/lib/ledger/groups";
import { bufferToHex, uuidToBytes16 } from "@/lib/ledger/ids";
import * as markets from "@/lib/ledger/markets";
import { calibrationFor } from "@/lib/ledger/calibration";
import { cleanResolution } from "@/lib/ledger/settle";
import { cleanup, tempSigner, track, type Signer } from "./fixture";

let priya: Signer, gabe: Signer, theo: Signer, maya: Signer, john: Signer;
before(async () => {
  [priya, gabe, theo, maya, john] = await Promise.all(["Priya", "Gabe", "Theo", "Maya", "John"].map((n) => tempSigner(n)));
});
after(cleanup);

async function groupOf(people: Signer[]): Promise<string> {
  const g = await createGroup({ name: "number check (temporary)", createdBy: (people[0] as Signer).user.id });
  track.group(g.id);
  await db.insert(schema.groupMembers).values(people.slice(1).map((p) => ({ groupId: g.id, userId: p.user.id })));
  return g.id;
}
const open = async (d: markets.DareRow, creator: Signer) => markets.openMarket(d.id, creator.user.id, await creator.ledger.signTypedData(markets.createTypedData(d)));
const enter = async (d: markets.DareRow, who: Signer, stake: bigint, value: bigint) =>
  markets.enterMarket({ dareId: d.id, userId: who.user.id, stake, value, signature: await who.ledger.signTypedData(markets.enterTypedData(d, stake, value)) });
const vote = async (d: markets.DareRow, who: Signer, outcome: bigint) =>
  markets.castVote({ dareId: d.id, userId: who.user.id, outcome, signature: await who.governance.signTypedData(markets.voteTypedData(d, outcome)) });
const code = async (fn: () => Promise<unknown>) => fn().then(() => null, (e: unknown) => (e instanceof markets.MarketError ? e.code : `other: ${e instanceof Error ? e.message : e}`));

test("a number question carries its unit and its scale, refuses a draft without either, and is signed with the scale in Create", async () => {
  const g = await groupOf([priya, gabe]);
  const usd = await ensureUsd(g, priya.user.id);
  const base = { creatorId: priya.user.id, groupId: g, denomId: usd.id, title: "How many shirts can Gabe wear at once?", termsText: "Gabe puts on as many shirts as he can, one over another. The count is what is on him when he stops or one tears.", resolvesBy: new Date(Date.now() + 3_600_000), kind: "numeric" as const };
  assert.equal(await code(() => markets.draftMarket({ ...base, unit: { singular: "shirt", plural: "shirts" }, scale: null })), "bad_input", "no scale: refused");
  assert.equal(await code(() => markets.draftMarket({ ...base, unit: null, scale: { range: 20n, source: "asker" } })), "bad_input", "no unit: refused");
  assert.equal(await code(() => markets.draftMarket({ ...base, unit: { singular: "shirt", plural: "shirts" }, scale: { range: 0n, source: "asker" } })), "bad_input", "a scale of nothing: refused");
  const d = await markets.draftMarket({ ...base, unit: { singular: "shirt", plural: "shirts" }, scale: { range: 20n, source: "asker" } });
  assert.deepEqual([d.kind, d.range, d.rangeSource, d.outcomeLabels], ["numeric", 20n, "asker", ["shirt", "shirts"]]);
  assert.deepEqual(markets.unitOf(d), { singular: "shirt", plural: "shirts" });
  const typed = markets.createTypedData(d);
  assert.equal(typed.message.kind, 1, "Kind.Numeric");
  assert.equal(typed.message.range, 20n, "the scale is what the asker signs");
  await open(d, priya);
  // A number is any whole number up to nine digits; a probability's bound does not apply.
  assert.equal((await enter(d, gabe, 500n, 200n)).value, 200n);
  assert.equal(await code(() => enter(d, priya, 500n, 1_000_000_000n)), "bad_input");
  // Nothing about a number market goes into the group's-number series: its column is in basis points.
  assert.equal((await db.select().from(schema.dareNumberSeries).where(eq(schema.dareNumberSeries.dareId, d.id))).length, 0);
});

test("the shirts on the chain: five people, one far outlier, three votes for 14 against one for 15, settled by distance to the cent", async () => {
  const g = await groupOf([priya, gabe, theo, maya, john]);
  const usd = await ensureUsd(g, priya.user.id);
  const d0 = await markets.draftMarket({ creatorId: priya.user.id, groupId: g, denomId: usd.id, title: "How many shirts can Gabe wear at once?", termsText: "Gabe puts on as many shirts as he can, one over another. The count is what is on him when he stops or one tears.", resolvesBy: new Date(Date.now() + 3_600_000), kind: "numeric", unit: { singular: "shirt", plural: "shirts" }, scale: { range: 20n, source: "asker" } });
  const d = await open(d0, priya);
  await enter(d, priya, 500n, 14n);
  await enter(d, gabe, 1000n, 18n);
  await enter(d, theo, 500n, 12n);
  await enter(d, maya, 2000n, 9n);
  await enter(d, john, 500n, 200n);

  const locked = await markets.lockMarket(d.id, priya.user.id);
  assert.equal(locked.threshold, 3, "floor(5 / 2) + 1, computed by the contract");
  const l = (await markets.marketById(d.id)) as markets.DareRow;
  const { dares, ledger } = contracts();
  const { publicClient } = relayer();
  const struct = (await publicClient.readContract({ address: dares.address, abi: dares.abi, functionName: "dareOf", args: [bufferToHex(l.onchainId as Buffer) as Hex] })) as { kind: number; range: bigint; status: number; outcome: bigint };
  assert.deepEqual([struct.kind, struct.range], [1, 20n], "the chain holds the kind and the scale the asker signed");

  // A vote on a number question names a number; a probability's bound does not apply, and nobody can tell is still allowed.
  assert.equal(await code(() => vote(l, theo, 1_000_000_000n)), "bad_input");
  // Theo saw 15: a dissent, counted for 15, which nobody else joins.
  assert.deepEqual(await vote(l, theo, 15n), { resolved: false });
  assert.deepEqual(await vote(l, priya, 14n), { resolved: false });
  assert.deepEqual(await vote(l, gabe, 14n), { resolved: false });
  assert.deepEqual(markets.tally(await markets.votesOf(d.id)).map((t) => [t.outcome, t.votes]), [[14n, 2], [15n, 1]], "split, not deadlocked: it takes three agreeing");
  const last = await vote(l, maya, 14n);
  assert.equal(last.resolved, true, "the third 14 settles it; Theo's 15 was a dissent");

  const done = (await markets.marketById(d.id)) as markets.DareRow;
  assert.equal(markets.stateOf(done), "resolved");
  assert.equal(done.resolvedOutcome, 14n);
  const ps = await markets.positionsOf(d.id);
  const by = (s: Signer) => ps.find((p) => p.userId === s.user.id);
  // Scores and nets, worked by hand in tests/unit/numbers.test.ts.
  assert.deepEqual([priya, gabe, theo, maya, john].map((s) => by(s)?.score), [10000, 8000, 9000, 7500, 0]);
  assert.deepEqual([priya, gabe, theo, maya, john].map((s) => by(s)?.net), [193n, 75n, 130n, 32n, -430n]);

  const rows = await db.select().from(schema.obligations).where(and(eq(schema.obligations.origin, "dare"), eq(schema.obligations.originId, d.id)));
  const edge = (from: Signer, to: Signer) => rows.find((r) => r.fromUser === from.user.id && r.toUser === to.user.id)?.quantity;
  assert.equal(rows.length, 10);
  assert.deepEqual(
    [edge(gabe, priya), edge(theo, priya), edge(maya, priya), edge(john, priya), edge(gabe, theo), edge(maya, gabe), edge(john, gabe), edge(maya, theo), edge(john, theo), edge(john, maya)],
    [25n, 12n, 31n, 125n, 12n, 12n, 100n, 18n, 112n, 93n],
  );
  // And the chain agrees with the mirror, row by row.
  for (const r of rows) {
    const o = (await publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "obligationOf", args: [uuidToBytes16(r.id)] })) as { minted: bigint; creditor: string };
    assert.equal(o.minted, r.quantity);
    assert.equal(o.creditor.toLowerCase(), [priya, gabe, theo, maya, john].find((s) => s.user.id === r.toUser)?.ledger.address.toLowerCase());
  }
  const after = (await publicClient.readContract({ address: dares.address, abi: dares.abi, functionName: "dareOf", args: [bufferToHex(done.onchainId as Buffer) as Hex] })) as { status: number; outcome: bigint };
  assert.deepEqual([after.status, after.outcome], [1, 14n]);

  // Every participant's record moved (PLANNING.md 8e): the miss as a fraction of the scale, and the asker's clean resolution.
  assert.deepEqual((await calibrationFor(john.user.id)).numeric, { resolved: 1, meanMissBps: 10000 });
  assert.deepEqual((await calibrationFor(theo.user.id)).numeric, { resolved: 1, meanMissBps: 1000 });
  assert.deepEqual(await cleanResolution(priya.user.id), { ended: 1, clean: 1 });
});
