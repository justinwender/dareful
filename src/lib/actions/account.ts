"use server";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { currentUser } from "@/lib/auth/session";
import { nameProblem, ownUnitOf } from "@/lib/ledger/settings";
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

/** Your name, changed on You (the touch-ups round, section 11): the rule the sign-up step keeps, said at the field. */
export async function renameAction(raw: string): Promise<{ ok: true; name: string } | { error: string }> {
  const user = await currentUser();
  if (!user) return { error: WORDS.signedOut };
  const typed = z.string().max(200).safeParse(raw);
  if (!typed.success) return { error: "That’s longer than a name." };
  const problem = nameProblem(typed.data);
  if (problem) return { error: problem };
  const name = typed.data.trim();
  await db.update(schema.users).set({ displayName: name }).where(eq(schema.users.id, user.id));
  return { ok: true, name };
}

/** A stake unit of your own, added on You and offered when you ask (the touch-ups round, section 11). */
export async function addOwnUnitAction(raw: string): Promise<{ ok: true; units: string[] } | { error: string }> {
  const user = await currentUser();
  if (!user) return { error: WORDS.signedOut };
  const typed = z.string().max(200).safeParse(raw);
  if (!typed.success) return { error: "A unit is a word or two." };
  const unit = ownUnitOf(typed.data, user.ownUnits ?? []);
  if ("error" in unit) return unit;
  const [row] = await db
    .update(schema.users)
    .set({ ownUnits: sql`array_append(${schema.users.ownUnits}, ${unit.label})` })
    .where(eq(schema.users.id, user.id))
    .returning({ ownUnits: schema.users.ownUnits });
  return { ok: true, units: row?.ownUnits ?? [] };
}

/** One of your own units taken off: questions already asked with it keep it. */
export async function removeOwnUnitAction(label: string): Promise<{ ok: true; units: string[] } | { error: string }> {
  const user = await currentUser();
  if (!user) return { error: WORDS.signedOut };
  const typed = z.string().trim().min(1).max(40).safeParse(label);
  if (!typed.success) return { ok: true, units: user.ownUnits ?? [] };
  const [row] = await db
    .update(schema.users)
    .set({ ownUnits: sql`array_remove(${schema.users.ownUnits}, ${typed.data})` })
    .where(eq(schema.users.id, user.id))
    .returning({ ownUnits: schema.users.ownUnits });
  return { ok: true, units: row?.ownUnits ?? [] };
}
