/**
 * The two swipes on Now (docs/design.md 3.15): removing a market you asked that nobody else is in, and archiving a
 * finished one off your own Now. Removing ends the market as a void only the asker can make and only while they
 * are its one participant: nothing of it is on the chain yet (a market goes onchain at lock, and a lock takes
 * two), so no contract question arises and the stake, which never left, comes back; it never reaches Just
 * happened, You leaves it out as it does expiry, and anyone the link reached who opens it later sees "Called off"
 * with "Nobody else got in." Archiving changes nothing but this person's Now: the market, its story and its
 * photos stay where they were for everyone. A game's questions in one set are one row on Now, and swipe as one
 * (ruled 2026-09-27): archived together when the game is finished, removed together only when nobody else is in
 * any of them.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { marketById, MarketError, positionsOf, stateOf, VOID_OUTCOME } from "./markets";
import { ENDED } from "@/lib/media/roles";

/** A game's questions are one row on Now (4.7) and swipe as one (ruled 2026-09-27): removed only when nobody else is in any of them, archived when it is finished. */
export const SWIPE_AT_MOST = 12;

/** Whether this question could be removed by this person: theirs, open, and with nobody else in. Throws the reason otherwise. */
async function removableBy(dareId: string, byUserId: string): Promise<string> {
  const d = await marketById(dareId);
  if (!d) throw new MarketError("That one doesn't exist.", "not_found");
  if (d.creatorId !== byUserId) throw new MarketError("Only the person who asked it can remove it.", "not_yours");
  if (stateOf(d) !== "open") throw new MarketError("It can't be removed now.", "wrong_state");
  const positions = await positionsOf(d.id);
  if (positions.some((p) => p.userId !== byUserId)) throw new MarketError("Someone else is in, so it isn't yours alone to remove.", "wrong_state");
  return d.id;
}

export async function removeMarket(dareId: string, byUserId: string, now: Date = new Date()): Promise<void> {
  return removeMarkets([dareId], byUserId, now);
}

/**
 * Several at once, for a game's row: every question is checked first and all of them go together, so a game with
 * one question somebody else is in is not half removed.
 */
export async function removeMarkets(dareIds: readonly string[], byUserId: string, now: Date = new Date()): Promise<void> {
  const ids = Array.from(new Set(dareIds));
  if (ids.length === 0 || ids.length > SWIPE_AT_MOST) throw new MarketError("That one doesn't exist.", "not_found");
  for (const id of ids) await removableBy(id, byUserId);
  const rows = await db
    .update(schema.dares)
    .set({ lockedAt: now, resolvedAt: now, resolvedBy: "removed", resolvedOutcome: VOID_OUTCOME })
    .where(and(inArray(schema.dares.id, ids), eq(schema.dares.creatorId, byUserId)))
    .returning({ id: schema.dares.id });
  if (rows.length !== ids.length) throw new MarketError("Couldn't remove it.", "chain");
}

export async function archiveMarket(dareId: string, userId: string): Promise<void> {
  return archiveMarkets([dareId], userId);
}

/** Several at once, for a game's row: every question must have ended, and then all of them leave this person's Now. */
export async function archiveMarkets(dareIds: readonly string[], userId: string): Promise<void> {
  const ids = Array.from(new Set(dareIds));
  if (ids.length === 0 || ids.length > SWIPE_AT_MOST) throw new MarketError("That one doesn't exist.", "not_found");
  for (const id of ids) {
    const d = await marketById(id);
    if (!d) throw new MarketError("That one doesn't exist.", "not_found");
    if (!ENDED.has(stateOf(d))) throw new MarketError("It's still running.", "wrong_state");
  }
  await db.insert(schema.nowArchive).values(ids.map((dareId) => ({ userId, dareId }))).onConflictDoNothing();
}

/** The markets this person has swiped off their Now. */
export async function archivedFor(userId: string): Promise<Set<string>> {
  const rows = await db.select({ dareId: schema.nowArchive.dareId }).from(schema.nowArchive).where(eq(schema.nowArchive.userId, userId));
  return new Set(rows.map((r) => r.dareId));
}
