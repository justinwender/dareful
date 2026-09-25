/**
 * Settling, forgiving and netting, on the real chain (PLANNING.md 5a, 7): the creditor closes what is open on
 * one signature over the obligation's own counter and nobody else can; forgiven is recorded as forgiven; and
 * what goes both ways in one unit cancels by the smaller side in one transaction on either party's signature.
 * Every row is a temporary user's and is removed after; the chain keeps the history, as it keeps everything.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";
import { parseEventLogs, type Address } from "viem";
import { db, schema } from "@/db";
import { contracts } from "@/lib/chain/contracts";
import { relayer } from "@/lib/chain/relayer";
import { CloseError, closeObligation, closeState, closeTypedData, netBetween, netNonce, netTypedData, type ReasonWord } from "@/lib/ledger/closes";
import { ensureUsd } from "@/lib/ledger/denominations";
import { createGroup } from "@/lib/ledger/groups";
import { denomOnchainId, groupOnchainId, uuidToBytes16 } from "@/lib/ledger/ids";
import { confirmProposal, confirmTypedData, proposeCover } from "@/lib/ledger/proposals";
import { cents, units } from "@/lib/money";
import { cleanup, tempSigner, track, type Signer } from "./fixture";

let a: Signer, b: Signer, groupId: string, denomId: string;
before(async () => {
  [a, b] = await Promise.all([tempSigner("Ana"), tempSigner("Ben")]);
  const g = await createGroup({ name: "lifecycle check (temporary)", createdBy: a.user.id });
  track.group(g.id);
  await db.insert(schema.groupMembers).values({ groupId: g.id, userId: b.user.id });
  groupId = g.id;
  denomId = (await ensureUsd(g.id, a.user.id)).id;
});
after(cleanup);

/** A cover the debtor has confirmed on the chain: the creditor holds the edge. */
async function confirmed(creditor: Signer, debtor: Signer, amount: bigint, memo: string): Promise<string> {
  const p = await proposeCover({ creditorId: creditor.user.id, debtor: { kind: "user", userId: debtor.user.id }, groupId, denomId, quantity: units(amount), amountCents: cents(amount), settleExpected: true, memo });
  const signature = await debtor.ledger.signTypedData(confirmTypedData(p, creditor.ledger.address));
  await confirmProposal(p.id, debtor.user.id, signature);
  return p.id;
}
async function signClose(who: Signer, obligationId: string, reason: ReasonWord) {
  const st = await closeState(obligationId);
  return who.ledger.signTypedData(closeTypedData({ obligationId, tokenId: st.tokenId, qty: st.remaining, reason, nonce: st.nonce }));
}
const code = (fn: () => Promise<unknown>) => fn().then(() => null, (e: unknown) => (e instanceof CloseError ? e.code : `other: ${e instanceof Error ? e.message : e}`));
const chain = () => ({ ...contracts(), publicClient: relayer().publicClient });

test("the creditor settles what is open on one signature over the obligation's own counter; nobody else can; twice finds nothing open", async () => {
  const id = await confirmed(a, b, 2300n, "Brunch");
  const before = await closeState(id);
  assert.equal(before.remaining, 2300n, "read from the chain's own counters until the indexer has seen the mint");
  assert.equal(before.nonce, 0n);
  assert.equal(await code(async () => closeObligation({ obligationId: id, creditorUserId: b.user.id, reason: "settled", signature: await signClose(b, id, "settled") })), "not_creditor", "the person who has it cannot close it");
  assert.equal(await code(async () => closeObligation({ obligationId: id, creditorUserId: a.user.id, reason: "settled", signature: await signClose(b, id, "settled") })), "bad_signature", "the creditor's close with the debtor's key");
  const { qty } = await closeObligation({ obligationId: id, creditorUserId: a.user.id, reason: "settled", signature: await signClose(a, id, "settled") });
  assert.equal(qty, 2300n);
  const [row] = await db.select({ closedAt: schema.obligations.closedAt }).from(schema.obligations).where(eq(schema.obligations.id, id));
  assert.ok(row?.closedAt && Date.now() - row.closedAt.getTime() < 60_000, "the moment of the close is written by the app, the offchain clock the timeline orders by");
  const { ledger, publicClient } = chain();
  const ob = await publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "obligationOf", args: [uuidToBytes16(id)] });
  assert.equal(ob.closed, 2300n);
  assert.equal(ob.closes, 1n, "the counter moved: the same signature can never close it again");
  assert.equal(await code(async () => closeObligation({ obligationId: id, creditorUserId: a.user.id, reason: "settled", signature: await signClose(a, id, "settled") })), "nothing_open");
});

test("forgiven is recorded on the chain as forgiven, not as a settlement", async () => {
  const id = await confirmed(a, b, 500n, "Cab home");
  const { txHash } = await closeObligation({ obligationId: id, creditorUserId: a.user.id, reason: "forgiven", signature: await signClose(a, id, "forgiven") });
  const { ledger, publicClient } = chain();
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  const closed = parseEventLogs({ abi: ledger.abi, eventName: "Closed", logs: receipt.logs });
  assert.equal(closed.length, 1);
  assert.equal(closed[0]?.args.reason, 1, "CloseReason.Forgiven");
  assert.equal(closed[0]?.args.qty, 500n);
  assert.equal(closed[0]?.args.obligationId, uuidToBytes16(id));
});

test("what goes both ways in one unit cancels by the smaller side, in one transaction, on either party's signature; a second net has nothing to do", async () => {
  await confirmed(a, b, 3000n, "Dinner"); // b has to pick up 3000 for a
  await confirmed(b, a, 1200n, "Tickets"); // a has to pick up 1200 for b
  const g = groupOnchainId(groupId);
  const d = denomOnchainId(denomId);
  // Signed by b, the smaller side: either party may.
  const nonce = await netNonce(g, d, b.ledger.address, a.ledger.address);
  const signature = await b.ledger.signTypedData(netTypedData({ groupId: g, denomId: d, a: b.ledger.address, b: a.ledger.address, nonce }));
  assert.equal(await code(async () => netBetween({ signerUserId: a.user.id, otherUserId: b.user.id, groupId, denomId, signature })), "bad_signature", "b's signature presented as a's");
  const { txHash } = await netBetween({ signerUserId: b.user.id, otherUserId: a.user.id, groupId, denomId, signature });
  const { ledger, publicClient } = chain();
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  const netted = parseEventLogs({ abi: ledger.abi, eventName: "Netted", logs: receipt.logs });
  assert.equal(netted.length, 1, "one transaction");
  assert.equal(netted[0]?.args.qty, 1200n, "by the smaller side");
  const idA = await publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "fungibleId", args: [g, d, a.ledger.address as Address] });
  const idB = await publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "fungibleId", args: [g, d, b.ledger.address as Address] });
  assert.equal(await publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "balanceOf", args: [a.ledger.address as Address, idB] }), 1800n, "b still has 1800 to pick up for a");
  assert.equal(await publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "balanceOf", args: [b.ledger.address as Address, idA] }), 0n, "and a has nothing left for b");
  const again = await netNonce(g, d, b.ledger.address, a.ledger.address);
  assert.equal(again, nonce + 1n, "the pair's counter moved");
  const second = await b.ledger.signTypedData(netTypedData({ groupId: g, denomId: d, a: b.ledger.address, b: a.ledger.address, nonce: again }));
  assert.equal(await code(async () => netBetween({ signerUserId: b.user.id, otherUserId: a.user.id, groupId, denomId, signature: second })), "chain", "nothing goes both ways any more: the contract refuses, loudly, before any gas");
});
