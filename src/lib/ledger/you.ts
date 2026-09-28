/**
 * You (docs/design.md 3.34, built 2026-09-27): the words and the figures for the one screen about this person
 * alone. Nothing new is collected: the calls are the scored positions (`calibrationFor`), the questions asked are
 * the clean-resolution rows (`cleanResolution`'s rows, with their titles), and the header counts the markets this
 * person is in. Only this person's own record, with no score, grade or rank, and no comparison with anyone.
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { calibrationFor, headlineBin, wilson80, type CalibrationBin, type CalibrationRecord } from "./calibration";
import { VOID_OUTCOME } from "./markets";
import { daysBetween } from "@/lib/ui/copy";
import { markRefOf, type MarkRef } from "@/lib/ui/mark";
import type { InkName } from "@/lib/ui/ink";
import { type DenominationRow } from "./denominations";

/** Ten resolved yes-or-no calls before the plot draws (3.34); `MIN_CALIBRATION` says the same. */
export const NUMBERS_FLOOR = 5;

export type AskedQuestion = { dareId: string; title: string; clean: boolean; endedAt: Date };
export type AskedRecord = {
  /** The questions that ended by a quorum, by the tiebreaker or by the final score with an answer or a void, oldest first. Expiry, a removal and the final score's own void are not here (3.34). */
  counted: AskedQuestion[];
  /** How many of those ended cleanly. */
  clean: number;
  /** How many expired, which counts against nobody and is named in the caption. */
  expired: number;
};

export type YouData = {
  /** How many markets this person is in, any state but a draft or a removal. */
  markets: number;
  /** When the earliest of those was entered, for "since March". */
  firstEnteredAt: Date | null;
  joinedAt: Date;
  calibration: CalibrationRecord;
  asked: AskedRecord;
  /** The units this person has used, most recently used first: on covers and on questions. */
  units: DenominationRow[];
  /** The marks this person has put on questions, most recent first, once each. */
  marks: MarkRef[];
};

/** The questions this person asked that have ended, sorted as 3.34 counts them. */
export async function askedRecord(creatorId: string): Promise<AskedRecord> {
  const rows = await db
    .select({ id: schema.dares.id, title: schema.dares.title, outcome: schema.dares.resolvedOutcome, by: schema.dares.resolvedBy, resolvedAt: schema.dares.resolvedAt })
    .from(schema.dares)
    .where(and(eq(schema.dares.creatorId, creatorId), isNotNull(schema.dares.resolvedAt), inArray(schema.dares.resolvedBy, ["quorum", "arbitration", "feed", "expired"])))
    .orderBy(asc(schema.dares.resolvedAt));
  // The final score failing to settle one (a tie the contract cannot score, or two scoreboards disagreeing) counts against nobody (3.35, 3.40), like expiry.
  const counted = rows.filter((r) => r.by !== "expired" && !(r.by === "feed" && r.outcome === VOID_OUTCOME)).map((r) => ({ dareId: r.id, title: r.title, clean: r.outcome !== VOID_OUTCOME, endedAt: r.resolvedAt as Date }));
  return { counted, clean: counted.filter((q) => q.clean).length, expired: rows.filter((r) => r.by === "expired").length };
}

export async function youFor(user: { id: string; createdAt: Date }): Promise<YouData> {
  const [calibration, asked, positions, askedRows, coverDenoms] = await Promise.all([
    calibrationFor(user.id),
    askedRecord(user.id),
    db
      .select({ dareId: schema.darePositions.dareId, enteredAt: schema.darePositions.enteredAt, denomId: schema.dares.denomId, lastUsed: schema.darePositions.enteredAt })
      .from(schema.darePositions)
      .innerJoin(schema.dares, eq(schema.dares.id, schema.darePositions.dareId))
      .where(and(eq(schema.darePositions.userId, user.id), isNull(schema.darePositions.dismissedAt), isNotNull(schema.dares.creatorSignature), sql`${schema.dares.resolvedBy} is distinct from 'removed'`))
      .orderBy(asc(schema.darePositions.enteredAt)),
    db.select({ markKind: schema.dares.markKind, markValue: schema.dares.markValue, createdAt: schema.dares.createdAt }).from(schema.dares).where(and(eq(schema.dares.creatorId, user.id), isNotNull(schema.dares.markValue))).orderBy(desc(schema.dares.createdAt)).limit(60),
    db
      .select({ denomId: schema.obligations.denomId, at: schema.obligations.createdAt })
      .from(schema.obligations)
      .where(or(eq(schema.obligations.fromUser, user.id), eq(schema.obligations.toUser, user.id)))
      .orderBy(desc(schema.obligations.createdAt))
      .limit(60),
  ]);
  // Units, most recently used first, once each: the covers this person is on and the questions they are in.
  const lastUse = new Map<string, number>();
  for (const p of positions) lastUse.set(p.denomId, Math.max(lastUse.get(p.denomId) ?? 0, p.enteredAt.getTime()));
  for (const o of coverDenoms) lastUse.set(o.denomId, Math.max(lastUse.get(o.denomId) ?? 0, o.at.getTime()));
  const denomIds = Array.from(lastUse.keys());
  const denomRows = denomIds.length ? await db.select().from(schema.denominations).where(inArray(schema.denominations.id, denomIds)) : [];
  // One row per label: the same unit made in two sets is one unit to this person.
  const byLabel = new Map<string, DenominationRow>();
  for (const d of denomRows.sort((a, b) => (lastUse.get(b.id) ?? 0) - (lastUse.get(a.id) ?? 0))) if (!byLabel.has(d.label.toLowerCase())) byLabel.set(d.label.toLowerCase(), d);
  const marks: MarkRef[] = [];
  const seenMarks = new Set<string>();
  for (const r of askedRows) {
    const m = markRefOf(r);
    const key = m ? `${m.kind}:${m.kind === "emoji" ? m.value : m.id}` : null;
    if (m && key && !seenMarks.has(key)) {
      seenMarks.add(key);
      marks.push(m);
    }
  }
  return { markets: positions.length, firstEnteredAt: positions[0]?.enteredAt ?? null, joinedAt: user.createdAt, calibration, asked, units: Array.from(byLabel.values()), marks };
}

// ------------------------------------------------------------------------------------------------- the words

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * "since March", "since last week", "since Tuesday", "since today": when something began, as a person says it.
 * Within the week the weekday; a week to a fortnight ago "last week"; this year the month; earlier the month and
 * the year. Pure, in the viewer's zone.
 */
export function sinceLabel(at: Date, now: Date, zone: string): string {
  const days = daysBetween(at, now, zone);
  if (days <= 0) return "since today";
  if (days === 1) return "since yesterday";
  if (days < 7) return `since ${at.toLocaleDateString("en-US", { timeZone: zone, weekday: "long" })}`;
  if (days < 14) return "since last week";
  const year = (d: Date) => Number(new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric" }).format(d));
  const month = Number(new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "numeric" }).format(at)) - 1;
  return year(at) === year(now) ? `since ${MONTHS[month]}` : `since ${MONTHS[month]} ${year(at)}`;
}

/** The header's one caption (3.34): "In 43 markets since March", or "Joined today" with none yet. */
export function headerCaption(input: { markets: number; firstEnteredAt: Date | null; joinedAt: Date }, now: Date, zone: string): string {
  if (input.markets === 0 || !input.firstEnteredAt) {
    const days = daysBetween(input.joinedAt, now, zone);
    return days <= 0 ? "Joined today" : days === 1 ? "Joined yesterday" : `Joined ${input.joinedAt.toLocaleDateString("en-US", { timeZone: zone, month: "short", day: "numeric" })}`;
  }
  return `In ${input.markets === 1 ? "one market" : `${input.markets} markets`} ${sinceLabel(input.firstEnteredAt, now, zone)}`;
}

/** "about 70%": the bin's mean said, to the nearest ten, which is the grid the plot and the weight line share. */
export function aboutPercent(meanBps: number): string {
  return `about ${Math.max(0, Math.min(100, Math.round(meanBps / 1000) * 10))}%`;
}

/**
 * The headline in counts (3.34): "When you say about 70%, it happened 7 of the 10 times." A count says how much
 * the claim rests on, which a second percentage would hide. Null with no bin.
 */
export function callsHeadline(bins: readonly CalibrationBin[]): string | null {
  const b = headlineBin(bins);
  if (!b) return null;
  const times = b.count === 1 ? (b.hits === 1 ? "it happened, the one time" : "it didn’t happen, the one time") : b.hits === 0 ? `it happened none of the ${b.count} times` : b.hits === b.count ? `it happened all ${b.count} times` : `it happened ${b.hits} of the ${b.count} times`;
  return `When you say ${aboutPercent(b.meanBps)}, ${times}.`;
}

/** The count under the frame while the picture waits (3.34, `YouEarly`): a fact, never a progress bar. */
export function earlyTitle(resolved: number, floor: number): string {
  return `Your picture draws at ${floor} resolved calls. ${resolved === 0 ? "None" : resolved} so far.`;
}

/** "40 yes-or-no calls since March." */
export function callsCaption(resolved: number, firstAt: Date | null, now: Date, zone: string): string {
  return `${resolved === 1 ? "One yes-or-no call" : `${resolved} yes-or-no calls`}${firstAt ? ` ${sinceLabel(firstAt, now, zone)}` : ""}.`;
}

/** "Pick one: you called 5 of the 9 you were in." Null with none. */
export function pickOneCaption(record: { resolved: number; called: number }): string | null {
  if (record.resolved === 0) return null;
  if (record.resolved === 1) return `Pick one: you ${record.called === 1 ? "called" : "didn’t call"} the one you were in.`;
  return `Pick one: you called ${record.called} of the ${record.resolved} you were in.`;
}

/** One call's row (3.34): "You said 70% · it happened". */
export function callLine(valueBps: number, happened: boolean): string {
  return `You said ${Math.round(valueBps / 100)}% · ${happened ? "it happened" : "it didn’t"}`;
}

/** "On numbers, you land 15% of the range away." */
export function numbersHeadline(meanMissBps: number): string {
  return `On numbers, you land ${Math.round(meanMissBps / 100)}% of the range away.`;
}

/** "7 number markets. The band is the middle half of them; the cream line is your average." */
export function numbersCaption(resolved: number): string {
  return `${resolved} number markets. The band is the middle half of them; the cream line is your average.`;
}

/** Under the floor: "Numbers draw at 5 number markets. 2 so far." */
export function numbersEarly(resolved: number, floor: number): string {
  return `Numbers draw at ${floor} number markets. ${resolved} so far.`;
}

/** "11 of the 12 questions you asked ended cleanly." With one: "The one question you asked ended cleanly." */
export function askedHeadline(counted: number, clean: number): string {
  if (counted === 1) return clean === 1 ? "The one question you asked ended cleanly." : "The one question you asked was voided.";
  return `${clean} of the ${counted} questions you asked ended cleanly.`;
}

/**
 * The caption names what went wrong, because a void is fixable next time by wording (3.34): "The group voided
 * “Does Maya make the 7:40?” Two others expired, which counts against nobody." With more than one void, the
 * most recent and "and 2 others". Null when nothing went wrong.
 */
export function askedCaption(counted: readonly AskedQuestion[], expired: number): string | null {
  const voids = counted.filter((q) => !q.clean);
  const parts: string[] = [];
  if (voids.length > 0) {
    const latest = voids[voids.length - 1] as AskedQuestion;
    const title = latest.title.replace(/[?.!]+$/, "");
    parts.push(`The group voided “${title}?”${voids.length > 1 ? ` and ${voids.length - 1 === 1 ? "one other" : `${voids.length - 1} others`}.` : ""}`);
  }
  if (expired > 0) parts.push(`${voids.length > 0 ? (expired === 1 ? "One other" : `${WORDS[expired] ?? expired} others`) : expired === 1 ? "One" : (WORDS[expired] ?? String(expired))} expired, which counts against nobody.`);
  return parts.length ? parts.join(" ") : null;
}
const WORDS: Record<number, string> = { 1: "One", 2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven", 8: "Eight", 9: "Nine" };

/** The plot's geometry (3.34): 318 by 236, a dot per bin at (mean said, share happened) with a whisker over the bin's 80% Wilson interval. Pure. */
export function plotDots(bins: readonly CalibrationBin[]): Array<{ bucket: number; x: number; y: number; r: number; low: number; high: number; count: number }> {
  return bins.map((b) => {
    const [low, high] = wilson80(b.hits, b.count);
    return { bucket: b.bucket, x: b.meanBps / 10000, y: b.hits / b.count, r: 3 + 1.6 * Math.sqrt(b.count), low, high, count: b.count };
  });
}

export type { InkName };
