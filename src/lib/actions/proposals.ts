"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isHex } from "viem";
import { z } from "zod";
import { regionFromHeaders, tryHashPhone } from "@/lib/auth/phone";
import { requireUser } from "@/lib/auth/session";
import { ClaimError, ensureDyadWithClaim, resolvePicked, spendContactResolution, type Person } from "@/lib/ledger/claims";
import { ensureUsd } from "@/lib/ledger/denominations";
import { ensureDyad } from "@/lib/ledger/groups";
import { CONFIRM_MANY_MAX, confirmManyProposals, confirmProposal, ConfirmError, declineProposal, proposeCover } from "@/lib/ledger/proposals";
import { cents, units } from "@/lib/money";

/**
 * Who the cover is for. An account-holder or an existing ghost by id, or someone new: a name, and the number
 * from the contact card when they were picked rather than typed. The number is hashed here and goes no
 * further: it is never stored, logged, or returned.
 */
const Who = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user"), userId: z.string().uuid() }),
  z.object({ kind: z.literal("claim"), claimId: z.string().uuid() }),
  z.object({ kind: z.literal("new"), name: z.string().trim().min(1).max(40), phone: z.string().max(40).optional() }),
]);

const Propose = z.object({
  who: Who,
  groupId: z.string().uuid().nullable(),
  /** "usd" means the group's built-in dollar unit; otherwise a denomination id. */
  unit: z.string().min(1),
  quantity: z.string().regex(/^\d+$/).nullable(),
  amountCents: z.string().regex(/^\d+$/).nullable(),
  settleExpected: z.boolean(),
  memo: z.string().trim().max(140).optional(),
});

export type ProposeInput = z.infer<typeof Propose>;

function pathFor(p: Person): string {
  return p.kind === "user" ? `/p/${p.userId}` : `/p/c/${p.claimId}`;
}

export async function proposeCoverAction(input: ProposeInput): Promise<{ error: string } | never> {
  const user = await requireUser();
  const parsed = Propose.safeParse(input);
  if (!parsed.success) return { error: "Something in that form is off." };
  const d = parsed.data;

  let debtor: Person;
  try {
    if (d.who.kind === "new") {
      // A number that does not parse is treated as no number: the person is still added, by name.
      if (d.who.phone) await spendContactResolution(user.id);
      const phoneHash = d.who.phone ? tryHashPhone(d.who.phone, regionFromHeaders(await headers())) : null;
      debtor = await resolvePicked({ creatorId: user.id, displayName: d.who.name, phoneHash });
    } else {
      debtor = d.who;
    }
  } catch (err) {
    if (err instanceof ClaimError && err.code === "slow_down") return { error: "That’s a lot of new people at once. Give it an hour, or add them by name for now." };
    return { error: err instanceof ClaimError && err.code === "is_you" ? "That one is you." : "Couldn't add that person." };
  }

  let made: { id: string };
  try {
    let groupId = d.groupId;
    if (!groupId) groupId = (debtor.kind === "user" ? await ensureDyad(user.id, debtor.userId) : await ensureDyadWithClaim(user.id, debtor.claimId)).id;
    let denomId = d.unit;
    if (d.unit === "usd") denomId = (await ensureUsd(groupId, user.id)).id;
    const amount = d.amountCents !== null ? cents(BigInt(d.amountCents)) : null;
    const qty = d.unit === "usd" ? (amount === null ? null : units(amount)) : d.quantity !== null ? units(BigInt(d.quantity)) : null;
    made = await proposeCover({
      creditorId: user.id,
      debtor,
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
  // Someone new lands on the cover itself, the same place whether their number turned out to belong to an
  // account or not, so the answer to this request never says which.
  redirect(d.who.kind === "new" ? `/o/${made.id}` : pathFor(debtor));
}

export async function confirmProposalAction(proposalId: string, signature: string): Promise<{ ok: true; txHash: string } | { error: string }> {
  const user = await requireUser();
  if (!isHex(signature)) return { error: "That didn't come through. Try again." };
  try {
    const result = await confirmProposal(proposalId, user.id, signature);
    return { ok: true, txHash: result.txHash };
  } catch (err) {
    if (err instanceof ConfirmError) return { error: err.message };
    return { error: "That didn't go through. Try again." };
  }
}

const Batch = z.array(z.string().uuid()).min(1).max(CONFIRM_MANY_MAX);

/** Confirm-all: one prompt for the batch. The ids arrive in the order they were signed in. */
export async function confirmManyAction(proposalIds: string[], signature: string): Promise<{ ok: true; txHash: string; count: number } | { error: string }> {
  const user = await requireUser();
  const ids = Batch.safeParse(proposalIds);
  if (!ids.success || !isHex(signature)) return { error: "That didn't come through. Try again." };
  try {
    const result = await confirmManyProposals(ids.data, user.id, signature);
    return { ok: true, txHash: result.txHash, count: result.obligationIds.length };
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
