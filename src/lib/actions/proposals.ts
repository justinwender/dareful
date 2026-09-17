"use server";

import { redirect } from "next/navigation";
import { isHex } from "viem";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { ensureUsd } from "@/lib/ledger/denominations";
import { ensureDyad } from "@/lib/ledger/groups";
import { confirmProposal, ConfirmError, declineProposal, proposeCover } from "@/lib/ledger/proposals";
import { cents, units } from "@/lib/money";

const Propose = z.object({
  debtorUserId: z.string().uuid(),
  groupId: z.string().uuid().nullable(),
  /** "usd" means the group's built-in dollar unit; otherwise a denomination id. */
  unit: z.string().min(1),
  quantity: z.string().regex(/^\d+$/).nullable(),
  amountCents: z.string().regex(/^\d+$/).nullable(),
  settleExpected: z.boolean(),
  memo: z.string().trim().max(140).optional(),
});

export type ProposeInput = z.infer<typeof Propose>;

export async function proposeCoverAction(input: ProposeInput): Promise<{ error: string } | never> {
  const user = await requireUser();
  const parsed = Propose.safeParse(input);
  if (!parsed.success) return { error: "Something in that form is off." };
  const d = parsed.data;
  let groupId = d.groupId;
  if (!groupId) groupId = (await ensureDyad(user.id, d.debtorUserId)).id;
  let denomId = d.unit;
  if (d.unit === "usd") denomId = (await ensureUsd(groupId, user.id)).id;
  const amount = d.amountCents !== null ? cents(BigInt(d.amountCents)) : null;
  const qty = d.unit === "usd" ? (amount === null ? null : units(amount)) : d.quantity !== null ? units(BigInt(d.quantity)) : null;
  try {
    await proposeCover({
      creditorId: user.id,
      debtorUserId: d.debtorUserId,
      groupId,
      denomId,
      quantity: qty,
      amountCents: amount,
      settleExpected: d.settleExpected,
      memo: d.memo,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't save that." };
  }
  redirect(`/p/${d.debtorUserId}`);
}

export async function confirmProposalAction(proposalId: string, signature: string): Promise<{ ok: true; txHash: string } | { error: string }> {
  const user = await requireUser();
  if (!isHex(signature)) return { error: "That signature didn't come through." };
  try {
    const result = await confirmProposal(proposalId, user.id, signature);
    return { ok: true, txHash: result.txHash };
  } catch (err) {
    if (err instanceof ConfirmError) return { error: err.message };
    return { error: "That didn't go through. Try again." };
  }
}

export async function declineProposalAction(proposalId: string): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  try {
    await declineProposal(proposalId, user.id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof ConfirmError ? err.message : "That didn't go through. Try again." };
  }
}
