/**
 * The lifecycle of an obligation after it is confirmed (PLANNING.md 5a, 7; docs/design.md 6.3): the creditor
 * closes what they are owed with a reason, settled or forgiven, and reciprocal edges in one unit between two
 * people cancel against each other on one signature from either of them. Both are actions that bind only the
 * signer, so both are signed with the ledger wallet and never prompt beyond their own button. The contract is
 * the authority: `close` checks the creditor's signature over the obligation's own close counter, `net` checks
 * either party's over the pair's nonce, and the relayer only carries them.
 */
import { verifyTypedData, type Address, type Hex } from "viem";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { contracts } from "@/lib/chain/contracts";
import { gasFor } from "@/lib/chain/gas";
import { relayer, submit } from "@/lib/chain/relayer";
import { CloseReason, ledgerDomain, ledgerTypes } from "@/lib/chain/typed-data";
import { obligationsById, type EnvioObligation } from "./envio";
import { denomOnchainId, groupOnchainId, uuidToBytes16 } from "./ids";

export type ReasonWord = "settled" | "forgiven";

/** "Settled" is 0 and "forgiven" is 1 on the chain (`CloseReason`); the words are what the screen says. */
export function reasonCode(word: ReasonWord): 0 | 1 {
  return word === "forgiven" ? CloseReason.Forgiven : CloseReason.Settled;
}

export class CloseError extends Error {
  constructor(
    message: string,
    public readonly code: "not_found" | "not_creditor" | "not_party" | "nothing_open" | "bad_signature" | "chain",
  ) {
    super(message);
    this.name = "CloseError";
  }
}

export type CloseState = { tokenId: bigint; nonce: bigint; remaining: bigint; creditorLedger: Address };

/** What a Close signature has to cover, read from the chain (the counter) and the indexer (what is still open). */
export async function closeState(obligationId: string): Promise<CloseState> {
  const { ledger } = contracts();
  const { publicClient } = relayer();
  const id = uuidToBytes16(obligationId);
  const [onchain, indexed] = await Promise.all([
    publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "obligationOf", args: [id] }),
    obligationsById([id]),
  ]);
  if (onchain.minted === 0n) throw new CloseError("That one was never confirmed.", "not_found");
  // The indexer attributes nets first-in, first-out and so knows what is open on this obligation, but it runs a
  // few seconds behind the chain; the chain's own counters are exact except that they ignore nets. The smaller
  // of the two is right whenever the indexer is fresh or the lag is a close (the usual case: closing again
  // seconds after closing), and a close it still overstates, a net seconds earlier, the contract refuses loudly.
  const row = indexed.get(id);
  const bound = onchain.minted - onchain.closed;
  const remaining = row && BigInt(row.remaining) < bound ? BigInt(row.remaining) : bound;
  return { tokenId: onchain.tokenId, nonce: onchain.closes, remaining, creditorLedger: onchain.creditor };
}

export function closeTypedData(input: { obligationId: string; tokenId: bigint; qty: bigint; reason: ReasonWord; nonce: bigint }) {
  const { chainId, ledger } = contracts();
  return {
    domain: ledgerDomain(chainId, ledger.address),
    types: ledgerTypes,
    primaryType: "Close" as const,
    message: { id: input.tokenId, qty: input.qty, reason: reasonCode(input.reason), obligationId: uuidToBytes16(input.obligationId), nonce: input.nonce },
  };
}

/**
 * The creditor's one tap: closes everything still open on the obligation, for the reason given. Verified here
 * against their ledger wallet before any gas, then again by the contract.
 */
export async function closeObligation(input: { obligationId: string; creditorUserId: string; reason: ReasonWord; signature: Hex }): Promise<{ txHash: Hex; qty: bigint }> {
  const [o] = await db.select().from(schema.obligations).where(eq(schema.obligations.id, input.obligationId)).limit(1);
  if (!o) throw new CloseError("That one doesn't exist.", "not_found");
  if (o.toUser !== input.creditorUserId) throw new CloseError("Only the person who is owed this can close it.", "not_creditor");
  const [creditor] = await db.select({ ledgerWallet: schema.users.ledgerWallet }).from(schema.users).where(eq(schema.users.id, input.creditorUserId)).limit(1);
  if (!creditor) throw new CloseError("That one doesn't exist.", "not_found");
  const state = await closeState(o.id);
  if (state.remaining === 0n) throw new CloseError("Nothing is open on this one any more.", "nothing_open");
  const typed = closeTypedData({ obligationId: o.id, tokenId: state.tokenId, qty: state.remaining, reason: input.reason, nonce: state.nonce });
  const ok = await verifyTypedData({ ...typed, address: creditor.ledgerWallet as Address, signature: input.signature });
  if (!ok) throw new CloseError("That did not come from your account.", "bad_signature");
  const { ledger } = contracts();
  let txHash: Hex;
  try {
    const result = await submit({
      label: `close ${input.reason} ${o.id}`,
      address: ledger.address,
      abi: ledger.abi,
      functionName: "close",
      args: [typed.message.id, typed.message.qty, typed.message.reason, typed.message.obligationId, input.signature],
      gas: gasFor.close(),
    });
    txHash = result.hash;
  } catch (err) {
    throw new CloseError(err instanceof Error ? err.message : "the chain write failed", "chain");
  }
  // The offchain clock of the close (docs/decisions.md 2026-09-25): the moment "Just happened" orders by. Whether
  // it was settled or forgiven, and what is still open, stay the chain's to say.
  await db.update(schema.obligations).set({ closedAt: new Date() }).where(eq(schema.obligations.id, o.id));
  return { txHash, qty: state.remaining };
}

// ------------------------------------------------------------------------------------------- netting

/** One unit in one set of people where both directions are open between two ledger wallets: what `net` cancels. */
export type NettablePair = { groupId: string; denomId: string; aOwes: bigint; bOwes: bigint; cancels: bigint };

/**
 * The reciprocal fungible edges between `a` and `b`, grouped by (group, unit) the way the contract nets them.
 * Unique obligations have their own token ids and are never netted; the contract nets by the smaller balance.
 * Ids here are the chain's (bytes32 hex), which is what the pairs are signed over.
 */
export function nettablePairs(open: EnvioObligation[], a: string, b: string): NettablePair[] {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  const pairs = new Map<string, NettablePair>();
  for (const e of open) {
    if (e.unique) continue;
    const debtor = e.debtor.toLowerCase();
    const creditor = e.creditor.toLowerCase();
    const forward = debtor === la && creditor === lb;
    const backward = debtor === lb && creditor === la;
    if (!forward && !backward) continue;
    const key = `${e.groupId.toLowerCase()}:${e.denomId.toLowerCase()}`;
    const p = pairs.get(key) ?? { groupId: e.groupId.toLowerCase(), denomId: e.denomId.toLowerCase(), aOwes: 0n, bOwes: 0n, cancels: 0n };
    if (forward) p.aOwes += BigInt(e.remaining);
    else p.bOwes += BigInt(e.remaining);
    pairs.set(key, p);
  }
  return [...pairs.values()]
    .map((p) => ({ ...p, cancels: p.aOwes < p.bOwes ? p.aOwes : p.bOwes }))
    .filter((p) => p.cancels > 0n);
}

export function netTypedData(input: { groupId: Hex; denomId: Hex; a: Address; b: Address; nonce: bigint }) {
  const { chainId, ledger } = contracts();
  return {
    domain: ledgerDomain(chainId, ledger.address),
    types: ledgerTypes,
    primaryType: "Net" as const,
    message: { groupId: input.groupId, denomId: input.denomId, a: input.a, b: input.b, nonce: input.nonce },
  };
}

/** The pair's nonce on the chain, for the next Net signature. */
export async function netNonce(groupId: Hex, denomId: Hex, a: Address, b: Address): Promise<bigint> {
  const { ledger } = contracts();
  const { publicClient } = relayer();
  return publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "netNonceOf", args: [groupId, denomId, a, b] });
}

/**
 * Either party's one tap: what goes both ways in this unit, in this set of people, cancels by the smaller
 * amount, in one transaction. The signer must be one of the two, and their signature is checked here before any
 * gas and again by the contract. Group and unit are the offchain uuids; the chain ids are derived from them.
 */
export async function netBetween(input: { signerUserId: string; otherUserId: string; groupId: string; denomId: string; signature: Hex }): Promise<{ txHash: Hex }> {
  const [me] = await db.select({ id: schema.users.id, ledgerWallet: schema.users.ledgerWallet }).from(schema.users).where(eq(schema.users.id, input.signerUserId)).limit(1);
  const [them] = await db.select({ id: schema.users.id, ledgerWallet: schema.users.ledgerWallet }).from(schema.users).where(eq(schema.users.id, input.otherUserId)).limit(1);
  if (!me || !them || me.id === them.id) throw new CloseError("That one doesn't exist.", "not_found");
  const groupId = groupOnchainId(input.groupId);
  const denomId = denomOnchainId(input.denomId);
  const a = me.ledgerWallet as Address;
  const b = them.ledgerWallet as Address;
  const nonce = await netNonce(groupId, denomId, a, b);
  const typed = netTypedData({ groupId, denomId, a, b, nonce });
  const ok = await verifyTypedData({ ...typed, address: a, signature: input.signature });
  if (!ok) throw new CloseError("That did not come from your account.", "bad_signature");
  const { ledger } = contracts();
  try {
    const result = await submit({
      label: `net ${input.signerUserId} <-> ${input.otherUserId} ${input.denomId}`,
      address: ledger.address,
      abi: ledger.abi,
      functionName: "net",
      args: [groupId, denomId, a, b, input.signature],
      gas: gasFor.net(),
    });
    return { txHash: result.hash };
  } catch (err) {
    throw new CloseError(err instanceof Error ? err.message : "the chain write failed", "chain");
  }
}
