/**
 * Calibration and the clean-resolution rate (PLANNING.md 8e). Nothing new is computed: every resolved market
 * scored every position, and the score is the number each person was paid on. Calibration is the running record
 * of those scores. For yes-or-no questions it is how often a person's calls at a given confidence came true; for
 * number questions it is their average distance from the answer as a fraction of the scale, which is exactly the
 * score's complement.
 *
 * Thin data is handled honestly: a curve through three points reads as broken, so the curve exists only past
 * `MIN_CALIBRATION` resolved yes-or-no questions, and before that the record says "not enough yet". The
 * clean-resolution rate is meaningful from the first question and has no floor (`cleanResolution`, settle.ts).
 *
 * The display is You (docs/design.md 3.34, built 2026-09-27): the reliability plot with its Wilson whiskers and a
 * headline in counts, the numbers line with the middle half as a band, and the calls themselves under the floor.
 */
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { bucketOf } from "./weight";
import { BPS } from "./scoring";
import { VOID_OUTCOME } from "./markets";
import { markRefOf, type MarkRef } from "@/lib/ui/mark";
import { inkOf, type InkName } from "@/lib/ui/ink";

/**
 * Ten resolved yes-or-no questions. Below ten, one result moves the overall hit rate by ten points or more, which
 * is the whole width of a confidence band, so the curve would be redrawn by every single question.
 */
export const MIN_CALIBRATION = 10;

export type CalibrationBin = {
  /** The tenth of the range, 1 to 10, as on the weight line. */
  bucket: number;
  count: number;
  /** How many of these came true. */
  hits: number;
  /** The mean stated probability in the bin, in basis points. */
  meanBps: number;
};

export type BinaryRecord = { resolved: number; enough: boolean; bins: CalibrationBin[]; meanScore: number | null };
/**
 * The middle half of the misses (3.34: "the band is the middle half of them"), as the two hinges in basis points:
 * the medians of the lower and upper halves, the median itself left out of both when the count is odd. Null under
 * two misses, since a half of one is nothing.
 */
export type NumericRecord = { resolved: number; meanMissBps: number | null; band: [number, number] | null };
/** One resolved yes-or-no call, for the rows under the floor (3.34, `YouEarly`): what was said, what happened, and the question. */
export type Call = { dareId: string; title: string; mark: MarkRef | null; ink: InkName; valueBps: number; happened: boolean; resolvedAt: Date };
/**
 * Pick-one markets are counted and never plotted (docs/design.md 3.34): a single choice says nothing about how
 * sure someone was, so it has no place on a confidence axis. "You called 5 of the 9 you were in."
 */
export type PickOneRecord = { resolved: number; called: number };
export type CalibrationRecord = { binary: BinaryRecord; numeric: NumericRecord; pickOne: PickOneRecord; /** The yes-or-no calls themselves, most recent first, for the rows under the floor. */ calls: Call[]; /** When the earliest of every counted call resolved, for "since March". */ firstAt: Date | null };

/** Pure: the bins from a list of resolved yes-or-no positions. Exported so the rule has tests. */
export function binaryBins(rows: Array<{ valueBps: bigint; outcome: 0 | 1; score: number }>): BinaryRecord {
  const by = new Map<number, { count: number; hits: number; sum: bigint }>();
  for (const r of rows) {
    const b = bucketOf(r.valueBps);
    const cur = by.get(b) ?? { count: 0, hits: 0, sum: 0n };
    cur.count += 1;
    cur.hits += r.outcome === 1 ? 1 : 0;
    cur.sum += r.valueBps;
    by.set(b, cur);
  }
  const bins = Array.from(by, ([bucket, v]) => ({ bucket, count: v.count, hits: v.hits, meanBps: Number(v.sum / BigInt(v.count)) })).sort((a, b) => a.bucket - b.bucket);
  const meanScore = rows.length ? Math.round(rows.reduce((a, r) => a + r.score, 0) / rows.length) : null;
  return { resolved: rows.length, enough: rows.length >= MIN_CALIBRATION, bins, meanScore };
}

/** Pure: the average miss, as a fraction of the scale in basis points, from a list of scored number positions, with the middle half of the misses as the band. */
export function numericMiss(scores: readonly number[]): NumericRecord {
  if (scores.length === 0) return { resolved: 0, meanMissBps: null, band: null };
  const misses = scores.map((s) => Number(BPS) - s);
  const total = misses.reduce((a, m) => a + m, 0);
  return { resolved: scores.length, meanMissBps: Math.round(total / scores.length), band: middleHalf(misses) };
}

/** Pure: the two hinges of a list, the medians of its lower and upper halves (the middle value left out of both when odd). Null under two values. */
export function middleHalf(values: readonly number[]): [number, number] | null {
  if (values.length < 2) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  const lower = sorted.slice(0, half);
  const upper = sorted.slice(sorted.length - half);
  const median = (xs: number[]) => (xs.length % 2 === 1 ? (xs[(xs.length - 1) / 2] as number) : Math.round(((xs[xs.length / 2 - 1] as number) + (xs[xs.length / 2] as number)) / 2));
  return [median(lower), median(upper)];
}

/** z for a two-sided 80% interval. */
const Z80 = 1.2815515655446004;

/**
 * Pure: the 80% Wilson score interval for `hits` of `n`, as fractions (3.34: the whisker behind each dot). Wilson
 * rather than the normal approximation because a bin with two calls is the usual case here, and the normal
 * interval on two calls runs past 0 and 1.
 */
export function wilson80(hits: number, n: number): [number, number] {
  if (n <= 0) return [0, 1];
  const p = hits / n;
  const z2 = Z80 * Z80;
  const denominator = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denominator;
  const half = (Z80 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/** Pure: the bin the headline names (3.34), the one with the most calls; between equals, the one said more often at higher confidence, since that is where a claim is boldest. */
export function headlineBin(bins: readonly CalibrationBin[]): CalibrationBin | null {
  let best: CalibrationBin | null = null;
  for (const b of bins) if (!best || b.count > best.count || (b.count === best.count && b.bucket > best.bucket)) best = b;
  return best;
}

/** Pure: how many pick-one questions this person was in that ended with an answer, and how many they called (a full score is the pick that happened). */
export function pickOneCalls(scores: readonly number[]): PickOneRecord {
  return { resolved: scores.length, called: scores.filter((s) => s === Number(BPS)).length };
}

/** This person's record: every scored position on a question that ended with an answer (a void scores nobody). */
export async function calibrationFor(userId: string): Promise<CalibrationRecord> {
  const rows = await db
    .select({ id: schema.dares.id, kind: schema.dares.kind, title: schema.dares.title, markKind: schema.dares.markKind, markValue: schema.dares.markValue, ink: schema.dares.ink, resolvedAt: schema.dares.resolvedAt, value: schema.darePositions.value, score: schema.darePositions.score, outcome: schema.dares.resolvedOutcome })
    .from(schema.darePositions)
    .innerJoin(schema.dares, eq(schema.dares.id, schema.darePositions.dareId))
    // The final score settling a game's question scores it like any quorum (3.35); a void, an expiry and a removal score nobody and are already out by the score being null.
    .where(and(eq(schema.darePositions.userId, userId), isNotNull(schema.darePositions.score), isNotNull(schema.dares.resolvedAt), inArray(schema.dares.resolvedBy, ["quorum", "arbitration", "feed", "ruling"]), sql`${schema.dares.resolvedOutcome} <> ${VOID_OUTCOME}`))
    .orderBy(desc(schema.dares.resolvedAt));
  const binaryRows = rows.filter((r) => r.kind === "binary" && r.score !== null && r.outcome !== null);
  const binary = binaryRows.map((r) => ({ valueBps: r.value, outcome: (r.outcome === 1n ? 1 : 0) as 0 | 1, score: r.score as number }));
  const calls: Call[] = binaryRows.map((r) => ({ dareId: r.id, title: r.title, mark: markRefOf(r), ink: inkOf(r), valueBps: Number(r.value), happened: r.outcome === 1n, resolvedAt: r.resolvedAt as Date }));
  const numeric = rows.filter((r) => r.kind === "numeric" && r.score !== null).map((r) => r.score as number);
  // A pick says nothing about how sure (3.34): pick-one questions are counted here and never join the bins above.
  const pickOne = rows.filter((r) => r.kind === "categorical" && r.score !== null).map((r) => r.score as number);
  const firstAt = rows.length ? (rows[rows.length - 1]?.resolvedAt as Date) : null;
  return { binary: binaryBins(binary), numeric: numericMiss(numeric), pickOne: pickOneCalls(pickOne), calls, firstAt };
}
