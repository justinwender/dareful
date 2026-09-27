"use server";

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth/session";

/**
 * The heads-up ask is answered once, on the account (docs/design.md 4.10): a yes, a no, the phone's own no or a
 * dismissal all end it, and no phone of this person's asks again. Nothing here says which answer it was: push is
 * the phone's permission and the subscription is the record of a yes.
 */
export async function headsUpAnsweredAction(): Promise<{ ok: true }> {
  const user = await requireUser();
  await db.update(schema.users).set({ headsUpAnsweredAt: new Date() }).where(eq(schema.users.id, user.id));
  return { ok: true };
}
