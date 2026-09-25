/**
 * A number market's scoring scale (PLANNING.md 8c; docs/design.md 3.26; docs/decisions.md 2026-09-24). Numeric
 * scoring divides by `range`, so the scale is a scoring rule that happens to look like a display detail. It is
 * fixed when the question is asked, set by the asker or, when they leave it blank, by the model from the question
 * alone, stored in `range`, never derived from entries, and shown to entrants only when the asker chose it.
 *
 * The model's scale is the weak point: too narrow and reasonable answers floor at zero; too wide and everyone
 * scores near one, transfers shrink, and small stakes truncate to nothing. So a proposal is checked before it is
 * used, against the model's own point estimate of the answer, and a proposal that fails is not used at all: the
 * asker is asked to set the scale themselves, which is the primary path anyway.
 */
import { MAX_NUMBER } from "./scoring";

export type ScaleProposal = { low: number; high: number; typical: number };

/** The scale may be no narrower than a quarter of the typical answer and no wider than four times it. */
export const SCALE_MIN_OVER_TYPICAL = { num: 1n, den: 4n };
export const SCALE_MAX_OVER_TYPICAL = 4n;

export type ScaleCheck = { ok: true; range: bigint } | { ok: false; why: "shape" | "order" | "narrow" | "wide" };

/**
 * The sanity check. `low` and `high` are where the model says nearly every reasonable answer would land, and
 * `typical` its single best guess; the scale is `high - low`. It has to be a whole number of at least one, the
 * three have to be in order, and the span has to sit between a quarter of the typical answer and four times it
 * (with a typical answer under one read as one). Outside that band the model has misread the question's size.
 */
export function checkScale(p: ScaleProposal): ScaleCheck {
  const whole = (n: number) => Number.isInteger(n) && n >= 0 && n <= Number(MAX_NUMBER);
  if (!whole(p.low) || !whole(p.high) || !whole(p.typical)) return { ok: false, why: "shape" };
  if (!(p.low <= p.typical && p.typical <= p.high) || p.high <= p.low) return { ok: false, why: "order" };
  const range = BigInt(p.high) - BigInt(p.low);
  const typical = p.typical < 1 ? 1n : BigInt(p.typical);
  // range >= typical / 4, in integers: 4 x range >= typical.
  if (range * SCALE_MIN_OVER_TYPICAL.den < typical * SCALE_MIN_OVER_TYPICAL.num) return { ok: false, why: "narrow" };
  if (range > typical * SCALE_MAX_OVER_TYPICAL) return { ok: false, why: "wide" };
  return { ok: true, range };
}

/** What the asker types: a whole number of at least one, at most nine digits. */
export function parseAskerScale(raw: string): bigint | null {
  const t = raw.replace(/[,\s]/g, "");
  if (!/^\d{1,9}$/.test(t)) return null;
  const n = BigInt(t);
  return n >= 1n ? n : null;
}

/**
 * The check that runs when a number market settles, so a scale that turned out wrong is visible afterward: how
 * many entries floored at zero (the scale was narrow, or the answer surprised everyone) and whether every score
 * sat within the top five percent (the scale was wide enough that being off did not matter).
 */
export function scaleAfterward(scores: readonly bigint[]): { floored: number; of: number; allNear: boolean } {
  const floored = scores.filter((s) => s === 0n).length;
  return { floored, of: scores.length, allNear: scores.length > 0 && scores.every((s) => s >= 9500n) };
}

/** `n` to one significant figure, half up: 1,400 is 1,000, 3,700 is 4,000, 250 is 300. */
export function oneSignificant(n: bigint): bigint {
  if (n < 10n) return n;
  const digits = n.toString().length;
  const unit = 10n ** BigInt(digits - 1);
  return ((n + unit / 2n) / unit) * unit;
}

/** How many times the reference a number has to be before the check asks: 1,000 for a most likely answer of 10. */
export const FAR_OFF_TIMES = 100n;
/** With no most likely answer and a scale the asker set (which is shown), the reference is half the scale. */
export const FAR_OFF_TIMES_SCALE = 50n;

/**
 * The far-off check (Phase 5): a number this far beyond anything likely gets a check the person can confirm past,
 * never a block, because entries are deliberately unclamped (a far-off entry floors at zero and cannot move
 * anyone else's score, since the scale is fixed). The threshold is a hundred times the model's most likely
 * answer, rounded to one significant figure, so it catches a slipped finger (1,000 for 10) and not a bold guess,
 * and it never sits at the scale's edge: a scale the model set is shown nowhere, and a check that fired at its
 * edge could be probed for it by trying numbers. When the asker set the scale it is already shown, and with no
 * most likely answer the threshold is fifty times that scale. Nothing to measure against, no check.
 */
export function farOffThreshold(d: { typical: bigint | null; range: bigint | null; rangeSource: string | null }): bigint | null {
  if (d.typical !== null) return oneSignificant(FAR_OFF_TIMES * (d.typical < 1n ? 1n : d.typical));
  if (d.rangeSource === "asker" && d.range !== null && d.range > 0n) return oneSignificant(FAR_OFF_TIMES_SCALE * d.range);
  return null;
}
