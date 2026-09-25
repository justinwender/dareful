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
 * The display is not designed (docs/design.md section 7 lists the You tab as undrawn); this is the data only.
 */
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { bucketOf } from "./weight";
import { BPS } from "./scoring";
import { VOID_OUTCOME } from "./markets";

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
export type NumericRecord = { resolved: number; meanMissBps: number | null };
export type CalibrationRecord = { binary: BinaryRecord; numeric: NumericRecord };

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

/** Pure: the average miss, as a fraction of the scale in basis points, from a list of scored number positions. */
export function numericMiss(scores: readonly number[]): NumericRecord {
  if (scores.length === 0) return { resolved: 0, meanMissBps: null };
  const total = scores.reduce((a, s) => a + (Number(BPS) - s), 0);
  return { resolved: scores.length, meanMissBps: Math.round(total / scores.length) };
}

/** This person's record: every scored position on a question that ended with an answer (a void scores nobody). */
export async function calibrationFor(userId: string): Promise<CalibrationRecord> {
  const rows = await db
    .select({ kind: schema.dares.kind, value: schema.darePositions.value, score: schema.darePositions.score, outcome: schema.dares.resolvedOutcome })
    .from(schema.darePositions)
    .innerJoin(schema.dares, eq(schema.dares.id, schema.darePositions.dareId))
    .where(and(eq(schema.darePositions.userId, userId), isNotNull(schema.darePositions.score), isNotNull(schema.dares.resolvedAt), inArray(schema.dares.resolvedBy, ["quorum", "arbitration"]), sql`${schema.dares.resolvedOutcome} <> ${VOID_OUTCOME}`));
  const binary = rows.filter((r) => r.kind === "binary" && r.score !== null && r.outcome !== null).map((r) => ({ valueBps: r.value, outcome: (r.outcome === 1n ? 1 : 0) as 0 | 1, score: r.score as number }));
  const numeric = rows.filter((r) => r.kind === "numeric" && r.score !== null).map((r) => r.score as number);
  return { binary: binaryBins(binary), numeric: numericMiss(numeric) };
}
