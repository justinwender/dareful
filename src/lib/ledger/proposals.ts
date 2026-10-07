/**
 * Manual obligations: the creditor authors ("I got this one"), the debtor confirms with one tap, and nothing
 * exists on the ledger until the debtor has signed. Principle 2, enforced here and in the contract.
 */
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { verifyTypedData, type Address, type Hex } from "viem";
import { db, schema } from "@/db";
import { contracts } from "@/lib/chain/contracts";
import { gasFor } from "@/lib/chain/gas";
import { SendPending, submit } from "@/lib/chain/relayer";
import { ledgerDomain, ledgerTypes } from "@/lib/chain/typed-data";
import { cents, units, type Cents, type Units } from "@/lib/money";
import { ensureDyadWithClaim, isClaimMember, type Person } from "./claims";
import { denominationById, touchDenomination } from "./denominations";
import { ensureDyad, isMember } from "./groups";
import { denomOnchainId, groupOnchainId, hexToBuffer, uuidToBytes16 } from "./ids";
import { ensureDenomOnchain, ensureGroupOnchain } from "./registry";
import { encodeAbiParameters, keccak256 } from "viem";

export type ProposalRow = typeof schema.obligationProposals.$inferSelect;

export type ProposeCoverInput = {
  creditorId: string; // the signed-in user; only the person who covered can create the obligation
  debtor: Person; // an account-holder, or a ghost: nothing mints for a ghost until they bind and confirm
  groupId?: string; // omitted: the implicit dyad
  denomId: string;
  quantity: Units | null; // null iff the denomination is unquantifiable
  amountCents: Cents | null; // the magnitude, retained off the chain, never rendered for a non-monetary unit
  settleExpected: boolean;
  memo?: string;
};

export async function proposeCover(input: ProposeCoverInput): Promise<ProposalRow> {
  const { debtor } = input;
  if (debtor.kind === "user" && input.creditorId === debtor.userId) throw new Error("you cannot cover yourself");
  const denom = await denominationById(input.denomId);
  if (!denom) throw new Error("unknown unit");
  let groupId = input.groupId;
  if (!groupId) {
    const dyad = debtor.kind === "user" ? await ensureDyad(input.creditorId, debtor.userId) : await ensureDyadWithClaim(input.creditorId, debtor.claimId);
    groupId = dyad.id;
  }
  if (denom.groupId !== groupId) throw new Error("that unit belongs to another group");
  const debtorIn = debtor.kind === "user" ? await isMember(groupId, debtor.userId) : await isClaimMember(groupId, debtor.claimId);
  if (!(await isMember(groupId, input.creditorId)) || !debtorIn) {
    throw new Error("both people must be in the group");
  }
  if (denom.quantifiable && (input.quantity === null || input.quantity <= 0n)) throw new Error("how many?");
  if (!denom.quantifiable && input.quantity !== null) throw new Error("that unit has no count");
  if (denom.monetary && input.amountCents === null) throw new Error("how much?");
  if (denom.monetary && input.quantity !== null && input.amountCents !== null && input.quantity !== (input.amountCents as bigint)) {
    throw new Error("for dollars the count is the amount in cents");
  }

  const [row] = await db
    .insert(schema.obligationProposals)
    .values({
      groupId,
      fromUser: debtor.kind === "user" ? debtor.userId : null,
      fromClaim: debtor.kind === "claim" ? debtor.claimId : null,
      toUser: input.creditorId,
      denomId: denom.id,
      quantity: input.quantity,
      amountCents: input.amountCents,
      origin: "manual",
      settleExpected: input.settleExpected,
      memo: input.memo?.trim() || null,
      status: "pending",
    })
    .returning();
  if (!row) throw new Error("could not create the proposal");
  await touchDenomination(denom.id);
  return row;
}

/** What the debtor signs. The ids are deterministic, so this needs no chain round trip. */
export function confirmTypedData(proposal: ProposalRow, creditorLedger: Address) {
  const { chainId, ledger } = contracts();
  const qty = proposal.quantity ?? 1n; // an unquantifiable denomination mints exactly one unit
  return {
    domain: ledgerDomain(chainId, ledger.address),
    types: ledgerTypes,
    primaryType: "Confirm" as const,
    message: {
      groupId: groupOnchainId(proposal.groupId),
      denomId: denomOnchainId(proposal.denomId),
      creditor: creditorLedger,
      qty,
      obligationId: uuidToBytes16(proposal.id),
      unique: proposal.uniqueObligation,
    },
  };
}

function fungibleTokenId(groupId: Hex, denomId: Hex, debtor: Address): bigint {
  return BigInt(keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }, { type: "address" }], [groupId, denomId, debtor])));
}

function uniqueTokenId(groupId: Hex, denomId: Hex, debtor: Address, obligationId: Hex): bigint {
  return BigInt(
    keccak256(
      encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }, { type: "address" }, { type: "bytes16" }], [groupId, denomId, debtor, obligationId]),
    ),
  );
}

export class ConfirmError extends Error {
  constructor(message: string, public readonly code: "not_debtor" | "not_pending" | "bad_signature" | "chain") {
    super(message);
    this.name = "ConfirmError";
  }
}

/**
 * The debtor's one tap. Verifies the signature offchain (loudly, before any gas), registers the group and
 * denomination on the ledger if this is their first confirmed obligation, submits `confirm` through the
 * relayer, and writes the offchain shadow row with the transaction hash. Every step fails visibly.
 */
export async function confirmProposal(proposalId: string, debtorUserId: string, signature: Hex): Promise<{ obligationId: string; txHash: Hex }> {
  const [proposal] = await db.select().from(schema.obligationProposals).where(eq(schema.obligationProposals.id, proposalId)).limit(1);
  if (!proposal) throw new ConfirmError("unknown proposal", "not_pending");
  if (proposal.fromUser !== debtorUserId) throw new ConfirmError("only the person named can confirm this", "not_debtor");
  if (proposal.status !== "pending") throw new ConfirmError("this one is already settled one way or the other", "not_pending");
  if (!proposal.toUser) throw new ConfirmError("the creditor has no account yet", "not_pending");

  const [debtor] = await db.select().from(schema.users).where(eq(schema.users.id, debtorUserId)).limit(1);
  const [creditor] = await db.select().from(schema.users).where(eq(schema.users.id, proposal.toUser)).limit(1);
  if (!debtor || !creditor) throw new ConfirmError("unknown user", "not_pending");

  const typed = confirmTypedData(proposal, creditor.ledgerWallet as Address);
  const ok = await verifyTypedData({ ...typed, address: debtor.ledgerWallet as Address, signature });
  if (!ok) throw new ConfirmError("that did not come from your account", "bad_signature");

  // Lazy registration: the first confirmed obligation in a group or a unit registers it, with its two sides and nobody else.
  await ensureGroupOnchain(proposal.groupId, [debtorUserId, proposal.toUser]);
  await ensureDenomOnchain(proposal.denomId, [debtorUserId, proposal.toUser]);

  const { ledger } = contracts();
  const m = typed.message;
  let txHash: Hex;
  try {
    const result = await submit({
      label: `confirm ${proposal.id}`,
      address: ledger.address,
      abi: ledger.abi,
      functionName: "confirm",
      args: [m.groupId, m.denomId, m.creditor, m.qty, m.obligationId, m.unique, signature],
      gas: gasFor.confirm(),
      write: { kind: "confirm", subject: { proposalIds: [proposal.id] }, actor: debtorUserId },
    });
    txHash = result.hash;
  } catch (err) {
    if (err instanceof SendPending) throw err;
    console.error("confirm failed", { proposalId: proposal.id, err: err instanceof Error ? err.message : err });
    throw new ConfirmError("That didn’t go through. Try again.", "chain");
  }
  await completeConfirm([proposal.id], txHash);
  return { obligationId: proposal.id, txHash };
}

/**
 * The offchain mirror of a confirm once the chain has it: one shadow `obligations` row per proposal and the
 * proposals marked confirmed, from the proposals alone, idempotent, so the tick can write it for a send whose
 * receipt outlived the request (docs/decisions.md 2026-09-27, "a send is never lost"). The token ids are the
 * same derivation the signature was made over.
 */
export async function completeConfirm(proposalIds: string[], txHash: Hex): Promise<boolean> {
  const proposals = await db.select().from(schema.obligationProposals).where(inArray(schema.obligationProposals.id, proposalIds));
  if (proposals.length !== proposalIds.length) return false;
  const debtorIds = new Set(proposals.map((p) => p.fromUser));
  const [debtorId] = [...debtorIds];
  if (debtorIds.size !== 1 || !debtorId) return false;
  const [debtor] = await db.select({ ledgerWallet: schema.users.ledgerWallet }).from(schema.users).where(eq(schema.users.id, debtorId)).limit(1);
  if (!debtor || proposals.some((p) => !p.toUser)) return false;
  const debtorAddr = debtor.ledgerWallet as Address;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.obligations)
      .values(
        proposals.map((p) => {
          const groupId = groupOnchainId(p.groupId);
          const denomId = denomOnchainId(p.denomId);
          return {
            id: p.id,
            tokenId: p.uniqueObligation ? uniqueTokenId(groupId, denomId, debtorAddr, uuidToBytes16(p.id)) : fungibleTokenId(groupId, denomId, debtorAddr),
            groupId: p.groupId,
            fromUser: debtorId,
            toUser: p.toUser as string,
            denomId: p.denomId,
            quantity: p.quantity,
            uniqueObligation: p.uniqueObligation,
            amountCents: p.amountCents,
            origin: p.origin,
            originId: p.originId,
            settleExpected: p.settleExpected,
            memo: p.memo,
            confirmTx: hexToBuffer(txHash),
            createdAt: p.createdAt,
          };
        }),
      )
      .onConflictDoNothing();
    await tx.update(schema.obligationProposals).set({ status: "confirmed", resolvedAt: now }).where(and(inArray(schema.obligationProposals.id, proposalIds), eq(schema.obligationProposals.status, "pending")));
  });
  return true;
}

/** At most this many in one batch: the declared gas grows per item, and Monad charges what is declared. */
export const CONFIRM_MANY_MAX = 12;

/**
 * What the debtor signs to confirm several at once: one signature over the whole batch, in the order given.
 * The order is part of what is signed, so the page and the submit both take it from the same sorted query.
 */
export function confirmManyTypedData(proposals: ProposalRow[], creditorLedgers: Map<string, Address>) {
  const { chainId, ledger } = contracts();
  const creditors = proposals.map((p) => {
    const a = p.toUser ? creditorLedgers.get(p.toUser) : undefined;
    if (!a) throw new ConfirmError("the creditor has no account yet", "not_pending");
    return a;
  });
  return {
    domain: ledgerDomain(chainId, ledger.address),
    types: ledgerTypes,
    primaryType: "ConfirmMany" as const,
    message: {
      groupIds: proposals.map((p) => groupOnchainId(p.groupId)),
      denomIds: proposals.map((p) => denomOnchainId(p.denomId)),
      creditors,
      qtys: proposals.map((p) => p.quantity ?? 1n),
      obligationIds: proposals.map((p) => uuidToBytes16(p.id)),
      uniques: proposals.map((p) => p.uniqueObligation),
    },
  };
}

/** Loads a batch for one debtor in the order it is signed in, refusing anything that is not theirs to confirm. */
export async function loadConfirmBatch(proposalIds: string[], debtorUserId: string): Promise<{ proposals: ProposalRow[]; creditorLedgers: Map<string, Address> }> {
  if (proposalIds.length === 0) throw new ConfirmError("nothing to confirm", "not_pending");
  if (proposalIds.length > CONFIRM_MANY_MAX) throw new ConfirmError(`that is more than ${CONFIRM_MANY_MAX} at once`, "not_pending");
  if (new Set(proposalIds).size !== proposalIds.length) throw new ConfirmError("the same one is listed twice", "not_pending");
  const rows = await db.select().from(schema.obligationProposals).where(inArray(schema.obligationProposals.id, proposalIds));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const proposals = proposalIds.map((id) => {
    const p = byId.get(id);
    if (!p) throw new ConfirmError("unknown proposal", "not_pending");
    if (p.fromUser !== debtorUserId) throw new ConfirmError("only the person named can confirm this", "not_debtor");
    if (p.status !== "pending") throw new ConfirmError("one of these is already settled one way or the other", "not_pending");
    if (!p.toUser) throw new ConfirmError("the creditor has no account yet", "not_pending");
    return p;
  });
  const creditorIds = Array.from(new Set(proposals.map((p) => p.toUser).filter((x): x is string => Boolean(x))));
  const creditors = await db.select({ id: schema.users.id, ledgerWallet: schema.users.ledgerWallet }).from(schema.users).where(inArray(schema.users.id, creditorIds));
  return { proposals, creditorLedgers: new Map(creditors.map((c) => [c.id, c.ledgerWallet as Address])) };
}

/**
 * Confirm-all: the claimant's one prompt. One signature over the batch, one `confirmMany` through the relayer,
 * which mints one batch per creditor or reverts whole. Registration runs first, because a person who just
 * bound is not yet a registered member of the groups their ghost was in. Every step fails visibly.
 */
export async function confirmManyProposals(proposalIds: string[], debtorUserId: string, signature: Hex): Promise<{ obligationIds: string[]; txHash: Hex }> {
  const { proposals, creditorLedgers } = await loadConfirmBatch(proposalIds, debtorUserId);
  const [debtor] = await db.select().from(schema.users).where(eq(schema.users.id, debtorUserId)).limit(1);
  if (!debtor) throw new ConfirmError("unknown user", "not_pending");

  const typed = confirmManyTypedData(proposals, creditorLedgers);
  const ok = await verifyTypedData({ ...typed, address: debtor.ledgerWallet as Address, signature });
  if (!ok) throw new ConfirmError("that did not come from your account", "bad_signature");

  // Each set registers the debtor and the creditors whose obligations are in it, and nobody else; each unit's set the same.
  // Every creditor here has an account: the batch's loader refuses a proposal without one.
  const sidesIn = (pick: (p: (typeof proposals)[number]) => string) => {
    const sides = new Map<string, Set<string>>();
    for (const p of proposals) sides.set(pick(p), (sides.get(pick(p)) ?? new Set([debtorUserId])).add(p.toUser as string));
    return sides;
  };
  for (const [groupId, who] of sidesIn((p) => p.groupId)) await ensureGroupOnchain(groupId, [...who]);
  for (const [denomId, who] of sidesIn((p) => p.denomId)) await ensureDenomOnchain(denomId, [...who]);

  const { ledger } = contracts();
  const m = typed.message;
  let txHash: Hex;
  try {
    const result = await submit({
      label: `confirmMany ${proposals.length} for ${debtorUserId}`,
      address: ledger.address,
      abi: ledger.abi,
      functionName: "confirmMany",
      args: [m.groupIds, m.denomIds, m.creditors, m.qtys, m.obligationIds, m.uniques, signature],
      gas: gasFor.confirmMany(proposals.length),
      write: { kind: "confirm", subject: { proposalIds }, actor: debtorUserId },
    });
    txHash = result.hash;
  } catch (err) {
    if (err instanceof SendPending) throw err;
    console.error("confirmMany failed", { proposalIds, err: err instanceof Error ? err.message : err });
    throw new ConfirmError("That didn’t go through. Try again.", "chain");
  }
  await completeConfirm(proposalIds, txHash);
  return { obligationIds: proposals.map((p) => p.id), txHash };
}

export async function declineProposal(proposalId: string, debtorUserId: string): Promise<void> {
  const [proposal] = await db.select().from(schema.obligationProposals).where(eq(schema.obligationProposals.id, proposalId)).limit(1);
  if (!proposal) throw new ConfirmError("unknown proposal", "not_pending");
  if (proposal.fromUser !== debtorUserId) throw new ConfirmError("only the person named can decline this", "not_debtor");
  if (proposal.status !== "pending") throw new ConfirmError("this one is already settled one way or the other", "not_pending");
  await db
    .update(schema.obligationProposals)
    .set({ status: "declined", resolvedAt: new Date() })
    .where(eq(schema.obligationProposals.id, proposalId));
}

export async function proposalById(id: string): Promise<ProposalRow | null> {
  const [row] = await db.select().from(schema.obligationProposals).where(eq(schema.obligationProposals.id, id)).limit(1);
  return row ?? null;
}

/** Pending proposals where the user is the debtor: the things waiting for their tap. */
export async function pendingForDebtor(userId: string): Promise<ProposalRow[]> {
  return db
    .select()
    .from(schema.obligationProposals)
    .where(and(eq(schema.obligationProposals.fromUser, userId), eq(schema.obligationProposals.status, "pending")))
    .orderBy(desc(schema.obligationProposals.createdAt));
}

/** Pending proposals between two users, either direction. */
export async function pendingBetween(a: string, b: string): Promise<ProposalRow[]> {
  return db
    .select()
    .from(schema.obligationProposals)
    .where(
      and(
        eq(schema.obligationProposals.status, "pending"),
        or(
          and(eq(schema.obligationProposals.fromUser, a), eq(schema.obligationProposals.toUser, b)),
          and(eq(schema.obligationProposals.fromUser, b), eq(schema.obligationProposals.toUser, a)),
        ),
      ),
    )
    .orderBy(desc(schema.obligationProposals.createdAt));
}

export async function proposalsByIds(ids: string[]): Promise<ProposalRow[]> {
  if (ids.length === 0) return [];
  return db.select().from(schema.obligationProposals).where(inArray(schema.obligationProposals.id, ids));
}

export const asCents = cents;
export const asUnits = units;
