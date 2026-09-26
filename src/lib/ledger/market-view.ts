/**
 * What a market looks like to one viewer. Markets are stories (docs/design.md 4.x): a timeline gets one card per
 * market however many obligations it minted, with only the consequences between the people in view beneath it.
 *
 * Who may see numbers: before lock, in an open market, someone who has put their own number in sees everyone's;
 * someone who has not sees only who is in, so an early number never anchors a later one by accident. A blind
 * market hides every number from everyone until lock. After lock everyone in the group sees everything.
 */
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { memoriesOnMarkets } from "@/lib/media";
import { denominationsByIds, type DenominationRow } from "./denominations";
import { inkOf, type InkName } from "@/lib/ui/ink";
import { stateOf, unitOf, VOID_OUTCOME, type DareRow, type MarketState, type PositionRow, type Unit } from "./markets";

export type MarketPerson = { id: string; displayName: string };
export type MarketCardData = {
  dare: DareRow;
  state: Exclude<MarketState, "draft">;
  /** The market's ink (docs/design.md 1.8): the stamp behind its mark everywhere, its whole screen on its own. */
  ink: InkName;
  /** Whether the viewer has a number on it: the "you're in" mark (3.23) is theirs alone. */
  viewerIn: boolean;
  at: Date;
  groupName: string | null;
  groupSize: number;
  denomination: DenominationRow;
  /** Percents on a yes-or-no question; on a number question `percent` is null and `number` carries the entry, as text. Both null when numbers may not be shown. */
  people: Array<{ id: string; name: string; percent: number | null; number: string | null }>;
  outcome: 0 | 1 | null;
  /** A number question: its unit, and the answer once it has one. */
  unit: Unit | null;
  answer: string | null;
  consequences: Array<{ id: string; from: MarketPerson; to: MarketPerson; quantity: bigint }>;
  needsYou: string | null;
  /** How many of the group have called it, and who first said what happened. For the "Needs you" context line. */
  votesCast: number;
  saidBy: string | null;
  /** The memories on a settled market (docs/marks-and-memories.md), oldest first, for the frame on its story (3.4). Never evidence. */
  media: Array<{ id: string; author: { id: string; displayName: string } }>;
};

const percentOf = (p: PositionRow) => Number(p.value) / 100;

export function numbersVisible(d: DareRow, viewerHasPosition: boolean): boolean {
  if (d.lockedAt) return true;
  return d.revealMode === "open" && viewerHasPosition;
}

/**
 * The cards for a timeline. `groupId` narrows to one group; `withUserId` narrows to markets both people are in
 * and to the consequences between just those two. Drafts are never listed: only their creator can open one.
 */
export async function marketCards(input: { viewerId: string; groupId?: string; withUserId?: string; limit?: number }): Promise<MarketCardData[]> {
  const mine = await db.select({ groupId: schema.groupMembers.groupId }).from(schema.groupMembers).where(and(eq(schema.groupMembers.userId, input.viewerId), isNull(schema.groupMembers.leftAt)));
  const groupIds = input.groupId ? mine.map((m) => m.groupId).filter((g) => g === input.groupId) : mine.map((m) => m.groupId);
  if (groupIds.length === 0) return [];
  const dares = await db
    .select()
    .from(schema.dares)
    .where(and(inArray(schema.dares.groupId, groupIds), isNotNull(schema.dares.creatorSignature)))
    .orderBy(desc(schema.dares.createdAt))
    .limit(input.limit ?? 40);
  if (dares.length === 0) return [];
  const ids = dares.map((d) => d.id);

  const [positions, votes, edges, groups, seats, said] = await Promise.all([
    db.select().from(schema.darePositions).where(and(inArray(schema.darePositions.dareId, ids), isNotNull(schema.darePositions.acknowledgedAt), isNull(schema.darePositions.dismissedAt))),
    db.select({ dareId: schema.dareVotes.dareId, userId: schema.dareVotes.userId }).from(schema.dareVotes).where(inArray(schema.dareVotes.dareId, ids)),
    db.select().from(schema.obligations).where(and(eq(schema.obligations.origin, "dare"), inArray(schema.obligations.originId, ids))),
    db.select({ id: schema.groups.id, name: schema.groups.name }).from(schema.groups).where(inArray(schema.groups.id, groupIds)),
    db.select({ groupId: schema.groupMembers.groupId, userId: schema.groupMembers.userId }).from(schema.groupMembers).where(and(inArray(schema.groupMembers.groupId, groupIds), isNotNull(schema.groupMembers.userId), isNull(schema.groupMembers.leftAt))),
    db.select({ dareId: schema.dareStatements.dareId, userId: schema.dareStatements.userId }).from(schema.dareStatements).where(and(inArray(schema.dareStatements.dareId, ids), eq(schema.dareStatements.kind, "update"))).orderBy(schema.dareStatements.statedAt),
  ]);
  const userIds = Array.from(new Set([...positions.map((p) => p.userId), ...said.map((x) => x.userId), ...edges.flatMap((e) => [e.fromUser, e.toUser])].filter((x): x is string => Boolean(x))));
  const users = userIds.length ? await db.select({ id: schema.users.id, displayName: schema.users.displayName }).from(schema.users).where(inArray(schema.users.id, userIds)) : [];
  const nameOf = new Map(users.map((u) => [u.id, u.displayName]));
  const denoms = await denominationsByIds(Array.from(new Set(dares.map((d) => d.denomId))));
  const memories = await memoriesOnMarkets(dares.filter((d) => stateOf(d) === "resolved").map((d) => d.id));

  const out: MarketCardData[] = [];
  for (const d of dares) {
    const state = stateOf(d);
    if (state === "draft") continue;
    const ps = positions.filter((p) => p.dareId === d.id).sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime());
    if (input.withUserId && !(ps.some((p) => p.userId === input.viewerId) && ps.some((p) => p.userId === input.withUserId))) continue;
    const denomination = denoms.get(d.denomId);
    if (!denomination) continue;
    const iAmIn = ps.some((p) => p.userId === input.viewerId);
    const show = numbersVisible(d, iAmIn);
    const between = (e: (typeof edges)[number]) => !input.withUserId || ((e.fromUser === input.viewerId || e.toUser === input.viewerId) && (e.fromUser === input.withUserId || e.toUser === input.withUserId));
    const unit = unitOf(d);
    out.push({
      dare: d,
      state,
      ink: inkOf(d),
      viewerIn: iAmIn,
      at: d.resolvedAt ?? d.lockedAt ?? d.createdAt,
      groupName: groups.find((g) => g.id === d.groupId)?.name ?? null,
      groupSize: seats.filter((s) => s.groupId === d.groupId).length,
      denomination,
      people: ps.map((p) => ({ id: p.userId as string, name: nameOf.get(p.userId as string) ?? "Someone", percent: show && !unit ? percentOf(p) : null, number: show && unit ? p.value.toString() : null })),
      outcome: state === "resolved" && !unit && d.resolvedOutcome !== null && d.resolvedOutcome !== VOID_OUTCOME ? (Number(d.resolvedOutcome) as 0 | 1) : null,
      unit,
      answer: state === "resolved" && unit && d.resolvedOutcome !== null && d.resolvedOutcome !== VOID_OUTCOME ? d.resolvedOutcome.toString() : null,
      consequences: edges
        .filter((e) => e.originId === d.id && between(e))
        .map((e) => ({ id: e.id, from: { id: e.fromUser, displayName: nameOf.get(e.fromUser) ?? "Someone" }, to: { id: e.toUser, displayName: nameOf.get(e.toUser) ?? "Someone" }, quantity: e.quantity ?? 1n })),
      votesCast: votes.filter((v) => v.dareId === d.id).length,
      saidBy: ((u) => (u ? (nameOf.get(u) ?? null) : null))(said.find((x) => x.dareId === d.id)?.userId),
      needsYou: state === "open" && !iAmIn ? "Put your number in" : state === "locked" && !votes.some((v) => v.dareId === d.id && v.userId === input.viewerId) ? "Say how it came out" : null,
      media: (memories.get(d.id) ?? []).map((m) => ({ id: m.id, author: m.author })),
    });
  }
  return out;
}

/** Markets waiting on this person: open ones they are not in, locked ones they have not called. For "Needs you". */
export async function marketsNeeding(viewerId: string): Promise<MarketCardData[]> {
  return (await marketCards({ viewerId, limit: 60 })).filter((m) => m.needsYou !== null);
}
