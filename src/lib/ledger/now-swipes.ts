/**
 * The two swipes on Now (docs/design.md 3.15): removing a market you asked that nobody else is in, and archiving a
 * finished one off your own Now. Removing ends the market as a void only the asker can make and only while they
 * are its one participant: nothing of it is on the chain yet (a market goes onchain at lock, and a lock takes
 * two), so no contract question arises and the stake, which never left, comes back; it never reaches Just
 * happened, You leaves it out as it does expiry, and anyone the link reached who opens it later sees "Called off"
 * with "Nobody else got in." Archiving changes nothing but this person's Now: the market, its story and its
 * photos stay where they were for everyone.
 */
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { marketById, MarketError, positionsOf, stateOf, VOID_OUTCOME } from "./markets";
import { ENDED } from "@/lib/media/roles";

export async function removeMarket(dareId: string, byUserId: string, now: Date = new Date()): Promise<void> {
  const d = await marketById(dareId);
  if (!d) throw new MarketError("That one doesn't exist.", "not_found");
  if (d.creatorId !== byUserId) throw new MarketError("Only the person who asked it can remove it.", "not_yours");
  if (stateOf(d) !== "open") throw new MarketError("It can't be removed now.", "wrong_state");
  const positions = await positionsOf(d.id);
  if (positions.some((p) => p.userId !== byUserId)) throw new MarketError("Someone else is in, so it isn't yours alone to remove.", "wrong_state");
  const [row] = await db
    .update(schema.dares)
    .set({ lockedAt: now, resolvedAt: now, resolvedBy: "removed", resolvedOutcome: VOID_OUTCOME })
    .where(and(eq(schema.dares.id, d.id), eq(schema.dares.creatorId, byUserId)))
    .returning({ id: schema.dares.id });
  if (!row) throw new MarketError("Couldn't remove it.", "chain");
}

export async function archiveMarket(dareId: string, userId: string): Promise<void> {
  const d = await marketById(dareId);
  if (!d) throw new MarketError("That one doesn't exist.", "not_found");
  if (!ENDED.has(stateOf(d))) throw new MarketError("It's still running.", "wrong_state");
  await db.insert(schema.nowArchive).values({ userId, dareId }).onConflictDoNothing();
}

/** The markets this person has swiped off their Now. */
export async function archivedFor(userId: string): Promise<Set<string>> {
  const rows = await db.select({ dareId: schema.nowArchive.dareId }).from(schema.nowArchive).where(eq(schema.nowArchive.userId, userId));
  return new Set(rows.map((r) => r.dareId));
}
