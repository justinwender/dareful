/**
 * Covering several people at once, in the expense shape PLANNING.md section 5b already defines: one expense,
 * its items, who claimed what share, and at finalization one obligation proposal per non-payer. This is the
 * manual entry path ("one total, pick who was there"); receipt parsing (Phase 8) fills the same tables from a
 * photo. Nothing here is onchain: each proposal mints, if and when its debtor confirms, through `confirm()`.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { unarchiveForEveryone } from "./groups";
import { ensureUsd, touchDenomination } from "./denominations";
import { splitTotal, SplitError } from "./split";

export type SplitCoverInput = {
  payerId: string;
  groupId: string;
  /** Account-holders who were in on it, other than the payer. */
  presentUserIds: string[];
  totalCents: bigint;
  payerIn: boolean;
  fixed?: ReadonlyMap<string, bigint>;
  settleExpected: boolean;
  memo?: string;
};

export async function splitCover(input: SplitCoverInput): Promise<{ expenseId: string; proposalIds: string[] }> {
  const present = Array.from(new Set(input.presentUserIds)).filter((id) => id !== input.payerId);
  const split = splitTotal({ totalCents: input.totalCents, present, payerIn: input.payerIn, fixed: input.fixed });

  const seated = await db
    .select({ userId: schema.groupMembers.userId })
    .from(schema.groupMembers)
    .where(and(eq(schema.groupMembers.groupId, input.groupId), inArray(schema.groupMembers.userId, [input.payerId, ...present]), isNull(schema.groupMembers.leftAt)));
  const inGroup = new Set(seated.map((s) => s.userId));
  if (!inGroup.has(input.payerId)) throw new SplitError("You're not in that group.");
  if (present.some((id) => !inGroup.has(id))) throw new SplitError("Everyone you pick has to be in the group.");

  const usd = await ensureUsd(input.groupId, input.payerId);
  const memo = input.memo?.trim() || null;
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    const [expense] = await tx
      .insert(schema.expenses)
      .values({ groupId: input.groupId, payerId: input.payerId, totalCents: input.totalCents, subtotalCents: input.totalCents, occurredAt: now, source: "manual", status: "finalized", createdBy: input.payerId, merchant: memo })
      .returning({ id: schema.expenses.id });
    if (!expense) throw new Error("could not save that");
    const [item] = await tx
      .insert(schema.expenseItems)
      .values({ expenseId: expense.id, name: memo ?? "Total", unitPriceCents: input.totalCents, lineTotalCents: input.totalCents })
      .returning({ id: schema.expenseItems.id });
    if (!item) throw new Error("could not save that");

    // Who had what share of the one line, as exact fractions of the total, so the rows reconcile by themselves.
    const den = Number(input.totalCents);
    if (!Number.isSafeInteger(den) || den > 2_000_000_000) throw new SplitError("That total is too large.");
    const claims = [...split.shares.map((s) => ({ userId: s.personId, cents: s.cents })), { userId: input.payerId, cents: split.payerCents }].filter((c) => c.cents > 0n);
    await tx.insert(schema.itemClaims).values(claims.map((c) => ({ expenseItemId: item.id, userId: c.userId, shareNum: Number(c.cents), shareDen: den })));

    const owed = split.shares.filter((s) => s.cents > 0n);
    const proposals = owed.length
      ? await tx
          .insert(schema.obligationProposals)
          .values(owed.map((s) => ({ groupId: input.groupId, fromUser: s.personId, toUser: input.payerId, denomId: usd.id, quantity: s.cents, amountCents: s.cents, origin: "expense", originId: expense.id, settleExpected: input.settleExpected, memo, status: "pending" })))
          .returning({ id: schema.obligationProposals.id, quantity: schema.obligationProposals.quantity })
      : [];

    // Principle 9: what was written adds back up to the total, or none of it is kept.
    const written = proposals.reduce((a, p) => a + (p.quantity ?? 0n), 0n) + split.payerCents;
    if (written !== input.totalCents) throw new Error(`split wrote ${written} of ${input.totalCents} cents`);
    return { expenseId: expense.id, proposalIds: proposals.map((p) => p.id) };
  });
  await touchDenomination(usd.id);
  await unarchiveForEveryone(input.groupId);
  return result;
}
