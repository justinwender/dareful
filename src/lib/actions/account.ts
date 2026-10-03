"use server";

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentUser } from "@/lib/auth/session";
import { WORDS } from "@/lib/ui/errors";

/**
 * The heads-up ask is answered once, on the account (docs/design.md 4.10): a yes, a no, the phone's own no or a
 * dismissal all end it, and no phone of this person's asks again. Nothing here says which answer it was: push is
 * the phone's permission and the subscription is the record of a yes.
 */
export async function headsUpAnsweredAction(): Promise<{ ok: true } | { error: string }> {
  const user = await currentUser();
  if (!user) return { error: WORDS.signedOut };
  await db.update(schema.users).set({ headsUpAnsweredAt: new Date() }).where(eq(schema.users.id, user.id));
  return { ok: true };
}
