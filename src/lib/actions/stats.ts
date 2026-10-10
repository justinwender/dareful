"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth/session";
import { isOwner } from "@/lib/usage/owner";
import { backfillSnapshots, dayOf, takeSnapshot } from "@/lib/usage/stats";
import { WORDS } from "@/lib/ui/errors";
import { db, schema } from "@/db";
import { centsFromTyped } from "@/lib/ai/spend";

/** Today's numbers written as a snapshot (the field round, 3.1); the owner alone, and anyone else is answered as if the door were not there. */
export async function takeSnapshotAction(): Promise<{ ok: true } | { error: string }> {
  const user = await currentUser();
  if (!user) return { error: WORDS.signedOut };
  if (!isOwner(user.id)) return { error: "That one doesn't exist." };
  await takeSnapshot(dayOf(new Date()));
  revalidatePath("/stats");
  return { ok: true };
}

/** Every day since the first event that has no snapshot gets one. */
export async function backfillSnapshotsAction(): Promise<{ ok: true; days: number } | { error: string }> {
  const user = await currentUser();
  if (!user) return { error: WORDS.signedOut };
  if (!isOwner(user.id)) return { error: "That one doesn't exist." };
  const days = await backfillSnapshots(new Date());
  revalidatePath("/stats");
  return { ok: true, days: days.length };
}

/**
 * The model API's credit as the owner reads it after a top-up (the ops round, section 1): what the runway counts down
 * from, less what the app spends after this moment. The owner alone, as the page itself.
 */
export async function enterCreditAction(typed: string): Promise<{ ok: true } | { error: string }> {
  const user = await currentUser();
  if (!user) return { error: WORDS.signedOut };
  if (!isOwner(user.id)) return { error: "That one doesn't exist." };
  const cents = centsFromTyped(typed);
  if (cents === null) return { error: "Type the balance in dollars, like 20 or 12.50." };
  await db.insert(schema.anthropicCredit).values({ cents, enteredBy: user.id });
  revalidatePath("/stats");
  return { ok: true };
}
