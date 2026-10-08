/**
 * Between the close and the vote (the games-and-the-reveal round, 2026-10-07; docs/design.md 3.24 and 3.42). A
 * market closes on the first of four: its asker, enough of the people in saying calls are in (as many as it takes to
 * settle a vote among them), its close time, or a game's start. Then nothing is anyone's move until it has happened:
 * the vote opens for everyone at once on the first of the final score (for a question it answers), the decided date
 * in its terms (its close time), or anyone in saying it has happened. Who has said calls are in is named on the
 * sheet, never counted, and saying either thing binds nobody.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { lockMarket, marketById, MarketError, positionsOf, stateOf, type PositionRow } from "./markets";
import { thresholdFor } from "./provisional";
export { votingOpen } from "./voting-open";

/** Who says it: someone with an account, or a guest by their claim. */
export type Sayer = { userId: string } | { claimId: string };

const isTheirs = (p: Pick<PositionRow, "userId" | "claimId">, who: Sayer) => ("userId" in who ? p.userId === who.userId : p.claimId === who.claimId);

/** As many as it takes to settle a vote among the people in: closing by calls needs the vote's own majority. Pure. */
export const callsNeeded = (peopleIn: number): number => thresholdFor(peopleIn);

/** The people in who have said calls are in, oldest first: someone who has since left counts for nothing. */
export async function callsAreIn(dareId: string): Promise<Array<{ userId: string | null; claimId: string | null; saidAt: Date }>> {
  const rows = await db.select().from(schema.dareCloseCalls).where(eq(schema.dareCloseCalls.dareId, dareId)).orderBy(asc(schema.dareCloseCalls.saidAt));
  const inIt = await positionsOf(dareId);
  return rows.filter((r) => inIt.some((p) => (r.userId ? p.userId === r.userId : p.claimId === r.claimId))).map((r) => ({ userId: r.userId, claimId: r.claimId, saidAt: r.saidAt }));
}

/**
 * "Calls are in", from someone in an open market. It closes the moment as many of the people in have said it as it
 * takes to settle a vote; a second say, or one after it closed, is answered as done.
 */
export async function sayCallsAreIn(dareId: string, who: Sayer, now: Date = new Date()): Promise<{ closed: boolean }> {
  const d = await marketById(dareId);
  if (!d) throw new MarketError("That one doesn't exist.", "not_found");
  if (d.lockedAt) return { closed: true };
  if (stateOf(d) !== "open") throw new MarketError("It isn’t open.", "wrong_state");
  const positions = await positionsOf(d.id);
  if (!positions.some((p) => isTheirs(p, who))) throw new MarketError("Only the people in it can say that.", "not_member");
  if (positions.length < 2) throw new MarketError("It takes two to close it.", "wrong_state");
  await db.insert(schema.dareCloseCalls).values({ dareId: d.id, ...("userId" in who ? { userId: who.userId } : { claimId: who.claimId }), saidAt: now }).onConflictDoNothing();
  if ((await callsAreIn(d.id)).length < callsNeeded(positions.length)) return { closed: false };
  const r = await lockMarket(d.id, null, now, "calls");
  return { closed: !r.expired };
}

/** "Take it back": while it is still open, someone who said calls are in can unsay it. */
export async function takeBackCallsAreIn(dareId: string, who: Sayer): Promise<void> {
  const d = await marketById(dareId);
  if (!d) throw new MarketError("That one doesn't exist.", "not_found");
  if (d.lockedAt) throw new MarketError("It’s closed already.", "wrong_state");
  await db.delete(schema.dareCloseCalls).where(and(eq(schema.dareCloseCalls.dareId, d.id), "userId" in who ? eq(schema.dareCloseCalls.userId, who.userId) : eq(schema.dareCloseCalls.claimId, who.claimId)));
}

/**
 * "It's happened", from someone in a closed market: the vote opens for everyone at once, and the first to say it is
 * named. True when this said it first; a later say is answered as done.
 */
export async function sayItHappened(dareId: string, who: Sayer, now: Date = new Date()): Promise<boolean> {
  const d = await marketById(dareId);
  if (!d) throw new MarketError("That one doesn't exist.", "not_found");
  if (stateOf(d) !== "locked") throw new MarketError("There’s nothing to call on this one right now.", "wrong_state");
  if (!(await positionsOf(d.id)).some((p) => isTheirs(p, who))) throw new MarketError("Only the people in it can say that.", "not_member");
  const [row] = await db
    .update(schema.dares)
    .set({ happenedAt: now, ...("userId" in who ? { happenedUser: who.userId } : { happenedClaim: who.claimId }) })
    .where(and(eq(schema.dares.id, d.id), isNull(schema.dares.happenedAt)))
    .returning({ id: schema.dares.id });
  return Boolean(row);
}
