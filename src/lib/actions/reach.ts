"use server";

import { currentUser } from "@/lib/auth/session";
import { markReachCardShown } from "@/lib/ledger/reach";
import { WORDS } from "@/lib/ui/errors";

/** The one card offering an email or Google was on screen (the first-contact round): it never comes back. */
export async function reachCardShownAction(): Promise<{ ok: true } | { error: string }> {
  const user = await currentUser();
  if (!user) return { error: WORDS.signedOut };
  await markReachCardShown(user.id, new Date());
  return { ok: true };
}
