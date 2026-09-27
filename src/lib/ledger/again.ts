/**
 * What a person was told was on its way and never landed (docs/decisions.md 2026-09-27, "a send is never lost"):
 * a write the relayer recorded with them as its actor, whose request ended with the pending line, and which the
 * tick then dropped or found reverted. Nothing was recorded for it, so the thing is still theirs to do, and Now
 * says so on the row for it: the yep row's reason line for a confirm, the lock row's for a lock, and a row of its
 * own for a settlement, a forgiveness or a cancelling out. A resolution or a tiebreaker the relayer can resend
 * from what is already signed is the tick's to finish, not the person's.
 *
 * Shown until a later send for the same thing exists (whoever made it, whatever became of it, unless it too was
 * dropped), until the thing is no longer open, or until a week has passed. The owner heard by email at the drop.
 */
import { and, desc, eq, gt, inArray, isNotNull } from "drizzle-orm";
import type { Hex } from "viem";
import { db, schema } from "@/db";
import type { WriteKind } from "@/lib/chain/relayer";

export const AGAIN_WINDOW_MS = 7 * 24 * 3_600_000;

/** The kinds a person can do again from a screen. The rest the tick resends from what is already signed. */
const THEIRS: ReadonlySet<WriteKind> = new Set<WriteKind>(["confirm", "close", "net", "create", "arbitrate"]);

export type Again = { hash: Hex; kind: WriteKind; subject: Record<string, unknown>; status: "dropped" | "reverted"; at: Date };

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** The person's told sends that were dropped or reverted, newest first, minus those a later send superseded. */
export async function againFor(userId: string, now: Date): Promise<Again[]> {
  const W = schema.chainWrites;
  const since = new Date(now.getTime() - AGAIN_WINDOW_MS);
  const failed = await db
    .select({ hash: W.hash, kind: W.kind, subject: W.subject, status: W.status, createdAt: W.createdAt })
    .from(W)
    .where(and(eq(W.actorId, userId), isNotNull(W.toldAt), inArray(W.status, ["dropped", "reverted"]), gt(W.createdAt, since)))
    .orderBy(desc(W.createdAt));
  const mine = failed.filter((w) => THEIRS.has(w.kind as WriteKind));
  if (mine.length === 0) return [];
  // A later send for the same thing, by anyone: the retry went out, and this one is history.
  const later = await db
    .select({ kind: W.kind, subject: W.subject, createdAt: W.createdAt })
    .from(W)
    .where(and(inArray(W.subject, Array.from(new Set(mine.map((w) => w.subject)))), inArray(W.status, ["pending", "mined"])));
  const out: Again[] = [];
  const seen = new Set<string>();
  for (const w of mine) {
    const key = `${w.kind}:${w.subject}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (later.some((l) => l.kind === w.kind && l.subject === w.subject && l.createdAt.getTime() > w.createdAt.getTime())) continue;
    let subject: Record<string, unknown> = {};
    try {
      subject = JSON.parse(w.subject) as Record<string, unknown>;
    } catch {
      subject = {};
    }
    out.push({ hash: `0x${w.hash.toString("hex")}`, kind: w.kind as WriteKind, subject, status: w.status as "dropped" | "reverted", at: w.createdAt });
  }
  return out;
}

export type AgainRow = {
  hash: Hex;
  kind: "close" | "net" | "create" | "arbitrate";
  href: string;
  /** What it was: "Settling with Gabe", "Cancelling out with Gabe", the question. */
  subject: string;
  groupId: string;
  at: Date;
  /** The question, when it is one, for its stamp. */
  dare: { id: string; title: string; ink: string | null; markKind: string | null; markValue: string | null; locked: boolean } | null;
};

/**
 * The person's failed sends, sorted for Now: which proposals to say it on (the yep row already exists), which
 * questions' lock rows, and the rows of their own. A thing that is no longer open (the proposal answered, the
 * obligation closed, the question locked or decided) is left out: there is nothing to do again.
 */
export async function againRowsFor(userId: string, now: Date): Promise<{ confirms: Set<string>; locks: Set<string>; /** Obligations whose close never landed, and how it was tried. */ closes: Map<string, "settled" | "forgiven">; rows: AgainRow[] }> {
  const items = await againFor(userId, now);
  const confirms = new Set<string>();
  const locks = new Set<string>();
  const closes = new Map<string, "settled" | "forgiven">();
  const rows: AgainRow[] = [];
  if (items.length === 0) return { confirms, locks, closes, rows };

  const proposalIds = items.filter((i) => i.kind === "confirm").flatMap((i) => (Array.isArray(i.subject.proposalIds) ? i.subject.proposalIds.filter((x): x is string => typeof x === "string") : []));
  const obligationIds = items.filter((i) => i.kind === "close").map((i) => str(i.subject.obligationId)).filter((x): x is string => x !== null);
  const dareIds = items.filter((i) => i.kind === "create" || i.kind === "arbitrate").map((i) => str(i.subject.dareId)).filter((x): x is string => x !== null);
  const otherIds = items.filter((i) => i.kind === "net").map((i) => (str(i.subject.a) === userId ? str(i.subject.b) : str(i.subject.a))).filter((x): x is string => x !== null);

  const [proposals, obligations, dares] = await Promise.all([
    proposalIds.length ? db.select({ id: schema.obligationProposals.id, status: schema.obligationProposals.status }).from(schema.obligationProposals).where(inArray(schema.obligationProposals.id, proposalIds)) : Promise.resolve([]),
    obligationIds.length ? db.select({ id: schema.obligations.id, fromUser: schema.obligations.fromUser, toUser: schema.obligations.toUser, groupId: schema.obligations.groupId, closedAt: schema.obligations.closedAt }).from(schema.obligations).where(inArray(schema.obligations.id, obligationIds)) : Promise.resolve([]),
    dareIds.length ? db.select({ id: schema.dares.id, title: schema.dares.title, groupId: schema.dares.groupId, ink: schema.dares.ink, markKind: schema.dares.markKind, markValue: schema.dares.markValue, lockedAt: schema.dares.lockedAt, resolvedAt: schema.dares.resolvedAt }).from(schema.dares).where(inArray(schema.dares.id, dareIds)) : Promise.resolve([]),
  ]);
  const people = Array.from(new Set([...obligations.map((o) => (o.toUser === userId ? o.fromUser : o.toUser)), ...otherIds]));
  const users = people.length ? await db.select({ id: schema.users.id, displayName: schema.users.displayName }).from(schema.users).where(inArray(schema.users.id, people)) : [];
  const nameOf = (id: string) => users.find((u) => u.id === id)?.displayName ?? null;

  for (const i of items) {
    if (i.kind === "confirm") {
      for (const p of proposals) if (proposalIds.includes(p.id) && p.status === "pending" && (i.subject.proposalIds as string[]).includes(p.id)) confirms.add(p.id);
    } else if (i.kind === "close") {
      const o = obligations.find((x) => x.id === str(i.subject.obligationId));
      if (!o || o.closedAt) continue;
      const other = o.toUser === userId ? o.fromUser : o.toUser;
      const name = nameOf(other);
      if (!name) continue;
      closes.set(o.id, i.subject.reason === "forgiven" ? "forgiven" : "settled");
      rows.push({ hash: i.hash, kind: "close", href: `/p/${other}`, subject: `${i.subject.reason === "forgiven" ? "Calling it even" : "Settling"} with ${name}`, groupId: o.groupId, at: i.at, dare: null });
    } else if (i.kind === "net") {
      const other = str(i.subject.a) === userId ? str(i.subject.b) : str(i.subject.a);
      const groupId = str(i.subject.groupId);
      const name = other ? nameOf(other) : null;
      if (!other || !name || !groupId) continue;
      rows.push({ hash: i.hash, kind: "net", href: `/p/${other}`, subject: `Cancelling out with ${name}`, groupId, at: i.at, dare: null });
    } else {
      const d = dares.find((x) => x.id === str(i.subject.dareId));
      if (!d || d.resolvedAt || (i.kind === "create" && d.lockedAt)) continue;
      if (i.kind === "create") locks.add(d.id);
      rows.push({ hash: i.hash, kind: i.kind as "create" | "arbitrate", href: `/m/${d.id}`, subject: d.title, groupId: d.groupId, at: i.at, dare: { id: d.id, title: d.title, ink: d.ink, markKind: d.markKind, markValue: d.markValue, locked: d.lockedAt !== null } });
    }
  }
  return { confirms, locks, closes, rows };
}

/** The words beside the didn't-go-through mark (docs/design.md 3.23, 5.2), on the thing's own screen and on Now. */
export const AGAIN_LINE = "Didn’t go through";

export type OnWayRow = { hash: Hex; kind: "confirm" | "close" | "net"; href: string; /** "Priya's got you", "Settling with Gabe", "Cancelling out with Gabe". */ subject: string; owner: { id: string; displayName: string }; at: Date };
export type OnWay = {
  /** Proposals whose yep is on its way: off Needs you, in Just happened marked on its way. */
  confirms: Set<string>;
  /** Questions whose lock (the asker's) is on its way: off Needs you, running with the mark. */
  locks: Set<string>;
  /** Questions whose resolution or ruling is on its way: running with the mark. */
  resolves: Set<string>;
  /** Obligations whose close is on its way, and how it was closed. */
  closes: Map<string, "settled" | "forgiven">;
  /** Pairs whose cancelling out is on its way: `other:groupId`. */
  nets: Set<string>;
  rows: OnWayRow[];
};

/**
 * What this person was told was on its way and is still going through (docs/design.md 3.23, 5.2): a told send
 * that is pending, or mined and not yet mirrored. The screen moved on when they tapped; the thing shows where it
 * lives with the on-its-way mark until the tick finishes it, and never a clock. The same shape as `againRowsFor`,
 * for the same screens.
 */
export async function onWayFor(userId: string, now: Date): Promise<OnWay> {
  const W = schema.chainWrites;
  const since = new Date(now.getTime() - AGAIN_WINDOW_MS);
  const rows = await db
    .select({ hash: W.hash, kind: W.kind, subject: W.subject, status: W.status, completedAt: W.completedAt, createdAt: W.createdAt })
    .from(W)
    .where(and(eq(W.actorId, userId), isNotNull(W.toldAt), inArray(W.status, ["pending", "mined"]), gt(W.createdAt, since)))
    .orderBy(desc(W.createdAt));
  const out: OnWay = { confirms: new Set(), locks: new Set(), resolves: new Set(), closes: new Map(), nets: new Set(), rows: [] };
  const live = rows.filter((w) => w.status === "pending" || w.completedAt === null);
  if (live.length === 0) return out;
  const parsed = live.map((w) => {
    let subject: Record<string, unknown> = {};
    try {
      subject = JSON.parse(w.subject) as Record<string, unknown>;
    } catch {
      subject = {};
    }
    return { hash: `0x${w.hash.toString("hex")}` as Hex, kind: w.kind as WriteKind, subject, at: w.createdAt };
  });
  const proposalIds = parsed.filter((i) => i.kind === "confirm").flatMap((i) => (Array.isArray(i.subject.proposalIds) ? i.subject.proposalIds.filter((x): x is string => typeof x === "string") : []));
  const obligationIds = parsed.filter((i) => i.kind === "close").map((i) => str(i.subject.obligationId)).filter((x): x is string => x !== null);
  const dareIds = parsed.filter((i) => i.kind === "create" || i.kind === "resolve" || i.kind === "arbitrate").map((i) => str(i.subject.dareId)).filter((x): x is string => x !== null);
  const [proposals, obligations, dares] = await Promise.all([
    proposalIds.length ? db.select({ id: schema.obligationProposals.id, status: schema.obligationProposals.status, toUser: schema.obligationProposals.toUser, memo: schema.obligationProposals.memo }).from(schema.obligationProposals).where(inArray(schema.obligationProposals.id, proposalIds)) : Promise.resolve([]),
    obligationIds.length ? db.select({ id: schema.obligations.id, fromUser: schema.obligations.fromUser, toUser: schema.obligations.toUser, closedAt: schema.obligations.closedAt }).from(schema.obligations).where(inArray(schema.obligations.id, obligationIds)) : Promise.resolve([]),
    dareIds.length ? db.select({ id: schema.dares.id, lockedAt: schema.dares.lockedAt, resolvedAt: schema.dares.resolvedAt }).from(schema.dares).where(inArray(schema.dares.id, dareIds)) : Promise.resolve([]),
  ]);
  const people = Array.from(new Set([...proposals.map((p) => p.toUser), ...obligations.map((o) => (o.toUser === userId ? o.fromUser : o.toUser)), ...parsed.filter((i) => i.kind === "net").map((i) => (str(i.subject.a) === userId ? str(i.subject.b) : str(i.subject.a)))].filter((x): x is string => x !== null && x !== undefined)));
  const users = people.length ? await db.select({ id: schema.users.id, displayName: schema.users.displayName }).from(schema.users).where(inArray(schema.users.id, people)) : [];
  const nameOf = (id: string) => users.find((u) => u.id === id)?.displayName ?? null;
  const seen = new Set<string>();
  for (const i of parsed) {
    if (i.kind === "confirm") {
      for (const p of proposals) {
        if (!(i.subject.proposalIds as string[]).includes(p.id) || p.status !== "pending" || !p.toUser || out.confirms.has(p.id)) continue;
        out.confirms.add(p.id);
        const name = nameOf(p.toUser);
        if (name) out.rows.push({ hash: i.hash, kind: "confirm", href: `/p/${p.toUser}`, subject: p.memo ?? `${name.trim().split(/\s+/)[0] ?? name}’s got you`, owner: { id: p.toUser, displayName: name }, at: i.at });
      }
    } else if (i.kind === "close") {
      const o = obligations.find((x) => x.id === str(i.subject.obligationId));
      if (!o || o.closedAt || out.closes.has(o.id)) continue;
      out.closes.set(o.id, i.subject.reason === "forgiven" ? "forgiven" : "settled");
      const other = o.toUser === userId ? o.fromUser : o.toUser;
      const name = nameOf(other);
      if (name) out.rows.push({ hash: i.hash, kind: "close", href: `/p/${other}`, subject: `${i.subject.reason === "forgiven" ? "Calling it even" : "Settling"} with ${name}`, owner: { id: other, displayName: name }, at: i.at });
    } else if (i.kind === "net") {
      const other = str(i.subject.a) === userId ? str(i.subject.b) : str(i.subject.a);
      const groupId = str(i.subject.groupId);
      const name = other ? nameOf(other) : null;
      if (!other || !name || !groupId || seen.has(`${other}:${groupId}`)) continue;
      seen.add(`${other}:${groupId}`);
      out.nets.add(`${other}:${groupId}`);
      out.rows.push({ hash: i.hash, kind: "net", href: `/p/${other}`, subject: `Cancelling out with ${name}`, owner: { id: other, displayName: name }, at: i.at });
    } else if (i.kind === "create") {
      const d = dares.find((x) => x.id === str(i.subject.dareId));
      if (d && !d.lockedAt) out.locks.add(d.id);
    } else if (i.kind === "resolve" || i.kind === "arbitrate") {
      const d = dares.find((x) => x.id === str(i.subject.dareId));
      if (d && d.lockedAt && !d.resolvedAt) out.resolves.add(d.id);
    }
  }
  return out;
}
