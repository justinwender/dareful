"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isHex } from "viem";
import { z } from "zod";
import { regionFromHeaders, tryHashPhone } from "@/lib/auth/phone";
import { requireUser } from "@/lib/auth/session";
import { ClaimError, ensureDyadWithClaim, resolvePicked, spendContactResolution, type Person } from "@/lib/ledger/claims";
import { denominationById, ensureUnitInGroup, ensureUsd } from "@/lib/ledger/denominations";
import { splitCover } from "@/lib/ledger/expenses";
import { SplitError } from "@/lib/ledger/split";
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

/**
 * What it was. Dollars, a unit the group already has, or a unit named in the form just now: that one is
 * registered with the group when the cover is saved, which is what lets two people use "a next time" before
 * their dyad exists.
 */
const Unit = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("usd") }),
  z.object({ kind: z.literal("existing"), id: z.string().uuid() }),
  z.object({ kind: z.literal("new"), template: z.enum(["beer", "coffee", "round", "next_time"]).nullable(), label: z.string().trim().min(1).max(40), markEmoji: z.string().trim().max(16).optional() }),
]);

const Propose = z.object({
  who: Who,
  groupId: z.string().uuid().nullable(),
  unit: Unit,
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
    const amount = d.amountCents !== null ? cents(BigInt(d.amountCents)) : null;
    // The same check the form makes, made again here: a request that skipped the form must not reach the
    // ledger's generic refusal ("how many?") when the person's actual mistake was leaving the amount empty.
    if (d.unit.kind === "usd" && (amount === null || amount <= 0n)) return { error: "Add the amount first." };
    const denom = d.unit.kind === "usd" ? await ensureUsd(groupId, user.id) : d.unit.kind === "existing" ? await denominationById(d.unit.id) : await ensureUnitInGroup(groupId, user.id, d.unit);
    if (!denom) return { error: "That unit isn't around any more. Pick another." };
    const denomId = denom.id;
    const qty = denom.monetary ? (amount === null ? null : units(amount)) : denom.quantifiable ? units(BigInt(d.quantity ?? "1")) : null;
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

const Split = z.object({
  groupId: z.string().uuid(),
  present: z.array(z.string().uuid()).min(1).max(30),
  totalCents: z.string().regex(/^\d{1,12}$/),
  payerIn: z.boolean(),
  /** Only the people whose amount was changed by hand; everyone else splits what is left. */
  fixed: z.array(z.object({ userId: z.string().uuid(), cents: z.string().regex(/^\d{1,12}$/) })).max(30),
  settleExpected: z.boolean(),
  memo: z.string().trim().max(140).optional(),
});

export type SplitInput = z.infer<typeof Split>;

/** One total, several people: one proposal per person who was there, the odd cent stays with whoever paid. */
export async function splitCoverAction(input: SplitInput): Promise<{ error: string } | never> {
  const user = await requireUser();
  const parsed = Split.safeParse(input);
  if (!parsed.success) return { error: "Something in that form is off." };
  const d = parsed.data;
  try {
    await splitCover({
      payerId: user.id,
      groupId: d.groupId,
      presentUserIds: d.present,
      totalCents: BigInt(d.totalCents),
      payerIn: d.payerIn,
      fixed: new Map(d.fixed.map((f) => [f.userId, BigInt(f.cents)])),
      settleExpected: d.settleExpected,
      memo: d.memo,
    });
  } catch (err) {
    return { error: err instanceof SplitError ? err.message : "Couldn't save that. Nothing was logged." };
  }
  redirect("/");
}
