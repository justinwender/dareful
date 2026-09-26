/**
 * "The rest of that night" on the memory screen (docs/design.md 3.37, item 7): other events that share at least
 * two people with this market, the viewer among them, and happened between six hours before it closed and six
 * hours after it ended. Oldest first, at most five, each opening its own event. When the market closed between
 * 5am and 5pm in the viewer's zone the heading is "The rest of that day". Pure rules here, the query beneath.
 */
import { and, eq, gte, inArray, isNotNull, lte, ne, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { frameOnMarkets } from "@/lib/media";
import { outcomeLine } from "@/lib/ui/outcome-words";
import { answersOf, stateOf, unitOf, VOID_OUTCOME } from "./markets";
import { unitPhrase } from "./number-axis";

export const NIGHT_HOURS = 6;
export const NIGHT_MAX = 5;

export type NightRow = { key: string; href: string; kind: "market" | "argument" | "covered" | "round"; kindLabel: string; subject: string; caption: string | null; thumb: string | null; at: Date };

/** The window: from six hours before the market closed to six hours after it ended. */
export function nightWindow(closedAt: Date, endedAt: Date): { from: Date; to: Date } {
  return { from: new Date(closedAt.getTime() - NIGHT_HOURS * 3_600_000), to: new Date(endedAt.getTime() + NIGHT_HOURS * 3_600_000) };
}

/** Whether an event belongs to the night: at least two of this market's people, the viewer among them. */
export function sharesTheNight(marketPeople: readonly string[], eventPeople: readonly string[], viewerId: string): boolean {
  const mine = new Set(marketPeople);
  const shared = eventPeople.filter((p) => mine.has(p));
  return shared.includes(viewerId) && new Set(shared).size >= 2;
}

/** "The rest of that night", or "The rest of that day" when the market closed between 5am and 5pm where the viewer is. */
export function nightHeading(closedAt: Date, timeZone: string): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).formatToParts(closedAt).find((p) => p.type === "hour")?.value ?? "20");
  return hour >= 5 && hour < 17 ? "The rest of that day" : "The rest of that night";
}

/** The five oldest, in the order they happened. */
export function pickNight<T extends { at: Date }>(rows: readonly T[], max = NIGHT_MAX): T[] {
  return [...rows].sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, max);
}

export async function restOfThatNight(input: { dareId: string; groupIds: string[]; people: string[]; viewerId: string; closedAt: Date; endedAt: Date }): Promise<NightRow[]> {
  const { from, to } = nightWindow(input.closedAt, input.endedAt);
  if (input.groupIds.length === 0) return [];
  const [dares, obligations] = await Promise.all([
    db
      .select()
      .from(schema.dares)
      .where(and(inArray(schema.dares.groupId, input.groupIds), ne(schema.dares.id, input.dareId), isNotNull(schema.dares.creatorSignature), or(and(gte(schema.dares.createdAt, from), lte(schema.dares.createdAt, to)), and(gte(schema.dares.resolvedAt, from), lte(schema.dares.resolvedAt, to))))),
    db
      .select()
      .from(schema.obligations)
      .where(and(ne(schema.obligations.origin, "dare"), inArray(schema.obligations.fromUser, input.people), inArray(schema.obligations.toUser, input.people), gte(schema.obligations.createdAt, from), lte(schema.obligations.createdAt, to))),
  ]);
  const positions = dares.length ? await db.select({ dareId: schema.darePositions.dareId, userId: schema.darePositions.userId }).from(schema.darePositions).where(inArray(schema.darePositions.dareId, dares.map((d) => d.id))) : [];
  const votes = dares.length ? await db.select({ dareId: schema.dareVotes.dareId, userId: schema.dareVotes.userId, signedAt: schema.dareVotes.signedAt }).from(schema.dareVotes).where(inArray(schema.dareVotes.dareId, dares.map((d) => d.id))) : [];
  const shared = dares.filter((d) => sharesTheNight(input.people, positions.filter((p) => p.dareId === d.id).map((p) => p.userId as string), input.viewerId));
  const frames = await frameOnMarkets(shared.map((d) => d.id));
  const userIds = Array.from(new Set([...votes.map((v) => v.userId), ...obligations.flatMap((o) => [o.fromUser, o.toUser])]));
  const users = userIds.length ? await db.select({ id: schema.users.id, displayName: schema.users.displayName }).from(schema.users).where(inArray(schema.users.id, userIds)) : [];
  const first = (id: string) => (users.find((u) => u.id === id)?.displayName ?? "Someone").split(/\s+/)[0] ?? "Someone";
  const rows: NightRow[] = [];
  for (const d of shared) {
    const state = stateOf(d);
    const unit = unitOf(d);
    const answers = answersOf(d);
    const caller = [...votes.filter((v) => v.dareId === d.id)].sort((a, b) => a.signedAt.getTime() - b.signedAt.getTime())[0];
    const caption =
      state === "resolved" && d.resolvedOutcome !== null && d.resolvedOutcome !== VOID_OUTCOME
        ? d.pace === "argument" && caller
          ? `Ruled for ${first(caller.userId)}.`
          : answers
            ? `${answers[Number(d.resolvedOutcome)]?.text ?? "Decided"}.`
            : unit
              ? `${unitPhrase(d.resolvedOutcome, unit)}.`
              : outcomeLine(d, d.resolvedOutcome === 1n)
        : state === "voided"
          ? "Nobody could tell."
          : state === "expired"
            ? "Never settled."
            : null;
    rows.push({ key: `m-${d.id}`, href: `/m/${d.id}`, kind: d.pace === "argument" ? "argument" : "market", kindLabel: d.pace === "argument" ? "Argument" : "Market", subject: d.title, caption, thumb: frames.get(d.id)?.[0] ? `/api/media/${frames.get(d.id)?.[0]?.id}?size=thumb` : null, at: d.resolvedAt ?? d.createdAt });
  }
  for (const o of obligations) {
    if (!sharesTheNight(input.people, [o.fromUser, o.toUser], input.viewerId)) continue;
    rows.push({ key: `o-${o.id}`, href: `/o/${o.id}`, kind: "covered", kindLabel: "Covered", subject: o.memo ?? `${first(o.toUser)} got this one`, caption: o.settleExpected ? null : "Nobody’s paying it back", thumb: o.mediaId ? `/api/media/${o.mediaId}?size=thumb` : null, at: o.createdAt });
  }
  return pickNight(rows);
}
