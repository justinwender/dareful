"use server";

import type { Hex } from "viem";
import { currentUser } from "@/lib/auth/session";
import { WORDS } from "@/lib/ui/errors";
import { delegatedSignatureFor, PassThePhoneError, passThePhoneStatus, setPin, turnOffPassThePhone } from "@/lib/ledger/pass-the-phone";
import { Via } from "@/lib/ledger/via";

/**
 * Pass the phone (docs/design.md 3.45; docs/decisions.md 2026-09-28). Turning it on is two things in one
 * flow on the person's own phone: the SDK delegates the ledger wallet (the client's own call, whose result
 * lands through the webhook), and this sets the PIN. Nothing here logs or returns the PIN.
 */
export async function turnOnPassThePhoneAction(rawPin: string): Promise<{ ok: true } | { error: string }> {
  const user = await currentUser();
  if (!user) return { error: WORDS.signedOut };
  try {
    await setPin(user.id, typeof rawPin === "string" ? rawPin : "");
  } catch (err) {
    return { error: err instanceof PassThePhoneError ? err.message : "That didn't go through. Try again." };
  }
  return { ok: true };
}

/** Turning it off: the stored share wiped now, the PIN cleared; Dynamic's own revocation lands after and finds nothing. */
export async function turnOffPassThePhoneAction(): Promise<{ ok: true } | { error: string }> {
  const user = await currentUser();
  if (!user) return { error: WORDS.signedOut };
  await turnOffPassThePhone(user.id);
  return { ok: true };
}

/** Whether the delegation has landed and the PIN is set, for the row on You while it is being set up. */
export async function passThePhoneStatusAction(): Promise<{ on: boolean; delegated: boolean; pinSet: boolean }> {
  const user = await currentUser();
  if (!user) return { on: false, delegated: false, pinSet: false };
  return passThePhoneStatus(user.id);
}

/**
 * A second device of this person's without the Dynamic login (3.41, amended 2026-09-28): the server signs the
 * named routine action from its own inputs, with this person's delegated share, recorded against this request.
 * Null means the device prompts as before. The client names the action and the ids; it never sends typed data.
 */
export async function signFromThisDeviceAction(rawVia: unknown): Promise<{ ok: true; signature: Hex } | { ok: false }> {
  const user = await currentUser();
  if (!user) return { ok: false };
  const via = Via.safeParse(rawVia);
  if (!via.success) return { ok: false };
  try {
    const signature = await delegatedSignatureFor(user.id, via.data, "signFromThisDeviceAction");
    return signature ? { ok: true, signature } : { ok: false };
  } catch (err) {
    if (!(err instanceof PassThePhoneError)) console.error("signing from this device failed", err instanceof Error ? err.message : err);
    return { ok: false };
  }
}
