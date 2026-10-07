/**
 * Now, event-first (docs/design.md 4.7, 6.1). "Needs you" is only what will not move without this person;
 * "Running" is what they have already acted on and is still in flight; "Just happened" is what the group did.
 * People are their own root, and a group is a label on an event, never a place to go.
 *
 * The rows are assembled here as data so the ordering rule and the "nothing counts, nothing ages" rule have tests.
 */
import { draftOnNow } from "./drafts";
import { inCount } from "@/lib/ui/copy";
import { and, desc, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { inkOf, type InkName } from "@/lib/ui/ink";
import { shellOf } from "./shell-data";
import type { MarketShell } from "@/lib/ui/shell";
import { markRefOf, type MarkRef } from "@/lib/ui/mark";
import { bytes16ToUuid, uuidToBytes16 } from "./ids";
import { denominationsByIds, type DenominationRow } from "./denominations";
import { obligationsById, openTouching } from "./envio";
import { membersOfGroups, peopleForUser, setLabel } from "./groups";
import { marketCards, type MarketCardData } from "./market-view";
import { pendingForDebtor, type ProposalRow } from "./proposals";
import { suggestedGhostsFor } from "./claims";
import { unitPhrase } from "./number-axis";
import { againRowsFor, onWayFor } from "./again";
import { archivedFor } from "./now-swipes";
import { gamesOfMarkets } from "@/lib/sports";
import { scoreLine } from "@/lib/sports/results";
import type { TeamFace } from "@/lib/ui/team";

type Person = { id: string; displayName: string };

/** What the row's state mark says (docs/design.md 3.23), and the market's mark and ink for its 40px stamp (3.15). */
type QuestionLook = { mark: MarkRef | null; ink: InkName; state: "open" | "locked" | "voting" | "draft"; /** What the row knows of the screen it opens, for its shell (docs/design.md 9.4). */ shell?: MarketShell };

/** A game on Now (docs/design.md 4.7): the two stamps in the 40px slot, the game as the subject, and the most pressing question's verb and clock. */
export type GameLook = { away: TeamFace; home: TeamFace; /** How many questions the game runs with these people. */ questions: number; /** The pressing question's screen, which the verb opens; the row itself opens the game page. */ questionHref: string; state: QuestionLook["state"] };

export type NeedRow =
  | ({ kind: "vote" | "enter" | "lock"; key: string; href: string; verb: string; context: string; subject: string; question: true; deadline: Date | null; since: Date; groupId: string; failed?: true } & QuestionLook)
  | ({ kind: "finish"; key: string; href: string; verb: string; context: string; subject: string; question: true; deadline: null; since: Date; groupId: string; failed?: true } & QuestionLook)
  | { kind: "yep"; key: string; href: string; verb: string; context: string; subject: string; question: false; deadline: null; since: Date; groupId: string; proposal: ProposalRow; creditor: Person; denomination: DenominationRow; /** The last tap on it was told it was on its way and never landed (5.2): the didn't-go-through mark, and "Try again". */ failed?: true }
  | { kind: "game"; key: string; href: string; verb: string; context: string; subject: string; question: false; deadline: Date | null; since: Date; groupId: string; game: GameLook; /** The pressing question's kind, which decides where the row sorts. */ pressing: "vote" | "enter" | "lock" | "finish"; failed?: true }
  /** A claim to accept (4.7, PLANNING.md section 4): a friend added someone under this person's name in a set they share. Offered, never assumed; the verb is the one tap that takes it. */
  | { kind: "claim"; key: string; href: string; verb: string; context: string; subject: string; question: false; deadline: null; since: Date; groupId: string; claimId: string; failed?: true }
  /** A send this person was told was on its way and that never landed (src/lib/ledger/again.ts): still theirs to do. */
  | ({ kind: "again"; key: string; href: string; verb: string; context: string; subject: string; question: true; deadline: null; since: Date; groupId: string; failed: true } & QuestionLook)
  | { kind: "again"; key: string; href: string; verb: string; context: string; subject: string; question: false; deadline: null; since: Date; groupId: string; failed: true };

/** The words beside the didn't-go-through mark on a row for a send that was told and never landed (3.15, 3.23). */
export const AGAIN_CONTEXT = "Didn’t go through";
/** The words before the state's own on a row whose last tap is still going through (3.15). */
export const ON_WAY = "On its way";

const lookOf = (d: { id: string; ink?: string | null; markKind?: string | null; markValue?: string | null }, state: QuestionLook["state"]): QuestionLook => ({ mark: markRefOf(d), ink: inkOf({ id: d.id, ink: d.ink ?? null }), state });

/** Fastest to finish first, when nothing else separates two rows: a yep is one tap, a draft is a screen. */
const EFFORT: Record<NeedRow["kind"], number> = { yep: 0, vote: 1, enter: 2, lock: 3, finish: 4, game: 2, again: 1, claim: 0 };

/**
 * Time-bound before open-ended, as priority and never as pressure. A question in voting has a quorum waiting on
 * this person and ranks first; then whatever else has a deadline (a question to get into, the asker's lock),
 * soonest first; then the things that can sit harmlessly (a cover to say yep to, a draft), longest waiting first,
 * then fastest to finish. The order is the whole signal: no countdown, no day count, no ageing, and a deadline
 * that has passed still only sorts (docs/design.md 3.15; docs/decisions.md 2026-09-21).
 */
const TIER: Record<NeedRow["kind"], number> = { vote: 0, lock: 1, enter: 1, yep: 2, finish: 2, game: 1, again: 2, claim: 2 };
/** A game row sorts as its most pressing question would (4.7). */
const tierOf = (r: { kind: NeedRow["kind"]; pressing?: "vote" | "enter" | "lock" | "finish" }): number => (r.kind === "game" && r.pressing ? TIER[r.pressing] : TIER[r.kind]);
export function orderNeeds<T extends Pick<NeedRow, "deadline" | "since" | "kind"> & { pressing?: "vote" | "enter" | "lock" | "finish" }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (tierOf(a) !== tierOf(b)) return tierOf(a) - tierOf(b);
    const ad = a.deadline?.getTime() ?? Number.POSITIVE_INFINITY;
    const bd = b.deadline?.getTime() ?? Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    if (a.since.getTime() !== b.since.getTime()) return a.since.getTime() - b.since.getTime();
    return EFFORT[a.kind] - EFFORT[b.kind];
  });
}

const WORDS = ["None", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
const word = (n: number) => WORDS[n] ?? String(n);

/**
 * What one market needs from one viewer, or nothing. Pure. There is no scheduler in 2B, so the creator's
 * "time's up" is computed when the screen is read: the deadline arriving is a consequence of their own act, and
 * it is the only row here that time produces (PLANNING.md 8d; docs/decisions.md 2026-09-19).
 */
/** The count beside a clock lives with the copy, where the game's cards read it too (the second-pass round). */
export { inCount };

export function needFromMarket(m: Pick<MarketCardData, "dare" | "state" | "people" | "groupSize" | "votesCast" | "saidBy">, viewerId: string, voted: boolean, now: Date, closes: (at: Date) => string): Omit<Extract<NeedRow, { question: true }>, "groupId"> | null {
  const d = m.dare;
  const base = { key: d.id, subject: d.title, question: true as const, ...lookOf(d, m.state === "locked" ? (m.votesCast > 0 ? "voting" : "locked") : "open") };
  const iAmIn = m.people.some((p) => p.id === viewerId);
  if (m.state === "open") {
    const everyone = m.people.length >= m.groupSize && m.groupSize > 1;
    const timesUp = d.resolvesBy !== null && d.resolvesBy.getTime() <= now.getTime();
    // Needs you holds only what this person can finish now (4.7). The close refuses fewer than two in (`lockMarket`), so the asker's
    // Close on time's up is offered only with two or more in: a question only the asker is in stays in Running, where it swipes
    // to Remove (3.15). The reason beside the mark is the count (3.23: how many are in), never the state as a sentence: "6 of 6 in".
    if (d.creatorId === viewerId && iAmIn && (everyone || (timesUp && m.people.length >= 2))) return { ...base, kind: "lock", href: `/m/${d.id}#close`, verb: "Close", context: everyone ? inCount(m.people.length, m.groupSize) : "Time’s up on this one", deadline: d.resolvesBy, since: d.createdAt };
    // Past its time nobody gets in (the close is a hard cutoff: `pastItsClose` refuses the entry), so there is no Enter row to finish.
    if (!iAmIn && !timesUp) return { ...base, kind: "enter", href: `/m/${d.id}#enter`, verb: "Enter", context: `${d.resolvesBy ? `Closes ${closes(d.resolvesBy)} · ` : ""}${inCount(m.people.length, m.groupSize)}`, deadline: d.resolvesBy, since: d.createdAt };
    return null;
  }
  if (m.state === "locked" && iAmIn && !voted) {
    // The mark says it is in voting (3.23); the words beside it are who spoke and the count, never the state again.
    // Only the people in it call it (the first-contact round, 2026-10-04): the count is over the account-holders in.
    const voters = m.people.filter((p) => !p.ghost).length;
    const called = m.votesCast === 1 ? "has called it" : "have called it";
    const context = m.saidBy ? `${m.saidBy} says what happened · ${m.votesCast} of ${voters} ${called}` : m.votesCast > 0 ? `${word(m.votesCast)} of ${voters} ${called}` : `${d.resolvesBy ? `Voting ends ${closes(d.resolvesBy)}` : "Nobody has called it yet"}`;
    return { ...base, kind: "vote", href: `/m/${d.id}#ballot`, verb: "Vote", context, deadline: d.resolvesBy, since: d.lockedAt ?? d.createdAt };
  }
  return null;
}

export type PersonRow = { user: Person; token: { ownerId: string; denomination: DenominationRow; quantity: bigint } | null };

/** A question in flight this person has already acted on: where it stands, and no action (docs/design.md 4.7). A game with more than one is one row, its href the game page. */
export type RunningRow = { id: string; title: string; /** For the row's shell (9.4). */ shell?: MarketShell; mark: MarkRef | null; ink: InkName; state: "in" | "locked" | "voting"; caption: string; /** The set of people it belongs to, for collapsing a game's questions into one row. */ groupId?: string; game?: { away: TeamFace; home: TeamFace; href: string; /** The game's questions in this set, which the row swipes as one (3.15, ruled 2026-09-27). */ ids: string[] } | null; /** A market this person asked that nobody else is in, or a game none of whose questions anyone else is in: the row answers a left swipe with Remove (3.15). */ removable?: true; /** This person's last tap on it (the lock, the vote that decided it) is still going through (3.15, 5.2): the on-its-way mark stands in for the state mark. */ onWay?: true };

export type HomeData = {
  needs: NeedRow[];
  running: RunningRow[];
  happened: Array<{ kind: "market"; at: Date; market: MarketCardData } | { kind: "onway"; at: Date; href: string; subject: string; owner: Person } | { kind: "game"; at: Date; href: string; name: string; away: TeamFace; home: TeamFace; /** "Final: Bills 24, Chiefs 17", or how many questions when the score is not in. */ meta: string; state: "resolved" | "voided" | "expired"; /** The game's finished questions in this set, which the row archives as one (3.15, ruled 2026-09-27). */ ids: string[] } | { kind: "cover"; at: Date; obligation: typeof schema.obligations.$inferSelect; denomination: DenominationRow; from: Person; to: Person; groupLabel: string | null } | { kind: "closed"; at: Date; obligation: typeof schema.obligations.$inferSelect; denomination: DenominationRow; from: Person; to: Person; groupLabel: string | null; state: "settled" | "forgiven" }>;
  /** People with something open: a row each. */
  people: PersonRow[];
  /** Everyone who is square: one row, an avatar stack and a sentence, never a column of "nothing open". */
  square: Person[];
  hasAnything: boolean;
};

/** "Theo, Maya and John are square with you": one line that names the empty cases, instead of repeating them. */
export function squareSentence(names: string[]): string {
  const firsts = names.map((n) => n.trim().split(/\s+/)[0] ?? n);
  if (firsts.length === 0) return "";
  if (firsts.length === 1) return `${firsts[0]} is square with you`;
  if (firsts.length <= 3) return `${firsts.slice(0, -1).join(", ")} and ${firsts[firsts.length - 1]} are square with you`;
  return `${firsts.slice(0, 2).join(", ")} and ${firsts.length - 2} others are square with you`;
}

/**
 * The line under a running question (docs/design.md 3.15): while open, your entry and how many are in ("You're in
 * at 17 · six of you", "You're in at 70% · just you so far"); once it locks, the clock alone beside the mark
 * ("Resolving tonight", "Voting ends tonight"). Where it stands, never how long it has stood there, and never a
 * state in words: the mark says in, locked or voting (3.23).
 */
export function runningCaption(m: Pick<MarketCardData, "dare" | "state" | "people" | "groupSize" | "votesCast" | "unit" | "pickOne">, closes: (at: Date) => string, viewerId: string): string {
  const d = m.dare;
  if (m.state === "locked") return d.resolvesBy ? `${m.votesCast === 0 ? "Resolving" : "Voting ends"} ${closes(d.resolvesBy)}` : "";
  const mine = m.people.find((p) => p.id === viewerId) ?? null;
  const entry = !mine ? null : m.pickOne && mine.pick !== null ? `You’re in: ${m.pickOne.answers.find((a) => a.index === mine.pick)?.text ?? "?"}` : m.unit && mine.number !== null ? `You’re in at ${unitPhrase(BigInt(mine.number), m.unit)}` : mine.percent !== null ? `You’re in at ${mine.percent}%` : "You’re in";
  const n = m.people.length;
  const count = n <= 1 ? "just you so far" : `${word(n).toLowerCase()} of you`;
  return entry ? `${entry} · ${count}` : count;
}

export type NowData = Pick<HomeData, "needs" | "running" | "happened" | "hasAnything">;
export type PeopleData = Pick<HomeData, "people" | "square">;

/**
 * A game with more than one question in the same set of people is one row on Now (docs/design.md 4.7), in the
 * section its most pressing question belongs to: needs you over running over just happened, and within needs
 * you the tiers of `orderNeeds`. The row's subject is the game, its meta the pressing question's reason or
 * clock and how many questions, and its verb the pressing question's. Pure, so the collapse has tests.
 */
export function collapseGames<N extends { kind: NeedRow["kind"]; key: string; context: string; deadline: Date | null; since: Date; href: string; verb: string; groupId: string } & Partial<QuestionLook>, R extends { id: string; caption: string; state: RunningRow["state"]; groupId?: string; removable?: true }, O extends { dare: { id: string; groupId: string }; at: Date; state: string }>(
  input: { needs: N[]; running: R[]; over: O[] },
  games: Map<string, { gameId: string; name: string; away: TeamFace; home: TeamFace; score: string | null }>,
): { needs: Array<N | Extract<NeedRow, { kind: "game" }>>; running: Array<R | RunningRow>; over: O[]; happened: Array<Extract<HomeData["happened"][number], { kind: "game" }>> } {
  const groupOf = new Map<string, string>();
  for (const n of input.needs) groupOf.set(n.key, n.groupId);
  for (const o of input.over) groupOf.set(o.dare.id, o.dare.groupId);
  // One row per game, whatever sets its questions came from (3.15, decided 2026-10-02, the fifteenth session): the
  // row opens the one page that holds them all, so the key is the game alone; the set in the row's address is the
  // most pressing question's.
  const keyOf = (dareId: string, groupId: string | undefined) => {
    const g = games.get(dareId);
    return g && groupId ? g.gameId : null;
  };
  // Count each game's questions across the three lists.
  const counts = new Map<string, number>();
  const bump = (k: string | null) => k && counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const n of input.needs) bump(keyOf(n.key, n.groupId));
  for (const r of input.running) bump(keyOf(r.id, r.groupId ?? groupOf.get(r.id)));
  for (const o of input.over) bump(keyOf(o.dare.id, o.dare.groupId));
  const collapsed = (k: string | null) => k !== null && (counts.get(k) ?? 0) > 1;
  const seen = new Set<string>();
  const needs: Array<N | Extract<NeedRow, { kind: "game" }>> = [];
  for (const n of orderNeeds(input.needs)) {
    const k = keyOf(n.key, n.groupId);
    if (!collapsed(k)) {
      needs.push(n);
      continue;
    }
    if (seen.has(k as string)) continue;
    seen.add(k as string);
    const g = games.get(n.key)!;
    needs.push({ kind: "game", key: k as string, href: `/on/${g.gameId}?g=${n.groupId}`, verb: n.verb, context: `${n.context} · ${counts.get(k as string)} questions`, subject: g.name, question: false, deadline: n.deadline, since: n.since, groupId: n.groupId, game: { away: g.away, home: g.home, questions: counts.get(k as string) ?? 0, questionHref: n.href, state: n.state ?? "open" }, pressing: n.kind === "vote" || n.kind === "lock" || n.kind === "finish" ? n.kind : "enter" });
  }
  const running: Array<R | RunningRow> = [];
  // A game's running questions by game and set: the row swipes them as one, and only when every one of the game's questions is here and removable (ruled 2026-09-27: remove only when nobody else is in any of them).
  const runningByKey = new Map<string, R[]>();
  for (const r of input.running) {
    const k = keyOf(r.id, r.groupId ?? groupOf.get(r.id));
    if (k) runningByKey.set(k, [...(runningByKey.get(k) ?? []), r]);
  }
  for (const r of input.running) {
    const groupId = r.groupId ?? groupOf.get(r.id);
    const k = keyOf(r.id, groupId);
    if (!collapsed(k)) {
      running.push(r);
      continue;
    }
    if (seen.has(k as string)) continue;
    seen.add(k as string);
    const g = games.get(r.id)!;
    const rows = runningByKey.get(k as string) ?? [];
    const removable = rows.length === (counts.get(k as string) ?? 0) && rows.every((x) => x.removable === true);
    running.push({ id: r.id, title: g.name, mark: null, ink: "clay", state: r.state, caption: `${r.caption} · ${counts.get(k as string)} questions`, game: { away: g.away, home: g.home, href: `/on/${g.gameId}?g=${groupId}`, ids: rows.map((x) => x.id) }, ...(removable ? { removable: true as const } : {}) });
  }
  const over: O[] = [];
  const happened: Array<Extract<HomeData["happened"][number], { kind: "game" }>> = [];
  const overByKey = new Map<string, string[]>();
  for (const o of input.over) {
    const k = keyOf(o.dare.id, o.dare.groupId);
    if (k) overByKey.set(k, [...(overByKey.get(k) ?? []), o.dare.id]);
  }
  for (const o of input.over) {
    const k = keyOf(o.dare.id, o.dare.groupId);
    if (!collapsed(k)) {
      over.push(o);
      continue;
    }
    if (seen.has(k as string)) continue;
    seen.add(k as string);
    const g = games.get(o.dare.id)!;
    happened.push({ kind: "game", at: o.at, href: `/on/${g.gameId}?g=${o.dare.groupId}`, name: g.name, away: g.away, home: g.home, meta: g.score ? `Final: ${g.score}` : `${counts.get(k as string)} questions`, state: o.state === "voided" ? "voided" : o.state === "expired" ? "expired" : "resolved", ids: overByKey.get(k as string) ?? [o.dare.id] });
  }
  return { needs, running, over, happened };
}
/**
 * Which of Now's three lists a question is on, once what it needs from this person is known (docs/design.md 4.7):
 * Needs you when it needs them; Running is what they have acted on (an open question they are in, or any locked
 * one, since a lock is the group's act); Just happened is what has ended (settled, voided or expired, 3.15). An
 * open question this person is not in and can no longer get into (past its close, so `needFromMarket` offers no
 * Enter) is on no list at all: it has not ended, and it is nothing they did. Pure, so the rule has a test.
 */
export function listOf(m: Pick<MarketCardData, "state" | "viewerIn">, needed: boolean): "needs" | "running" | "over" | null {
  if (needed) return "needs";
  if ((m.state === "open" && m.viewerIn) || m.state === "locked") return "running";
  return m.state === "open" ? null : "over";
}

/** Every question this person can see, sorted into what needs them, what is running, and what is over. */
async function questionsFor(me: { id: string }, opts: { now: Date; closes: (at: Date) => string; zone: string }): Promise<{ needs: NeedRow[]; running: RunningRow[]; over: MarketCardData[]; gamesOver: Array<Extract<HomeData["happened"][number], { kind: "game" }>> }> {
  const [cards, myVotes] = await Promise.all([marketCards({ viewerId: me.id, limit: 40 }), db.select({ dareId: schema.dareVotes.dareId }).from(schema.dareVotes).where(eq(schema.dareVotes.userId, me.id))]);
  const voted = new Set(myVotes.map((v) => v.dareId));
  const needs: NeedRow[] = [];
  const running: RunningRow[] = [];
  const over: MarketCardData[] = [];
  for (const m of cards) {
    const n = needFromMarket(m, me.id, voted.has(m.dare.id), opts.now, opts.closes);
    const shell = shellOf(m, me.id, opts.now, opts.zone);
    const list = listOf(m, n !== null);
    if (n && list === "needs") needs.push({ ...n, groupId: m.dare.groupId, shell } as NeedRow);
    else if (list === "running") {
      running.push({ id: m.dare.id, title: m.dare.title, shell, mark: markRefOf(m.dare), ink: m.ink, state: m.state === "locked" ? (m.votesCast > 0 ? "voting" : "locked") : "in", caption: runningCaption(m, opts.closes, me.id), groupId: m.dare.groupId, ...(m.state === "open" && m.dare.creatorId === me.id && m.people.length === 1 && m.viewerIn ? { removable: true as const } : {}) });
    } else if (list === "over") over.push(m);
  }
  // A game with more than one question in the same set is one row (4.7).
  const fromGames = cards.filter((c) => c.dare.templateId);
  const games = fromGames.length ? await gamesOfMarkets(fromGames.map((c) => c.dare.id)) : new Map();
  const looks = new Map<string, { gameId: string; name: string; away: TeamFace; home: TeamFace; score: string | null }>();
  for (const [dareId, { game }] of games) looks.set(dareId, { gameId: game.id, name: game.name, away: { abbr: game.awayAbbr, name: game.awayShort, color: game.awayColor }, home: { abbr: game.homeAbbr, name: game.homeShort, color: game.homeColor }, score: game.finalSeenAt && game.homeScore !== null && game.awayScore !== null ? scoreLine({ home: game.homeScore, away: game.awayScore }, game.homeShort, game.awayShort) : null });
  const c = collapseGames({ needs, running, over }, looks);
  return { needs: c.needs as NeedRow[], running: c.running, over: c.over, gamesOver: c.happened };
}

/** Now: what needs this person, what is running, and what just happened are all in the database; the one indexer read is for how the closed ones closed, and only when there are any. */
export async function nowFor(me: { id: string; displayName: string }, opts: { now: Date; closes: (at: Date) => string; /** The viewer's zone, for the clocks the rows' shells carry (9.4). */ zone?: string }): Promise<NowData> {
  const [{ needs: needsAll, running, over, gamesOver }, pendingAll, drafts, covers, closed, again, onWay, suggested] = await Promise.all([
    questionsFor(me, { ...opts, zone: opts.zone ?? "UTC" }),
    pendingForDebtor(me.id),
    db.select().from(schema.dares).where(and(eq(schema.dares.creatorId, me.id), isNull(schema.dares.creatorSignature))).orderBy(desc(schema.dares.createdAt)).limit(6),
    db
      .select()
      .from(schema.obligations)
      .where(and(or(eq(schema.obligations.fromUser, me.id), eq(schema.obligations.toUser, me.id)), ne(schema.obligations.origin, "dare")))
      .orderBy(desc(schema.obligations.createdAt))
      .limit(8),
    // Closed obligations, by the offchain moment of the close (docs/decisions.md 2026-09-25): a settlement or a forgiveness is what the group did.
    db
      .select()
      .from(schema.obligations)
      .where(and(or(eq(schema.obligations.fromUser, me.id), eq(schema.obligations.toUser, me.id)), isNotNull(schema.obligations.closedAt)))
      .orderBy(desc(schema.obligations.closedAt))
      .limit(8),
    againRowsFor(me.id, opts.now),
    onWayFor(me.id, opts.now),
    suggestedGhostsFor(me.id, me.displayName),
  ]);
  // A tap still going through (5.2) has left Needs you: the asker's lock runs with the mark, and a yep is in Just happened.
  const needs = needsAll.filter((n) => !(n.kind === "lock" && onWay.locks.has(n.key)));
  for (const n of needsAll) if (n.kind === "lock" && onWay.locks.has(n.key)) running.unshift({ id: n.key, title: n.subject, mark: n.mark, ink: n.ink, state: "in", caption: n.context, onWay: true });
  for (const r of running) if (onWay.resolves.has(r.id) || onWay.locks.has(r.id)) r.onWay = true;
  const pending = pendingAll.filter((p) => !onWay.confirms.has(p.id));
  // A lock this person was told was on its way and that never landed (5.2): the row wears the mark and "Try again".
  for (const n of needs) {
    if (n.kind === "lock" && again.locks.has(n.key)) {
      n.context = AGAIN_CONTEXT;
      n.verb = "Try again";
      n.failed = true;
    }
  }
  for (const a of again.rows) {
    if (a.kind === "create" && needs.some((n) => n.kind === "lock" && n.key === a.dare?.id)) continue;
    if (a.dare) needs.push({ kind: "again", key: a.hash, href: a.href, verb: "Try again", context: AGAIN_CONTEXT, subject: a.subject, question: true, deadline: null, since: a.at, groupId: a.groupId, failed: true, ...lookOf(a.dare, a.dare.locked ? "locked" : "open") });
    else needs.push({ kind: "again", key: a.hash, href: a.href, verb: "Try again", context: AGAIN_CONTEXT, subject: a.subject, question: false, deadline: null, since: a.at, groupId: a.groupId, failed: true });
  }
  // The label on an event says which set of people it came out of. It is a label, never a way in.
  const groupIds = Array.from(new Set([...over.map((m) => m.dare.groupId), ...covers.map((o) => o.groupId), ...closed.map((o) => o.groupId)]));
  const [groupRows, groupMembers] = await Promise.all([groupIds.length ? db.select().from(schema.groups).where(inArray(schema.groups.id, groupIds)) : Promise.resolve([]), membersOfGroups(groupIds)]);
  const labelOf = new Map(groupRows.map((g) => [g.id, setLabel({ name: g.name, isDyad: g.isDyad, memberNames: (groupMembers.get(g.id) ?? []).map((m) => m.displayName), viewerName: me.displayName })]));

  const counterparties = Array.from(new Set([...pending.map((p) => p.toUser), ...covers.flatMap((o) => [o.fromUser, o.toUser]), ...closed.flatMap((o) => [o.fromUser, o.toUser])].filter((x): x is string => Boolean(x) && x !== me.id)));
  const [users, denoms] = await Promise.all([
    counterparties.length ? db.select({ id: schema.users.id, displayName: schema.users.displayName }).from(schema.users).where(inArray(schema.users.id, counterparties)) : Promise.resolve([]),
    denominationsByIds(Array.from(new Set([...pending.map((p) => p.denomId), ...covers.map((o) => o.denomId), ...closed.map((o) => o.denomId)]))),
  ]);
  const userById = new Map<string, Person>([[me.id, { id: me.id, displayName: me.displayName }], ...users.map((u) => [u.id, { id: u.id, displayName: u.displayName }] as const)]);

  for (const p of pending) {
    const creditor = p.toUser ? userById.get(p.toUser) : undefined;
    const denomination = denoms.get(p.denomId);
    if (!creditor || !denomination) continue;
    const failed = again.confirms.has(p.id);
    needs.push({ kind: "yep", key: p.id, href: `/o/${p.id}`, verb: failed ? "Try again" : "Yep", context: failed ? AGAIN_CONTEXT : p.memo ? `${creditor.displayName} got ${p.memo}` : `${creditor.displayName} got this one`, subject: `${creditor.displayName}'s got you`, question: false, deadline: null, since: p.createdAt, groupId: p.groupId, proposal: p, creditor, denomination, ...(failed ? { failed: true as const } : {}) });
  }
  // An unsent draft is a Needs you row for a day, and then lives on You (the first-contact round).
  for (const d of drafts.filter((x) => draftOnNow(x.createdAt, opts.now))) needs.push({ kind: "finish", key: d.id, href: `/m/${d.id}`, verb: "Finish", context: "You never sent this one", subject: d.title, question: true, deadline: null, since: d.createdAt, groupId: d.groupId, ...lookOf(d, "draft") });
  // A claim to accept is a Needs you row (4.7), never a section of its own: a friend added someone under this name in a set they share.
  for (const g of suggested) needs.push({ kind: "claim", key: g.claimId, href: "/welcome", verb: "That’s me", context: `${g.creatorName} has things with a ${g.displayName}`, subject: "Is that you?", question: false, deadline: null, since: opts.now, groupId: "", claimId: g.claimId });

  const happened: HomeData["happened"] = [...gamesOver];
  // What this person just did that is still going through (5.2): the yep, the settlement, the cancelling out, marked on its way.
  for (const w of onWay.rows) happened.push({ kind: "onway", at: w.at, href: w.href, subject: w.subject, owner: w.owner });
  // A finished market this person swiped off their Now stays off it (3.15, archive); it is nowhere else changed.
  const archived = await archivedFor(me.id);
  for (const m of over) if (!archived.has(m.dare.id)) happened.push({ kind: "market", at: m.at, market: { ...m, groupName: labelOf.get(m.dare.groupId) ?? m.groupName } });
  // A finished game archives as one row (ruled 2026-09-27): it stays while any of its questions here is not archived.
  for (let i = happened.length - 1; i >= 0; i--) {
    const e = happened[i]!;
    if (e.kind === "game" && e.ids.every((id) => archived.has(id))) happened.splice(i, 1);
  }
  for (const o of covers) {
    const denomination = denoms.get(o.denomId);
    const from = userById.get(o.fromUser);
    const to = userById.get(o.toUser);
    if (denomination && from && to) happened.push({ kind: "cover", at: o.createdAt, obligation: o, denomination, from, to, groupLabel: labelOf.get(o.groupId) ?? null });
  }
  // How each closed one closed is the chain's to say; the moment it closed is the app's (closed_at).
  const indexed = closed.length ? await obligationsById(closed.map((o) => uuidToBytes16(o.id))).catch(() => new Map<string, never>()) : new Map<string, never>();
  for (const o of closed) {
    const denomination = denoms.get(o.denomId);
    const from = userById.get(o.fromUser);
    const to = userById.get(o.toUser);
    if (!denomination || !from || !to || !o.closedAt) continue;
    const e = indexed.get(uuidToBytes16(o.id)) as { settled: string; forgiven: string } | undefined;
    const state = e && BigInt(e.forgiven) > 0n && BigInt(e.settled) === 0n ? "forgiven" : "settled";
    happened.push({ kind: "closed", at: o.closedAt, obligation: o, denomination, from, to, groupLabel: labelOf.get(o.groupId) ?? null, state });
  }
  // The offchain timestamp, never the chain's.
  happened.sort((a, b) => b.at.getTime() - a.at.getTime());

  return { needs: orderNeeds(needs), running, happened: happened.slice(0, 8), hasAnything: needs.length > 0 || running.length > 0 || happened.length > 0 };
}

/** People: the one indexer query, for the open edges that give each person their token. */
export async function peopleFor(me: { id: string; displayName: string; ledgerWallet: string }): Promise<PeopleData> {
  const [open, known] = await Promise.all([
    // One indexer query for the whole screen: the hosted endpoint allows a hundred a minute across everyone.
    openTouching(me.ledgerWallet).catch((err: unknown) => {
      console.error("people: open edges unavailable", err);
      return [];
    }),
    // Everyone this person shares anything with, one-on-one included: a dyad is a group nobody sees as one.
    peopleForUser(me.id),
  ]);
  const openRows = open.length ? await db.select().from(schema.obligations).where(inArray(schema.obligations.id, open.map((e) => bytes16ToUuid(e.id)))) : [];
  const counterparties = Array.from(new Set([...openRows.flatMap((o) => [o.fromUser, o.toUser]), ...known.map((k) => k.user.id)].filter((x): x is string => Boolean(x) && x !== me.id)));
  const [users, denoms] = await Promise.all([
    counterparties.length ? db.select({ id: schema.users.id, displayName: schema.users.displayName, ledgerWallet: schema.users.ledgerWallet }).from(schema.users).where(inArray(schema.users.id, counterparties)) : Promise.resolve([]),
    denominationsByIds(Array.from(new Set(openRows.map((o) => o.denomId)))),
  ]);
  const userById = new Map<string, Person>(users.map((u) => [u.id, { id: u.id, displayName: u.displayName }] as const));

  // One token per person: the same unit between two people nets before display, and the first unit in display
  // order stands for the rest (docs/design.md 3.18). The person view has all of it.
  const walletOf = new Map(users.map((u) => [u.ledgerWallet.toLowerCase(), u.id]));
  const rowById = new Map(openRows.map((o) => [o.id, o]));
  const net = new Map<string, Map<string, bigint>>(); // person -> unit -> (they owe me) minus (I owe them)
  for (const e of open) {
    const row = rowById.get(bytes16ToUuid(e.id));
    const iOwe = e.debtor.toLowerCase() === me.ledgerWallet.toLowerCase();
    const other = walletOf.get((iOwe ? e.creditor : e.debtor).toLowerCase());
    if (!row || !other) continue;
    const units = net.get(other) ?? new Map<string, bigint>();
    units.set(row.denomId, (units.get(row.denomId) ?? 0n) + (iOwe ? -BigInt(e.remaining) : BigInt(e.remaining)));
    net.set(other, units);
  }
  const rank = (d: DenominationRow) => (d.monetary ? 2 : d.template && d.template !== "usd" ? 0 : 1);
  const scopeIds = new Set<string>([...net.keys(), ...known.map((k) => k.user.id)]);
  const people: PersonRow[] = [];
  for (const id of scopeIds) {
    const user = userById.get(id);
    if (!user) continue;
    const lines = Array.from(net.get(id) ?? [])
      .map(([denomId, v]) => ({ denomination: denoms.get(denomId), v }))
      .filter((l): l is { denomination: DenominationRow; v: bigint } => Boolean(l.denomination) && l.v !== 0n)
      .sort((a, b) => rank(a.denomination) - rank(b.denomination));
    const first = lines[0];
    people.push({ user, token: first ? { ownerId: first.v > 0n ? id : me.id, denomination: first.denomination, quantity: first.v > 0n ? first.v : -first.v } : null });
  }
  const openPeople = people.filter((p) => p.token !== null).sort((a, b) => a.user.displayName.localeCompare(b.user.displayName));
  const square = people.filter((p) => p.token === null).map((p) => p.user).sort((a, b) => a.displayName.localeCompare(b.displayName));
  return { people: openPeople, square };
}

/** Everything, for the checks: Now and People together, as one data shape. */
export async function homeFor(me: { id: string; displayName: string; ledgerWallet: string }, opts: { now: Date; closes: (at: Date) => string }): Promise<HomeData> {
  const [now, people] = await Promise.all([nowFor(me, opts), peopleFor(me)]);
  return { ...now, ...people, hasAnything: now.hasAnything || people.people.length > 0 || people.square.length > 0 };
}
