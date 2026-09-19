/**
 * Home, event-first (docs/design.md 4.7). Asking and joining come first; "Needs you" is only what will not move
 * without this person; "Just happened" is what the group did; people and groups are ways to reach things, and a
 * group is a chip that filters this screen, never a place to go.
 *
 * The rows are assembled here as data so the ordering rule and the "nothing counts, nothing ages" rule have tests.
 */
import { and, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { bytes16ToUuid } from "./ids";
import { denominationsByIds, type DenominationRow } from "./denominations";
import { openTouching } from "./envio";
import { groupChipsFor, peopleForUser, type GroupChip } from "./groups";
import { marketCards, type MarketCardData } from "./market-view";
import { pendingForDebtor, type ProposalRow } from "./proposals";

type Person = { id: string; displayName: string };

export type NeedRow =
  | { kind: "vote" | "enter" | "lock"; key: string; href: string; verb: string; context: string; subject: string; question: true; deadline: Date | null; since: Date; groupId: string }
  | { kind: "finish"; key: string; href: string; verb: string; context: string; subject: string; question: true; deadline: null; since: Date; groupId: string }
  | { kind: "yep"; key: string; href: string; verb: string; context: string; subject: string; question: false; deadline: null; since: Date; groupId: string; proposal: ProposalRow; creditor: Person; denomination: DenominationRow };

/** Fastest to finish first, when nothing else separates two rows: a yep is one tap, a draft is a screen. */
const EFFORT: Record<NeedRow["kind"], number> = { yep: 0, vote: 1, enter: 2, lock: 3, finish: 4 };

/**
 * docs/design.md 3.15: soonest deadline first, then longest waiting, then whatever is fastest to finish. A
 * deadline that has passed still sorts as a deadline; nothing here is ever labelled with how long it has waited.
 */
export function orderNeeds<T extends Pick<NeedRow, "deadline" | "since" | "kind">>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.deadline && b.deadline && a.deadline.getTime() !== b.deadline.getTime()) return a.deadline.getTime() - b.deadline.getTime();
    if (a.deadline && !b.deadline) return -1;
    if (!a.deadline && b.deadline) return 1;
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
  const base = { key: d.id, subject: d.title, question: true as const };
  const iAmIn = m.people.some((p) => p.id === viewerId);
  if (m.state === "open") {
    const everyone = m.people.length >= m.groupSize && m.groupSize > 1;
    const timesUp = d.resolvesBy !== null && d.resolvesBy.getTime() <= now.getTime();
    if (d.creatorId === viewerId && iAmIn && (everyone || timesUp)) return { ...base, kind: "lock", href: `/m/${d.id}`, verb: "Lock", context: everyone ? "Everyone's in" : "Time's up on this one", deadline: d.resolvesBy, since: d.createdAt };
    if (!iAmIn) return { ...base, kind: "enter", href: `/m/${d.id}`, verb: "Enter", context: `${d.resolvesBy ? `Closes ${closes(d.resolvesBy)} · ` : ""}${m.people.length} of ${m.groupSize} in`, deadline: d.resolvesBy, since: d.createdAt };
    return null;
  }
  if (m.state === "locked" && !voted) {
    const context = m.saidBy ? `${m.saidBy} says what happened · ${m.votesCast} of ${m.groupSize} have called it` : m.votesCast > 0 ? `${word(m.votesCast)} of ${m.groupSize} have called it` : "Waiting on how it came out";
    return { ...base, kind: "vote", href: `/m/${d.id}#ballot`, verb: "Vote", context, deadline: d.resolvesBy, since: d.lockedAt ?? d.createdAt };
  }
  return null;
}

export type PersonRow = { user: Person; token: { ownerId: string; denomination: DenominationRow; quantity: bigint } | null };

export type HomeData = {
  chips: GroupChip[];
  /** Groups this person hid. Reachable, never in the way. */
  hidden: GroupChip[];
  selected: GroupChip | null;
  needs: NeedRow[];
  happened: Array<{ kind: "market"; at: Date; market: MarketCardData } | { kind: "cover"; at: Date; obligation: typeof schema.obligations.$inferSelect; denomination: DenominationRow; from: Person; to: Person; groupLabel: string | null }>;
  people: PersonRow[];
  hasAnything: boolean;
};

export async function homeFor(me: { id: string; displayName: string; ledgerWallet: string }, opts: { groupId?: string; now: Date; closes: (at: Date) => string }): Promise<HomeData> {
  const [chips, cards, pending, drafts, myVotes, covers, open, known] = await Promise.all([
    groupChipsFor(me.id, me.displayName),
    marketCards({ viewerId: me.id, limit: 40 }),
    pendingForDebtor(me.id),
    db.select().from(schema.dares).where(and(eq(schema.dares.creatorId, me.id), isNull(schema.dares.creatorSignature))).orderBy(desc(schema.dares.createdAt)).limit(6),
    db.select({ dareId: schema.dareVotes.dareId }).from(schema.dareVotes).where(eq(schema.dareVotes.userId, me.id)),
    db
      .select()
      .from(schema.obligations)
      .where(and(or(eq(schema.obligations.fromUser, me.id), eq(schema.obligations.toUser, me.id)), ne(schema.obligations.origin, "dare")))
      .orderBy(desc(schema.obligations.createdAt))
      .limit(8),
    // One indexer query for the whole screen: the hosted endpoint allows a hundred a minute across everyone.
    openTouching(me.ledgerWallet).catch((err: unknown) => {
      console.error("home: open edges unavailable", err);
      return [];
    }),
    // Everyone this person shares anything with, one-on-one included: a dyad is a group nobody sees as one.
    peopleForUser(me.id),
  ]);
  const visible = chips.filter((c) => !c.archived);
  const selected = opts.groupId ? (chips.find((c) => c.id === opts.groupId) ?? null) : null;
  const inScope = (groupId: string) => (selected ? groupId === selected.id : !chips.some((c) => c.id === groupId && c.archived));
  const labelOf = new Map(chips.map((c) => [c.id, c.label]));
  const voted = new Set(myVotes.map((v) => v.dareId));

  const openRows = open.length ? await db.select().from(schema.obligations).where(inArray(schema.obligations.id, open.map((e) => bytes16ToUuid(e.id)))) : [];
  const counterparties = Array.from(new Set([...pending.map((p) => p.toUser), ...covers.flatMap((o) => [o.fromUser, o.toUser]), ...openRows.flatMap((o) => [o.fromUser, o.toUser]), ...visible.flatMap((c) => c.members.map((m) => m.userId)), ...known.map((k) => k.user.id)].filter((x): x is string => Boolean(x) && x !== me.id)));
  const [users, denoms] = await Promise.all([
    counterparties.length ? db.select({ id: schema.users.id, displayName: schema.users.displayName, ledgerWallet: schema.users.ledgerWallet }).from(schema.users).where(inArray(schema.users.id, counterparties)) : Promise.resolve([]),
    denominationsByIds(Array.from(new Set([...pending.map((p) => p.denomId), ...covers.map((o) => o.denomId), ...openRows.map((o) => o.denomId)]))),
  ]);
  const userById = new Map<string, Person>([[me.id, { id: me.id, displayName: me.displayName }], ...users.map((u) => [u.id, { id: u.id, displayName: u.displayName }] as const)]);

  const needs: NeedRow[] = [];
  for (const m of cards) {
    if (!inScope(m.dare.groupId)) continue;
    const n = needFromMarket(m, me.id, voted.has(m.dare.id), opts.now, opts.closes);
    if (n) needs.push({ ...n, groupId: m.dare.groupId } as NeedRow);
  }
  for (const p of pending) {
    const creditor = p.toUser ? userById.get(p.toUser) : undefined;
    const denomination = denoms.get(p.denomId);
    if (!creditor || !denomination || !inScope(p.groupId)) continue;
    needs.push({ kind: "yep", key: p.id, href: `/o/${p.id}`, verb: "Yep", context: p.memo ? `${creditor.displayName} got ${p.memo}` : `${creditor.displayName} got this one`, subject: `${creditor.displayName}'s got you`, question: false, deadline: null, since: p.createdAt, groupId: p.groupId, proposal: p, creditor, denomination });
  }
  if (!selected) for (const d of drafts) needs.push({ kind: "finish", key: d.id, href: `/m/${d.id}`, verb: "Finish", context: "You started this and never sent it", subject: d.title, question: true, deadline: null, since: d.createdAt, groupId: d.groupId });

  const happened: HomeData["happened"] = [];
  const needing = new Set(needs.map((n) => n.key));
  for (const m of cards) if (inScope(m.dare.groupId) && !needing.has(m.dare.id)) happened.push({ kind: "market", at: m.at, market: { ...m, groupName: labelOf.get(m.dare.groupId) ?? m.groupName } });
  for (const o of covers) {
    const denomination = denoms.get(o.denomId);
    const from = userById.get(o.fromUser);
    const to = userById.get(o.toUser);
    if (denomination && from && to && inScope(o.groupId)) happened.push({ kind: "cover", at: o.createdAt, obligation: o, denomination, from, to, groupLabel: labelOf.get(o.groupId) ?? null });
  }
  // The offchain timestamp, never the chain's.
  happened.sort((a, b) => b.at.getTime() - a.at.getTime());

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
  const scopeIds = new Set((selected ? [selected] : visible).flatMap((c) => c.members.map((m) => m.userId)).filter((x): x is string => Boolean(x) && x !== me.id));
  if (!selected) for (const id of [...net.keys(), ...known.map((k) => k.user.id)]) scopeIds.add(id);
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
  people.sort((a, b) => Number(Boolean(b.token)) - Number(Boolean(a.token)) || a.user.displayName.localeCompare(b.user.displayName));

  return { chips: visible, hidden: chips.filter((c) => c.archived), selected, needs: orderNeeds(needs), happened: happened.slice(0, 8), people, hasAnything: chips.length > 0 || needs.length > 0 || happened.length > 0 || people.length > 0 };
}
