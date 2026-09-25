"use server";

import { isHex, type Hex } from "viem";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth/session";
import { CloseError, closeObligation, closeState, closeTypedData, netBetween, netNonce, netTypedData, type ReasonWord } from "@/lib/ledger/closes";
import { denomOnchainId, groupOnchainId } from "@/lib/ledger/ids";
import { notifyClosed, notifyNetted } from "@/lib/notify";
import type { Address } from "viem";

const Reason = z.enum(["settled", "forgiven"]);
const Uuid = z.string().uuid();

const PLAIN = "That didn't go through. Try again.";

/**
 * What the creditor's Close signature has to cover, read fresh: the obligation's token, everything still open
 * on it, and its close counter. The reason is the person's to pick on the sheet, so the message goes back
 * without one and the client fills it in before signing.
 */
export async function closePayloadAction(obligationId: string): Promise<{ ok: true; ledgerWallet: string; message: { id: string; qty: string; obligationId: Hex; nonce: string } } | { error: string }> {
  const user = await requireUser();
  if (!Uuid.safeParse(obligationId).success) return { error: PLAIN };
  const [o] = await db.select({ toUser: schema.obligations.toUser }).from(schema.obligations).where(eq(schema.obligations.id, obligationId)).limit(1);
  if (!o || o.toUser !== user.id) return { error: "Only the person who is owed this can close it." };
  try {
    const state = await closeState(obligationId);
    if (state.remaining === 0n) return { error: "Nothing is open on this one any more." };
    const typed = closeTypedData({ obligationId, tokenId: state.tokenId, qty: state.remaining, reason: "settled", nonce: state.nonce });
    return { ok: true, ledgerWallet: user.ledgerWallet, message: { id: typed.message.id.toString(), qty: typed.message.qty.toString(), obligationId: typed.message.obligationId, nonce: typed.message.nonce.toString() } };
  } catch (err) {
    return { error: err instanceof CloseError ? err.message : PLAIN };
  }
}

/** The creditor's one tap: settled or forgiven, everything still open, signed with their ledger wallet. */
export async function closeObligationAction(obligationId: string, reason: ReasonWord, signature: string): Promise<{ ok: true; txHash: string } | { error: string }> {
  const user = await requireUser();
  const r = Reason.safeParse(reason);
  if (!Uuid.safeParse(obligationId).success || !r.success || !isHex(signature)) return { error: "That didn't come through. Try again." };
  try {
    const result = await closeObligation({ obligationId, creditorUserId: user.id, reason: r.data, signature });
    void notifyClosed(obligationId, r.data, user.id).catch(() => undefined);
    return { ok: true, txHash: result.txHash };
  } catch (err) {
    return { error: err instanceof CloseError ? err.message : PLAIN };
  }
}

/** What a Net signature has to cover: the unit, the set of people, the two of you, and the pair's counter. */
export async function netPayloadAction(otherUserId: string, groupId: string, denomId: string): Promise<{ ok: true; ledgerWallet: string; message: { groupId: Hex; denomId: Hex; a: Address; b: Address; nonce: string } } | { error: string }> {
  const user = await requireUser();
  if (![otherUserId, groupId, denomId].every((v) => Uuid.safeParse(v).success)) return { error: PLAIN };
  const [them] = await db.select({ ledgerWallet: schema.users.ledgerWallet }).from(schema.users).where(eq(schema.users.id, otherUserId)).limit(1);
  if (!them) return { error: PLAIN };
  try {
    const g = groupOnchainId(groupId);
    const d = denomOnchainId(denomId);
    const a = user.ledgerWallet as Address;
    const b = them.ledgerWallet as Address;
    const nonce = await netNonce(g, d, a, b);
    const typed = netTypedData({ groupId: g, denomId: d, a, b, nonce });
    return { ok: true, ledgerWallet: user.ledgerWallet, message: { ...typed.message, nonce: nonce.toString() } };
  } catch {
    return { error: PLAIN };
  }
}

/** Either party's one tap: what goes both ways in this unit, in this set of people, cancels by the smaller side. */
export async function netAction(otherUserId: string, groupId: string, denomId: string, signature: string): Promise<{ ok: true; txHash: string } | { error: string }> {
  const user = await requireUser();
  if (![otherUserId, groupId, denomId].every((v) => Uuid.safeParse(v).success) || !isHex(signature)) return { error: "That didn't come through. Try again." };
  try {
    const result = await netBetween({ signerUserId: user.id, otherUserId, groupId, denomId, signature });
    void notifyNetted(otherUserId, user.id, denomId).catch(() => undefined);
    return { ok: true, txHash: result.txHash };
  } catch (err) {
    return { error: err instanceof CloseError ? err.message : PLAIN };
  }
}
