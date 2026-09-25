/**
 * Now, event-first (docs/design.md 4.7, 6.1). "Needs you" is only what will not move without this person;
 * "Running" is what they have already acted on and is still in flight; "Just happened" is what the group did.
 * People are their own root, and a group is a label on an event, never a place to go.
 *
 * The rows are assembled here as data so the ordering rule and the "nothing counts, nothing ages" rule have tests.
 */
import { and, desc, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { inkOf, type InkName } from "@/lib/ui/ink";
import { bytes16ToUuid, uuidToBytes16 } from "./ids";
import { denominationsByIds, type DenominationRow } from "./denominations";
import { obligationsById, openTouching } from "./envio";
import { membersOfGroups, peopleForUser, setLabel } from "./groups";
import { marketCards, type MarketCardData } from "./market-view";
import { pendingForDebtor, type ProposalRow } from "./proposals";

type Person = { id: string; displayName: string };

/** What the row's state mark says (docs/design.md 3.23), and the market's mark and ink for its 40px stamp (3.15). */
type QuestionLook = { mark: string | null; ink: InkName; state: "open" | "locked" | "voting" | "draft" };

export type NeedRow =
  | ({ kind: "vote" | "enter" | "lock"; key: string; href: string; verb: string; context: string; subject: string; question: true; deadline: Date | null; since: Date; groupId: string } & QuestionLook)
  | ({ kind: "finish"; key: string; href: string; verb: string; context: string; subject: string; question: true; deadline: null; since: Date; groupId: string } & QuestionLook)
  | { kind: "yep"; key: string; href: string; verb: string; context: string; subject: string; question: false; deadline: null; since: Date; groupId: string; proposal: ProposalRow; creditor: Person; denomination: DenominationRow };

const lookOf = (d: { id: string; ink?: string | null; markKind?: string | null; markValue?: string | null }, state: QuestionLook["state"]): QuestionLook => ({ mark: d.markKind === "emoji" && d.markValue ? d.markValue : null, ink: inkOf({ id: d.id, ink: d.ink ?? null }), state });

/** Fastest to finish first, when nothing else separates two rows: a yep is one tap, a draft is a screen. */
const EFFORT: Record<NeedRow["kind"], number> = { yep: 0, vote: 1, enter: 2, lock: 3, finish: 4 };

/**
 * Time-bound before open-ended, as priority and never as pressure. A question in voting has a quorum waiting on
 * this person and ranks first; then whatever else has a deadline (a question to get into, the asker's lock),
 * soonest first; then the things that can sit harmlessly (a cover to say yep to, a draft), longest waiting first,
 * then fastest to finish. The order is the whole signal: no countdown, no day count, no ageing, and a deadline
 * that has passed still only sorts (docs/design.md 3.15; docs/decisions.md 2026-09-21).
 */
const TIER: Record<NeedRow["kind"], number> = { vote: 0, lock: 1, enter: 1, yep: 2, finish: 2 };
export function orderNeeds<T extends Pick<NeedRow, "deadline" | "since" | "kind">>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (TIER[a.kind] !== TIER[b.kind]) return TIER[a.kind] - TIER[b.kind];
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
export function needFromMarket(m: Pick<MarketCardData, "dare" | "state" | "people" | "groupSize" | "votesCast" | "saidBy">, viewerId: string, voted: boolean, now: Date, closes: (at: Date) => string): Omit<Extract<NeedRow, { question: true }>, "groupId"> | null {
  const d = m.dare;
  const base = { key: d.id, subject: d.title, question: true as const, ...lookOf(d, m.state === "locked" ? (m.votesCast > 0 ? "voting" : "locked") : "open") };
  const iAmIn = m.people.some((p) => p.id === viewerId);
  if (m.state === "open") {
    const everyone = m.people.length >= m.groupSize && m.groupSize > 1;
    const timesUp = d.resolvesBy !== null && d.resolvesBy.getTime() <= now.getTime();
    if (d.creatorId === viewerId && iAmIn && (everyone || timesUp)) return { ...base, kind: "lock", href: `/m/${d.id}`, verb: "Lock", context: everyone ? "Everyone's in" : "Time's up on this one", deadline: d.resolvesBy, since: d.createdAt };
    if (!iAmIn) return { ...base, kind: "enter", href: `/m/${d.id}`, verb: "Enter", context: `${d.resolvesBy ? `Closes ${closes(d.resolvesBy)} · ` : ""}${m.people.length} of ${m.groupSize} in`, deadline: d.resolvesBy, since: d.createdAt };
    return null;
  }
  if (m.state === "locked" && !voted) {
    // The mark says it is in voting (3.23); the words beside it are who spoke and the count, never the state again.
    const context = m.saidBy ? `${m.saidBy} says what happened · ${m.votesCast} of ${m.groupSize} have called it` : m.votesCast > 0 ? `${word(m.votesCast)} of ${m.groupSize} have called it` : `${d.resolvesBy ? `Voting ends ${closes(d.resolvesBy)}` : "Nobody has called it yet"}`;
    return { ...base, kind: "vote", href: `/m/${d.id}#ballot`, verb: "Vote", context, deadline: d.resolvesBy, since: d.lockedAt ?? d.createdAt };
  }
  return null;
}

export type PersonRow = { user: Person; token: { ownerId: string; denomination: DenominationRow; quantity: bigint } | null };

/** A question in flight this person has already acted on: where it stands, and no action (docs/design.md 4.7). */
export type RunningRow = { id: string; title: string; mark: string | null; ink: InkName; state: "in" | "locked" | "voting"; caption: string };

export type HomeData = {
  needs: NeedRow[];
  running: RunningRow[];
  happened: Array<{ kind: "market"; at: Date; market: MarketCardData } | { kind: "cover"; at: Date; obligation: typeof schema.obligations.$inferSelect; denomination: DenominationRow; from: Person; to: Person; groupLabel: string | null } | { kind: "closed"; at: Date; obligation: typeof schema.obligations.$inferSelect; denomination: DenominationRow; from: Person; to: Person; groupLabel: string | null; state: "settled" | "forgiven" }>;
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

/** The line under a running question: where it stands, never how long it has stood there. */
export function runningCaption(m: Pick<MarketCardData, "dare" | "state" | "people" | "groupSize" | "votesCast">, closes: (at: Date) => string): string {
  const d = m.dare;
  // The state mark beside it says in, locked or voting (3.23); the words say where it stands and the clock.
  if (m.state === "locked") return m.votesCast === 0 ? (d.resolvesBy ? `Resolving ${closes(d.resolvesBy)}` : "Waiting on how it came out") : `${m.votesCast} of ${m.groupSize} have called it`;
  if (d.pace === "argument") return "Waiting on the other side";
  return `${m.people.length} of ${m.groupSize} in${d.resolvesBy ? ` · closes ${closes(d.resolvesBy)}` : ""}`;
}

/**
 * The dot on the Now tab (docs/design.md 6.4): something with a clock is waiting on this person. Waiting alone is
 * not enough; a cover to confirm can sit for a week and never lights it.
 */
export function timeBound(rows: Array<Pick<NeedRow, "deadline">>): boolean {
  return rows.some((r) => r.deadline !== null);
}

export type NowData = Pick<HomeData, "needs" | "running" | "happened" | "hasAnything">;
export type PeopleData = Pick<HomeData, "people" | "square">;

/** Every question this person can see, sorted into what needs them, what is running, and what is over. */
async function questionsFor(me: { id: string }, opts: { now: Date; closes: (at: Date) => string }): Promise<{ needs: NeedRow[]; running: RunningRow[]; over: MarketCardData[] }> {
  const [cards, myVotes] = await Promise.all([marketCards({ viewerId: me.id, limit: 40 }), db.select({ dareId: schema.dareVotes.dareId }).from(schema.dareVotes).where(eq(schema.dareVotes.userId, me.id))]);
  const voted = new Set(myVotes.map((v) => v.dareId));
  const needs: NeedRow[] = [];
  const running: RunningRow[] = [];
  const over: MarketCardData[] = [];
  for (const m of cards) {
    const n = needFromMarket(m, me.id, voted.has(m.dare.id), opts.now, opts.closes);
    if (n) needs.push({ ...n, groupId: m.dare.groupId } as NeedRow);
    else if (m.state === "open" || m.state === "locked") running.push({ id: m.dare.id, title: m.dare.title, mark: m.dare.markKind === "emoji" ? m.dare.markValue : null, ink: m.ink, state: m.state === "locked" ? (m.votesCast > 0 ? "voting" : "locked") : "in", caption: runningCaption(m, opts.closes) });
    else over.push(m);
  }
  return { needs, running, over };
}

/** Whether the dot shows on Now. Worked out the same way on every root, from the questions alone. */
export async function liveFor(me: { id: string }, now: Date): Promise<boolean> {
  return timeBound((await questionsFor(me, { now, closes: () => "" })).needs);
}

/** Now: what needs this person, what is running, and what just happened are all in the database; the one indexer read is for how the closed ones closed, and only when there are any. */
export async function nowFor(me: { id: string; displayName: string }, opts: { now: Date; closes: (at: Date) => string }): Promise<NowData> {
  const [{ needs, running, over }, pending, drafts, covers, closed] = await Promise.all([
    questionsFor(me, opts),
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
  ]);
  // The label on an event says which set of people it came out of. It is a label, never a way in.
  const groupIds = Array.from(new Set([...over.map((m) => m.dare.groupId), ...covers.map((o) => o.groupId), ...closed.map((o) => o.groupId)]));
  const [groupRows, groupMembers] = await Promise.all([groupIds.length ? db.select().from(schema.groups).where(inArray(schema.groups.id, groupIds)) : Promise.resolve([]), membersOfGroups(groupIds)]);
  const labelOf = new Map(groupRows.map((g) => [g.id, setLabel({ name: g.name, isDyad: g.isDyad, memberNames: (groupMembers.get(g.id) ?? []).filter((m) => m.userId).map((m) => m.displayName), viewerName: me.displayName })]));

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
    needs.push({ kind: "yep", key: p.id, href: `/o/${p.id}`, verb: "Yep", context: p.memo ? `${creditor.displayName} got ${p.memo}` : `${creditor.displayName} got this one`, subject: `${creditor.displayName}'s got you`, question: false, deadline: null, since: p.createdAt, groupId: p.groupId, proposal: p, creditor, denomination });
  }
  for (const d of drafts) needs.push({ kind: "finish", key: d.id, href: `/m/${d.id}`, verb: "Finish", context: "You never sent this one", subject: d.title, question: true, deadline: null, since: d.createdAt, groupId: d.groupId, ...lookOf(d, "draft") });

  const happened: HomeData["happened"] = [];
  for (const m of over) happened.push({ kind: "market", at: m.at, market: { ...m, groupName: labelOf.get(m.dare.groupId) ?? m.groupName } });
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
