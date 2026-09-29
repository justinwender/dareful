/**
 * The person view: header (open obligations expected to settle, netted per unit between the two people),
 * timeline (every event between them, ordered by the offchain timestamp, never the chain timestamp), and
 * the soft-parity footer drawn from what nobody expects to settle.
 */
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { membersOfGroups, setLabel } from "./groups";
import type { DenominationRow } from "./denominations";
import { denominationsByIds } from "./denominations";
import { nettablePairs } from "./closes";
import { obligationsById, openBetween, type EnvioObligation } from "./envio";
import { bytes16ToUuid, uuidToBytes16 } from "./ids";
import { marketCards, type MarketCardData } from "./market-view";
import { pendingBetween, type ProposalRow } from "./proposals";
import { gamesOfMarkets } from "@/lib/sports";
import { scoreLine } from "@/lib/sports/results";
import type { TeamFace } from "@/lib/ui/team";

export type UserRow = typeof schema.users.$inferSelect;
export type ObligationRow = typeof schema.obligations.$inferSelect;

/** One unit between two people after netting the two directions. `owner` is who picks up next (the debtor). */
export type HeaderLine = {
  denomination: DenominationRow;
  ownerId: string; // debtor after netting
  quantity: bigint; // units; for money, cents
  amountCents: bigint | null; // magnitude for monetary units
};

export type PersonHeader = {
  theirs: HeaderLine[]; // they pick up next
  yours: HeaderLine[]; // you pick up next
};

/** Groups Envio's open edges by (unit, direction), nets the two directions, and drops zeros. */
export function netHeader(me: UserRow, them: UserRow, open: EnvioObligation[], rows: Map<string, ObligationRow>, denoms: Map<string, DenominationRow>, settleExpected: boolean): PersonHeader {
  const byDenom = new Map<string, { meOwes: bigint; theyOwe: bigint }>();
  for (const e of open) {
    const row = rows.get(bytes16ToUuid(e.id));
    if (!row || row.settleExpected !== settleExpected) continue;
    const bucket = byDenom.get(row.denomId) ?? { meOwes: 0n, theyOwe: 0n };
    const remaining = BigInt(e.remaining);
    if (e.debtor === me.ledgerWallet) bucket.meOwes += remaining;
    else bucket.theyOwe += remaining;
    byDenom.set(row.denomId, bucket);
  }
  const theirs: HeaderLine[] = [];
  const yours: HeaderLine[] = [];
  for (const [denomId, b] of byDenom) {
    const denomination = denoms.get(denomId);
    if (!denomination) continue;
    const net = b.theyOwe - b.meOwes;
    if (net === 0n) continue; // "even," never a zero
    const line: HeaderLine = {
      denomination,
      ownerId: net > 0n ? them.id : me.id,
      quantity: net > 0n ? net : -net,
      amountCents: denomination.monetary ? (net > 0n ? net : -net) : null,
    };
    (net > 0n ? theirs : yours).push(line);
  }
  const order = (l: HeaderLine) => (l.denomination.monetary ? 2 : l.denomination.template && l.denomination.template !== "usd" ? 0 : 1);
  theirs.sort((x, y) => order(x) - order(y));
  yours.sort((x, y) => order(x) - order(y));
  return { theirs, yours };
}

export type TimelineEvent =
  | { kind: "obligation"; at: Date; obligation: ObligationRow; denomination: DenominationRow; open: bigint; settled: bigint; forgiven: bigint; netted: bigint; groupName: string | null }
  | { kind: "proposal"; at: Date; proposal: ProposalRow; denomination: DenominationRow; groupName: string | null }
  /** A market both people were in: one story, with only what it left between these two beneath it. */
  | { kind: "market"; at: Date; market: MarketCardData; /** An unnamed set by its people, for the dashed chip (3.19); null when the set is named. */ groupPeople?: string | null }
  /** A game with more than one question between these two (3.4): one story for the night, its questions inside it. */
  | { kind: "game"; at: Date; game: { id: string; groupId: string; name: string; away: TeamFace; home: TeamFace; score: string | null; over: boolean }; markets: MarketCardData[]; groupName: string | null };

/** One unit in one set of people that goes both ways between these two: what one signature cancels (docs/design.md 2.1; PLANNING.md 5a `net`). */
export type NettableLine = { groupId: string; denomId: string; denomination: DenominationRow; groupLabel: string | null; meOwes: bigint; theyOwe: bigint; cancels: bigint };

export type PersonView = {
  me: UserRow;
  them: UserRow;
  header: PersonHeader;
  rally: { pickups: Array<{ userId: string; at: Date }>; sentence: string | null };
  timeline: TimelineEvent[];
  /** Where these two turn up: the sets of people their shared events came out of, by how many. */
  contexts: SharedContext[];
  nettable: NettableLine[];
  /** What a market minted between the two, by obligation id: open (and so the creditor's to close from the story), settled or forgiven. */
  consequenceStates: Record<string, "open" | "settled" | "forgiven">;
};

export type RallyRow = { userId: string; slots: boolean[] };

/**
 * The rally strip (docs/design.md 3.11): the last twelve pick-ups nobody expects to settle, oldest first, one
 * row per person (theirs first, then yours), a dot in that person's hue where they picked one up. It needs a
 * pattern to show one: with fewer than four pick-ups there is no strip at all.
 */
export function rallyRows(pickups: Array<{ userId: string; at: Date }>, meId: string, themId: string): RallyRow[] | null {
  if (pickups.length < 4) return null;
  const recent = [...pickups].sort((a, b) => a.at.getTime() - b.at.getTime()).slice(-12);
  return [themId, meId].map((userId) => ({ userId, slots: recent.map((p) => p.userId === userId) }));
}

export type SharedContext = { groupId: string; label: string; count: number; unnamed: boolean };
const contextOf = (e: TimelineEvent): string => (e.kind === "market" ? e.market.dare.groupId : e.kind === "game" ? e.game.groupId : e.kind === "proposal" ? e.proposal.groupId : e.obligation.groupId);

/**
 * docs/design.md 3.21. Counts of shared events per set of people, most first, so the band can answer the one
 * question it exists for: why something sits in one context and not another. Nothing when the only context is
 * the two of them, since a band with one obvious chip explains nothing.
 */
export function sharedContexts(timeline: TimelineEvent[], labels: Map<string, { label: string; unnamed: boolean; isDyad: boolean }>): SharedContext[] {
  const counts = new Map<string, number>();
  for (const e of timeline) counts.set(contextOf(e), (counts.get(contextOf(e)) ?? 0) + 1);
  const out = Array.from(counts, ([groupId, count]) => ({ groupId, count, label: labels.get(groupId)?.label ?? "Somewhere else", unnamed: labels.get(groupId)?.unnamed ?? false }));
  if (out.length === 0 || out.every((c) => labels.get(c.groupId)?.isDyad)) return [];
  return out.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** The timeline narrowed to one context, for a tapped chip. An id that is not one of theirs narrows to nothing new. */
export function filterByContext(timeline: TimelineEvent[], groupId: string | undefined): TimelineEvent[] {
  return groupId ? timeline.filter((e) => contextOf(e) === groupId) : timeline;
}

/** The timeline shows this many at first; a 44px tertiary "Show earlier" opens the rest (3.38). */
export const TIMELINE_FOLD = 12;

/**
 * What still lies ahead between the two of you, over the timeline under "Coming up" (3.38; Round C part 2): a
 * market that is open or locked, or a game not yet over; then the past, newest first, folded past `TIMELINE_FOLD`
 * unless the person asked for earlier. Pure, so the split has a test.
 */
export function splitTimeline(events: TimelineEvent[], showAll: boolean): { upcoming: TimelineEvent[]; shown: TimelineEvent[]; hidden: number } {
  const ahead = (e: TimelineEvent) => (e.kind === "market" ? e.market.state === "open" || e.market.state === "locked" : e.kind === "game" ? !e.game.over : false);
  const upcoming = events.filter(ahead);
  const past = events.filter((e) => !ahead(e));
  const shown = showAll ? past : past.slice(0, TIMELINE_FOLD);
  return { upcoming, shown, hidden: past.length - shown.length };
}

export async function personView(me: UserRow, them: UserRow): Promise<PersonView> {
  const [open, obligations, pending, markets] = await Promise.all([
    openBetween(me.ledgerWallet, them.ledgerWallet),
    db
      .select()
      .from(schema.obligations)
      .where(
        or(
          and(eq(schema.obligations.fromUser, me.id), eq(schema.obligations.toUser, them.id)),
          and(eq(schema.obligations.fromUser, them.id), eq(schema.obligations.toUser, me.id)),
        ),
      )
      .orderBy(desc(schema.obligations.createdAt)),
    pendingBetween(me.id, them.id),
    marketCards({ viewerId: me.id, withUserId: them.id }),
  ]);

  const rows = new Map(obligations.map((o) => [o.id, o]));
  const denomIds = Array.from(new Set([...obligations.map((o) => o.denomId), ...pending.map((p) => p.denomId)]));
  const denoms = await denominationsByIds(denomIds);
  const indexed = await obligationsById(obligations.map((o) => uuidToBytes16(o.id)));
  const groupIds = Array.from(new Set([...obligations.map((o) => o.groupId), ...pending.map((p) => p.groupId)]));
  const groupNames = new Map<string, string | null>();
  if (groupIds.length > 0) {
    const groups = await db.select({ id: schema.groups.id, name: schema.groups.name }).from(schema.groups).where(inArray(schema.groups.id, groupIds));
    for (const g of groups) groupNames.set(g.id, g.name);
  }

  const header = netHeader(me, them, open, rows, denoms, true);

  // Soft parity: the last twelve pick-ups nobody expects to settle, as a sequence, never a count.
  const pickups = obligations
    .filter((o) => !o.settleExpected)
    .slice(0, 12)
    .map((o) => ({ userId: o.toUser, at: o.createdAt })); // the creditor picked it up
  const mine = pickups.filter((p) => p.userId === me.id).length;
  const sentence =
    pickups.length < 4
      ? null
      : mine > pickups.length - mine
        ? "You've covered a few more of these lately."
        : mine < pickups.length - mine
          ? `${them.displayName} has covered a few more of these lately.`
          : "You two have been trading these evenly.";

  const timeline: TimelineEvent[] = [];
  for (const o of obligations) {
    // What a market minted belongs to the market's story, not to a row of its own. It still counts in the header.
    if (o.origin === "dare") continue;
    const denomination = denoms.get(o.denomId);
    if (!denomination) continue;
    const e = indexed.get(uuidToBytes16(o.id));
    timeline.push({
      kind: "obligation",
      at: o.createdAt,
      obligation: o,
      denomination,
      open: e ? BigInt(e.remaining) : (o.quantity ?? 1n),
      settled: e ? BigInt(e.settled) : 0n,
      forgiven: e ? BigInt(e.forgiven) : 0n,
      netted: e ? BigInt(e.netted) : 0n,
      groupName: groupNames.get(o.groupId) ?? null,
    });
  }
  for (const p of pending) {
    const denomination = denoms.get(p.denomId);
    if (!denomination) continue;
    timeline.push({ kind: "proposal", at: p.createdAt, proposal: p, denomination, groupName: groupNames.get(p.groupId) ?? null });
  }
  // A game with more than one question between these two is one story (3.4); a game with one is that question's ordinary story.
  const fromGames = markets.filter((m) => m.dare.templateId);
  const games = fromGames.length ? await gamesOfMarkets(fromGames.map((m) => m.dare.id)) : new Map();
  const byGame = new Map<string, MarketCardData[]>();
  for (const m of markets) {
    const g = games.get(m.dare.id);
    if (!g) continue;
    const key = `${g.game.id}:${m.dare.groupId}`;
    byGame.set(key, [...(byGame.get(key) ?? []), m]);
  }
  const grouped = new Set<string>();
  for (const list of byGame.values()) if (list.length > 1) for (const m of list) grouped.add(m.dare.id);
  // An unnamed set is named by its people on the card's chip (3.19, 4.7), never as a place.
  const unnamed = Array.from(new Set(markets.filter((m) => !m.groupName).map((m) => m.dare.groupId)));
  const unnamedMembers = unnamed.length ? await membersOfGroups(unnamed) : new Map<string, Array<{ userId: string | null; displayName: string }>>();
  const peopleLabel = (groupId: string) => {
    const names = (unnamedMembers.get(groupId) ?? []).filter((x) => x.userId).map((x) => x.displayName);
    return names.length > 1 ? setLabel({ name: null, isDyad: names.length === 2, memberNames: names, viewerName: me.displayName }) : null;
  };
  for (const m of markets) if (!grouped.has(m.dare.id)) timeline.push({ kind: "market", at: m.at, market: m, groupPeople: m.groupName ? null : peopleLabel(m.dare.groupId) });
  for (const [, list] of byGame) {
    if (list.length < 2) continue;
    const g = games.get(list[0]!.dare.id)!.game;
    const sorted = [...list].sort((a, b) => (games.get(a.dare.id)?.template.sort ?? 0) - (games.get(b.dare.id)?.template.sort ?? 0));
    const at = list.reduce((m, x) => (x.at > m ? x.at : m), list[0]!.at);
    timeline.push({ kind: "game", at, game: { id: g.id, groupId: list[0]!.dare.groupId, name: g.name, away: { abbr: g.awayAbbr, name: g.awayShort, color: g.awayColor }, home: { abbr: g.homeAbbr, name: g.homeShort, color: g.homeColor }, score: g.finalSeenAt && g.homeScore !== null && g.awayScore !== null ? scoreLine({ home: g.homeScore, away: g.awayScore }, g.homeShort, g.awayShort) : null, over: g.completed || list.every((x) => x.state === "resolved" || x.state === "voided" || x.state === "expired") }, markets: sorted, groupName: null });
  }
  // The offchain timestamp, never the chain timestamp.
  timeline.sort((x, y) => y.at.getTime() - x.at.getTime());

  const contextIds = Array.from(new Set(timeline.map(contextOf)));
  const [contextGroups, contextMembers] = await Promise.all([contextIds.length ? db.select().from(schema.groups).where(inArray(schema.groups.id, contextIds)) : Promise.resolve([]), membersOfGroups(contextIds)]);
  const labels = new Map(contextGroups.map((g) => [g.id, { label: setLabel({ name: g.name, isDyad: g.isDyad, memberNames: (contextMembers.get(g.id) ?? []).filter((m) => m.userId).map((m) => m.displayName), viewerName: me.displayName }), unnamed: g.name === null && !g.isDyad, isDyad: g.isDyad }]));
  for (const e of timeline) {
    const label = labels.get(contextOf(e))?.label ?? null;
    if (e.kind === "market") e.market = { ...e.market, groupName: label };
    else if (e.kind === "game") e.groupName = label;
    else e.groupName = label;
  }

  // What goes both ways in one unit and one set of people, and so can cancel on one signature from either side.
  const edges = open.flatMap((e) => {
    const row = rows.get(bytes16ToUuid(e.id));
    return row ? [{ ...e, groupId: row.groupId, denomId: row.denomId }] : [];
  });
  const nettable: NettableLine[] = nettablePairs(edges, me.ledgerWallet, them.ledgerWallet).flatMap((p) => {
    const denomination = denoms.get(p.denomId);
    return denomination ? [{ groupId: p.groupId, denomId: p.denomId, denomination, groupLabel: labels.get(p.groupId)?.label ?? null, meOwes: p.aOwes, theyOwe: p.bOwes, cancels: p.cancels }] : [];
  });

  const consequenceStates: Record<string, "open" | "settled" | "forgiven"> = {};
  for (const o of obligations) {
    if (o.origin !== "dare") continue;
    const e = indexed.get(uuidToBytes16(o.id));
    const open = e ? BigInt(e.remaining) : (o.quantity ?? 1n);
    consequenceStates[o.id] = open > 0n ? "open" : e && BigInt(e.forgiven) > 0n && BigInt(e.settled) === 0n ? "forgiven" : "settled";
  }

  return { me, them, header, rally: { pickups, sentence }, timeline, contexts: sharedContexts(timeline, labels), nettable, consequenceStates };
}

export async function userById(id: string): Promise<UserRow | null> {
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return row ?? null;
}
