"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { currentUser } from "@/lib/auth/session";
import { WORDS } from "@/lib/ui/errors";

/** A screen's first tip has shown (docs/design.md 10.9): on the account, so leaving halfway never brings them back. */
export async function tipsShownAction(rawScreen: string): Promise<{ ok: true } | { error: string }> {
  const user = await currentUser();
  if (!user) return { error: WORDS.signedOut };
  const screen = z.string().regex(/^\/[a-z0-9/[\]-]{0,39}$/).safeParse(rawScreen);
  if (!screen.success) return { ok: true };
  await db
    .update(schema.users)
    .set({ tipsSeen: sql`array_append(${schema.users.tipsSeen}, ${screen.data})` })
    .where(and(eq(schema.users.id, user.id), sql`not (${screen.data} = any(${schema.users.tipsSeen}))`));
  return { ok: true };
}
