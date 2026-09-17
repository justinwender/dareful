/**
 * Manual obligations: the creditor authors ("I got this one"), the debtor confirms with one tap, and nothing
 * exists on the ledger until the debtor has signed. Principle 2, enforced here and in the contract.
 */
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { verifyTypedData, type Address, type Hex } from "viem";
import { db, schema } from "@/db";
import { contracts } from "@/lib/chain/contracts";
import { gasFor } from "@/lib/chain/gas";
import { submit } from "@/lib/chain/relayer";
import { ledgerDomain, ledgerTypes } from "@/lib/chain/typed-data";
import { cents, units, type Cents, type Units } from "@/lib/money";
import { denominationById, touchDenomination } from "./denominations";
import { ensureDyad, isMember } from "./groups";
import { denomOnchainId, groupOnchainId, hexToBuffer, uuidToBytes16 } from "./ids";
import { ensureDenomOnchain, ensureGroupOnchain } from "./registry";
import { encodeAbiParameters, keccak256 } from "viem";

export type ProposalRow = typeof schema.obligationProposals.$inferSelect;

export type ProposeCoverInput = {
  creditorId: string; // the signed-in user; only the person who covered can create the obligation
  debtorUserId: string;
  groupId?: string; // omitted: the implicit dyad
  denomId: string;
  quantity: Units | null; // null iff the denomination is unquantifiable
  amountCents: Cents | null; // the magnitude, retained off the chain, never rendered for a non-monetary unit
  settleExpected: boolean;
  memo?: string;
};

export async function proposeCover(input: ProposeCoverInput): Promise<ProposalRow> {
  if (input.creditorId === input.debtorUserId) throw new Error("you cannot cover yourself");
  const denom = await denominationById(input.denomId);
  if (!denom) throw new Error("unknown unit");
  let groupId = input.groupId;
  if (!groupId) {
    const dyad = await ensureDyad(input.creditorId, input.debtorUserId);
    groupId = dyad.id;
  }
  if (denom.groupId !== groupId) throw new Error("that unit belongs to another group");
  if (!(await isMember(groupId, input.creditorId)) || !(await isMember(groupId, input.debtorUserId))) {
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
      fromUser: input.debtorUserId,
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
  if (!ok) throw new ConfirmError("that signature does not belong to you", "bad_signature");

  // Lazy registration: the first confirmed obligation in a group or a unit registers it.
  await ensureGroupOnchain(proposal.groupId);
  await ensureDenomOnchain(proposal.denomId);

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
    });
    txHash = result.hash;
  } catch (err) {
    throw new ConfirmError(err instanceof Error ? err.message : "the chain write failed", "chain");
  }

  const debtorAddr = debtor.ledgerWallet as Address;
  const tokenId = m.unique ? uniqueTokenId(m.groupId, m.denomId, debtorAddr, m.obligationId) : fungibleTokenId(m.groupId, m.denomId, debtorAddr);
  await db.transaction(async (tx) => {
    await tx.insert(schema.obligations).values({
      id: proposal.id,
      tokenId,
      groupId: proposal.groupId,
      fromUser: debtorUserId,
      toUser: creditor.id,
      denomId: proposal.denomId,
      quantity: proposal.quantity,
      uniqueObligation: proposal.uniqueObligation,
      amountCents: proposal.amountCents,
      origin: proposal.origin,
      originId: proposal.originId,
      settleExpected: proposal.settleExpected,
      memo: proposal.memo,
      confirmTx: hexToBuffer(txHash),
      createdAt: proposal.createdAt,
    });
    await tx
      .update(schema.obligationProposals)
      .set({ status: "confirmed", resolvedAt: new Date() })
      .where(eq(schema.obligationProposals.id, proposal.id));
  });
  return { obligationId: proposal.id, txHash };
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
