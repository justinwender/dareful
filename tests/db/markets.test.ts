/**
 * Binary markets, end to end. The first half never touches the chain: what may be drafted, opened, and entered,
 * and whose signature counts for what. The second half is real: four people, the section 8c numbers, one atomic
 * `create`, a quorum with one dissenter, one `resolve`, and then the chain, the mirror, and the hand-computed
 * answer are compared edge by edge. It costs a little testnet gas per run.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { and, eq } from "drizzle-orm";
import type { Hex } from "viem";
import { db, schema } from "@/db";
import { contracts } from "@/lib/chain/contracts";
import { relayer } from "@/lib/chain/relayer";
import { ensureUnitInGroup, ensureUsd } from "@/lib/ledger/denominations";
import { createGroup } from "@/lib/ledger/groups";
import { bufferToHex, uuidToBytes16 } from "@/lib/ledger/ids";
import * as markets from "@/lib/ledger/markets";
import { cleanup, tempSigner, track, type Signer } from "./fixture";

let justin: Signer, gabe: Signer, alex: Signer, john: Signer, outsider: Signer;
before(async () => {
  [justin, gabe, alex, john, outsider] = await Promise.all(["Justin", "Gabe", "Alex", "John", "Outsider"].map((n) => tempSigner(n)));
});
after(cleanup);

async function groupOf(people: Signer[]): Promise<string> {
  const g = await createGroup({ name: "market check (temporary)", createdBy: (people[0] as Signer).user.id });
  track.group(g.id);
  if (people.length > 1) await db.insert(schema.groupMembers).values(people.slice(1).map((p) => ({ groupId: g.id, userId: p.user.id })));
  return g.id;
}
async function draft(creator: Signer, groupId: string, unit: "usd" | "next_time" = "usd") {
  const denom = unit === "usd" ? await ensureUsd(groupId, creator.user.id) : await ensureUnitInGroup(groupId, creator.user.id, { template: "next_time", label: "next_time" });
  return markets.draftMarket({ creatorId: creator.user.id, groupId, denomId: denom.id, title: "Does John fall asleep during the movie?", termsText: "Yes if John is asleep at any point before the credits. No if he makes it.", resolvesBy: new Date(Date.now() + 3_600_000) });
}
const open = async (d: markets.DareRow, creator: Signer) => markets.openMarket(d.id, creator.user.id, await creator.ledger.signTypedData(markets.createTypedData(d)));
const enter = async (d: markets.DareRow, who: Signer, stake: bigint, valueBps: bigint, signWith = who.ledger) =>
  markets.enterMarket({ dareId: d.id, userId: who.user.id, stake, value: valueBps, signature: await signWith.signTypedData(markets.enterTypedData(d, stake, valueBps)) });
const vote = async (d: markets.DareRow, who: Signer, outcome: bigint, signWith = who.governance) =>
  markets.castVote({ dareId: d.id, userId: who.user.id, outcome, signature: await signWith.signTypedData(markets.voteTypedData(d, outcome)) });
const code = async (fn: () => Promise<unknown>) => fn().then(() => null, (e: unknown) => (e instanceof markets.MarketError ? e.code : `other: ${e instanceof Error ? e.message : e}`));

// ------------------------------------------------------------------------------------------ before the chain

test("a draft is nobody's but its creator's, and only their own signature opens it", async () => {
  const g = await groupOf([justin, gabe]);
  const d = await draft(justin, g);
  assert.equal(markets.stateOf(d), "draft");
  assert.equal(d.threshold, 2);
  assert.equal(await code(() => enter(d, gabe, 500n, 5000n)), "wrong_state");
  assert.equal(await code(async () => markets.openMarket(d.id, gabe.user.id, await gabe.ledger.signTypedData(markets.createTypedData(d)))), "not_yours");
  assert.equal(await code(async () => markets.openMarket(d.id, justin.user.id, await gabe.ledger.signTypedData(markets.createTypedData(d)))), "bad_signature");
  assert.equal(await code(async () => markets.openMarket(d.id, justin.user.id, await justin.governance.signTypedData(markets.createTypedData(d)))), "bad_signature");
  assert.equal(markets.stateOf(await open(d, justin)), "open");
});

test("a market cannot be asked in a group you are not in, in another group's unit, or with a deadline already past", async () => {
  const g = await groupOf([justin, gabe]);
  const other = await groupOf([gabe]);
  const usd = await ensureUsd(g, justin.user.id);
  const base = { creatorId: justin.user.id, groupId: g, denomId: usd.id, title: "Does it rain?", termsText: "Yes if it rains here before midnight.", resolvesBy: new Date(Date.now() + 3_600_000) };
  assert.equal(await code(() => markets.draftMarket({ ...base, creatorId: outsider.user.id })), "not_member");
  assert.equal(await code(() => markets.draftMarket({ ...base, groupId: other, creatorId: gabe.user.id })), "bad_input");
  assert.equal(await code(() => markets.draftMarket({ ...base, resolvesBy: new Date(Date.now() - 1000) })), "bad_input");
  assert.equal(await code(() => markets.draftMarket({ ...base, title: "  " })), "bad_input");
});

test("a position is a stake and a number signed by its owner's ledger wallet, and by nobody else's", async () => {
  const g = await groupOf([justin, gabe, alex]);
  const d = await open(await draft(justin, g), justin);
  const p = await enter(d, gabe, 2000n, 7000n);
  assert.equal(p.stake, 2000n);
  assert.equal(p.value, 7000n);
  assert.equal(p.enteredBy, gabe.user.id);
  assert.notEqual(p.acknowledgedAt, null);
  assert.equal(await code(() => enter(d, alex, 500n, 5000n, gabe.ledger)), "bad_signature"); // someone else's key
  assert.equal(await code(() => enter(d, alex, 500n, 5000n, alex.governance)), "bad_signature"); // the wrong one of their own keys
  // a signature over different numbers than the ones submitted
  assert.equal(await code(async () => markets.enterMarket({ dareId: d.id, userId: alex.user.id, stake: 500n, value: 9000n, signature: await alex.ledger.signTypedData(markets.enterTypedData(d, 500n, 5000n)) })), "bad_signature");
  assert.equal((await markets.positionsOf(d.id)).length, 1);
});

test("entering is for the group, in range, with something on it", async () => {
  const g = await groupOf([justin, gabe]);
  const d = await open(await draft(justin, g), justin);
  assert.equal(await code(() => enter(d, outsider, 500n, 5000n)), "not_member");
  assert.equal(await code(() => enter(d, gabe, 500n, 10001n)), "bad_input");
  assert.equal(await code(() => enter(d, gabe, 0n, 5000n)), "bad_input");
});

test("a number can be changed until lock, and the change is a fresh signature over the new numbers", async () => {
  const g = await groupOf([justin, gabe]);
  const d = await open(await draft(justin, g), justin);
  await enter(d, gabe, 2000n, 7000n);
  await enter(d, gabe, 2500n, 6000n);
  const ps = await markets.positionsOf(d.id);
  assert.equal(ps.length, 1);
  assert.deepEqual([ps[0]?.stake, ps[0]?.value], [2500n, 6000n]);
  const sig = bufferToHex(ps[0]?.enterSignature as Buffer);
  assert.equal(sig, await gabe.ledger.signTypedData(markets.enterTypedData(d, 2500n, 6000n)));
});

test("with a unit nobody can count, everyone puts up exactly one", async () => {
  const g = await groupOf([justin, gabe]);
  const d = await open(await draft(justin, g, "next_time"), justin);
  assert.equal(await code(() => enter(d, gabe, 2n, 5000n)), "bad_input");
  assert.equal((await enter(d, gabe, 1n, 5000n)).stake, 1n);
});

test("only the creator locks, and it takes two", async () => {
  const g = await groupOf([justin, gabe]);
  const d = await open(await draft(justin, g), justin);
  await enter(d, justin, 1500n, 2000n);
  assert.equal(await code(() => markets.lockMarket(d.id, justin.user.id)), "wrong_state");
  await enter(d, gabe, 2000n, 7000n);
  assert.equal(await code(() => markets.lockMarket(d.id, gabe.user.id)), "not_yours");
  assert.equal(markets.stateOf((await markets.marketById(d.id)) as markets.DareRow), "open");
});

test("a tally counts each person once and leads with the most", () => {
  assert.deepEqual(markets.tally([{ outcome: 0n }, { outcome: 1n }, { outcome: 1n }, { outcome: markets.VOID_OUTCOME }]), [
    { outcome: 1n, votes: 2 },
    { outcome: 0n, votes: 1 },
    { outcome: markets.VOID_OUTCOME, votes: 1 },
  ]);
  assert.equal(markets.toChainOutcome(markets.VOID_OUTCOME), (1n << 256n) - 1n);
  assert.equal(markets.toChainOutcome(1n), 1n);
});

// ------------------------------------------------------------------------------------------------ on the chain

test("four people, the section 8c numbers, one dissenter: locked, resolved by quorum, and settled to the cent", async () => {
  const g = await groupOf([justin, gabe, alex, john]);
  const d = await open(await draft(justin, g), justin);
  await enter(d, justin, 1500n, 2000n);
  await enter(d, gabe, 2000n, 7000n);
  await enter(d, alex, 500n, 5000n);
  await enter(d, john, 5000n, 0n);

  const locked = await markets.lockMarket(d.id, justin.user.id);
  assert.equal(locked.threshold, 3); // floor(4 / 2) + 1, computed by the contract
  assert.deepEqual([...locked.quorum].map((a) => a.toLowerCase()).sort(), [justin, gabe, alex, john].map((p) => p.governance.address.toLowerCase()).sort());
  const afterLock = (await markets.marketById(d.id)) as markets.DareRow;
  assert.equal(markets.stateOf(afterLock), "locked");
  assert.equal(await code(() => enter(afterLock, gabe, 1n, 1n)), "wrong_state"); // numbers are locked

  // The server can write the ledger but never cast a vote: a ledger-wallet signature is not a vote.
  assert.equal(await code(() => vote(afterLock, gabe, 1n, gabe.ledger)), "bad_signature");
  assert.equal(await code(() => vote(afterLock, outsider, 1n)), "not_member");

  // John insists he stayed awake. Three others say he did not. Threshold is three.
  assert.deepEqual(await vote(afterLock, john, 0n), { resolved: false });
  assert.deepEqual(await vote(afterLock, gabe, 1n), { resolved: false });
  assert.deepEqual(await vote(afterLock, alex, 1n), { resolved: false });
  const last = await vote(afterLock, justin, 1n);
  assert.equal(last.resolved, true);

  const done = (await markets.marketById(d.id)) as markets.DareRow;
  assert.equal(markets.stateOf(done), "resolved");
  assert.equal(done.resolvedOutcome, 1n);
  assert.equal(done.resolvedBy, "quorum");

  // Scores and nets, worked by hand in tests/unit/scoring.test.ts.
  const ps = await markets.positionsOf(d.id);
  const by = (s: Signer) => ps.find((p) => p.userId === s.user.id);
  assert.deepEqual([justin, gabe, alex, john].map((s) => by(s)?.score), [3600, 9100, 7500, 0]);
  assert.deepEqual([justin, gabe, alex, john].map((s) => by(s)?.net), [-160n, 907n, 164n, -911n]);

  // Six edges, each from the lower scorer to the higher, mirrored as shadow rows that carry the market.
  const rows = await db.select().from(schema.obligations).where(and(eq(schema.obligations.origin, "dare"), eq(schema.obligations.originId, d.id)));
  const edge = (from: Signer, to: Signer) => rows.find((r) => r.fromUser === from.user.id && r.toUser === to.user.id)?.quantity;
  assert.equal(rows.length, 6);
  assert.deepEqual([edge(justin, gabe), edge(justin, alex), edge(john, justin), edge(alex, gabe), edge(john, gabe), edge(john, alex)], [275n, 65n, 180n, 26n, 606n, 125n]);
  assert.ok(rows.every((r) => r.settleExpected && r.amountCents === r.quantity));

  // And the chain agrees with the mirror, row by row.
  const { ledger, dares } = contracts();
  const { publicClient } = relayer();
  for (const r of rows) {
    const o = (await publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "obligationOf", args: [uuidToBytes16(r.id)] })) as { minted: bigint; creditor: string };
    assert.equal(o.minted, r.quantity);
    assert.equal(o.creditor.toLowerCase(), [justin, gabe, alex, john].find((s) => s.user.id === r.toUser)?.ledger.address.toLowerCase());
  }
  const onchain = (await publicClient.readContract({ address: dares.address, abi: dares.abi, functionName: "dareOf", args: [bufferToHex(done.onchainId as Buffer) as Hex] })) as { status: number; outcome: bigint; termsHash: Hex };
  assert.equal(onchain.status, 1);
  assert.equal(onchain.outcome, 1n);
  assert.equal(onchain.termsHash, markets.termsHash(done.termsText));

  assert.equal(await code(() => vote(done, john, 0n)), "wrong_state"); // nobody is asked to vote on something decided
});

test("two people agree nobody can tell: voided, nothing minted, and recorded as voided", async () => {
  const g = await groupOf([gabe, alex]);
  const d = await open(await draft(gabe, g), gabe);
  await enter(d, gabe, 1000n, 8000n);
  await enter(d, alex, 1000n, 3000n);
  const locked = await markets.lockMarket(d.id, gabe.user.id);
  assert.equal(locked.threshold, 2);
  const l = (await markets.marketById(d.id)) as markets.DareRow;
  assert.deepEqual(await vote(l, gabe, markets.VOID_OUTCOME), { resolved: false });
  assert.equal((await vote(l, alex, markets.VOID_OUTCOME)).resolved, true);
  const done = (await markets.marketById(d.id)) as markets.DareRow;
  assert.equal(markets.stateOf(done), "voided");
  assert.equal((await db.select().from(schema.obligations).where(eq(schema.obligations.originId, d.id))).length, 0);
  assert.ok((await markets.positionsOf(d.id)).every((p) => p.score === null && p.net === null));
});
