/**
 * Drafts (the first-contact round, 2026-10-04): a question saved and never sent is its asker's alone. It is a Needs
 * you row for a day, and after that it lives on You until it is sent or discarded. Discarding takes it away for
 * good: it was never sent, so nobody saw it and nothing of it is on the ledger.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { MarketError } from "./markets";

/** How long an unsent draft stays on Now. */
export const DRAFT_ON_NOW_MS = 24 * 3_600_000;

/** Whether a draft is still on Now: less than a day since it was saved. */
export function draftOnNow(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() < DRAFT_ON_NOW_MS;
}

/** This person's unsent drafts, newest first. */
export async function unsentDrafts(userId: string, limit = 20): Promise<Array<{ id: string; title: string; createdAt: Date }>> {
  return db
    .select({ id: schema.dares.id, title: schema.dares.title, createdAt: schema.dares.createdAt })
    .from(schema.dares)
    .where(and(eq(schema.dares.creatorId, userId), isNull(schema.dares.creatorSignature), isNull(schema.dares.resolvedAt)))
    .orderBy(desc(schema.dares.createdAt))
    .limit(limit);
}

/** Discards a draft: its asker's, and never sent, or nothing happens. */
export async function discardDraft(dareId: string, userId: string): Promise<void> {
  const gone = await db
    .delete(schema.dares)
    .where(and(eq(schema.dares.id, dareId), eq(schema.dares.creatorId, userId), isNull(schema.dares.creatorSignature)))
    .returning({ id: schema.dares.id });
  if (gone.length === 0) throw new MarketError("That one was already sent, or isn't yours.", "wrong_state");
}
