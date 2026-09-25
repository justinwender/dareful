/**
 * The number market's picture, as arithmetic (docs/design.md 3.22 "Number markets", 3.5 "the ruler"). The axis
 * comes from what people entered and from nothing else: the scoring scale (3.26) never draws anything here, and
 * the display never tries to reflect the scoring. Integers throughout, so no float decides a column, a label or
 * where the marker sits; fractions are carried as thousandths.
 *
 *   - Ends: `lo` and `hi` are the lowest and highest on-axis entries, padded by one each side (never below 0)
 *     when they sit within two of each other, so one entry, or everyone on 14, still draws a room.
 *   - A narrow spread (hi - lo + 1 <= 10) gets a column per whole number; a wide one gets ten slices, with `lo`
 *     joining the first.
 *   - One far-off entry does not stretch the axis: with four or more, the highest is off-axis when its gap to the
 *     next is larger than the span of all the rest, checked at the high end first and then the low end over what
 *     remains, only while at least three would stay on the axis, so there is at most one per end.
 *   - The marker is the group's number: the stake-weighted median, the smallest value with at least half the stake
 *     at or below it. It is always one of the entries, so it never sits past an end; an off-axis entry that holds
 *     half the stake is the median, and the marker stands over its column.
 */

export type NumberEntry = { id: string; stake: bigint; value: bigint };

export type AxisColumn = {
  /** 1-based, left to right. */
  n: number;
  /** The whole number this column is, in per-value mode; null across slices. */
  value: bigint | null;
  /** The text under the column, where 3.22 gives it one; null otherwise. */
  label: string | null;
  stake: bigint;
  /** 0 to 1000, thousandths of the tallest column (off-axis columns included in the normalisation). */
  heightPermille: number;
  people: number;
  noStake: number;
};
export type OffAxis = { value: bigint; stake: bigint; heightPermille: number; people: number; noStake: number; label: string };
export type Marker = {
  /** Which row of columns the marker stands in: the axis, or an off-axis column whose entry is the median. */
  at: "axis" | "offLow" | "offHigh";
  /** Where across that row, 0 to 1000 (the middle of an off-axis column). */
  xPermille: number;
  /** The chip: the median, a whole number with separators. */
  chip: string;
};
export type NumberAxis = {
  lo: bigint;
  hi: bigint;
  mode: "values" | "slices";
  columns: AxisColumn[];
  offLow: OffAxis | null;
  offHigh: OffAxis | null;
  /** From the third entry, as on the weight line. */
  marker: Marker | null;
};

/** "1,240": thousands separators, never a decimal. */
export function withSeparators(n: bigint): string {
  const s = (n < 0n ? -n : n).toString();
  const out = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return n < 0n ? `-${out}` : out;
}

/** Sort ascending, as values, without touching the entries' own order. */
const sorted = (values: readonly bigint[]) => [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/**
 * Which values sit off the axis (3.22): at most one at the high end and one at the low end, decided over the
 * values alone. Returned as the values, so the caller can find whose they are; `keep` is what stays on the axis.
 */
export function splitOffAxis(values: readonly bigint[]): { keep: bigint[]; offHigh: bigint | null; offLow: bigint | null } {
  let keep = sorted(values);
  let offHigh: bigint | null = null;
  let offLow: bigint | null = null;
  if (keep.length >= 4) {
    const top = keep[keep.length - 1] as bigint;
    const next = keep[keep.length - 2] as bigint;
    const bottom = keep[0] as bigint;
    if (top - next > next - bottom) {
      offHigh = top;
      keep = keep.slice(0, -1);
    }
  }
  if (keep.length >= 4) {
    const bottom = keep[0] as bigint;
    const next = keep[1] as bigint;
    const top = keep[keep.length - 1] as bigint;
    if (next - bottom > top - next) {
      offLow = bottom;
      keep = keep.slice(1);
    }
  }
  return { keep, offHigh, offLow };
}

/** The ends of an axis over these values, with the padding rule; never below zero. */
export function axisEnds(values: readonly bigint[]): { lo: bigint; hi: bigint } {
  const s = sorted(values);
  let lo = s[0] ?? 0n;
  let hi = s[s.length - 1] ?? 0n;
  if (hi - lo < 2n) {
    lo = lo > 0n ? lo - 1n : 0n;
    hi = hi + 1n;
    if (hi - lo < 2n) hi = lo + 2n;
  }
  return { lo, hi };
}

/** Across ten slices, `bucket(v) = clamp(ceil((v - lo) / w), 1, 10)` with `w = (hi - lo) / 10`, in integers. */
export function sliceOf(v: bigint, lo: bigint, hi: bigint): number {
  const span = hi - lo;
  if (span <= 0n) return 1;
  const d = v - lo;
  if (d <= 0n) return 1;
  const b = Number((d * 10n + span - 1n) / span);
  return b < 1 ? 1 : b > 10 ? 10 : b;
}

const permille = (part: bigint, whole: bigint) => (whole === 0n ? 0 : Number((part * 1000n) / whole));

/**
 * The group's number on a number market: the stake-weighted median, the smallest value with at least half the
 * stake at or below it (PLANNING.md 8; docs/design.md 3.22 as amended 2026-09-25). Absolute-error scoring
 * rewards each person for reporting their median, so the group's summary is the same statistic, and one far-off
 * entry cannot move it unless it holds half the stake. When nothing at all is riding, everyone weighs the same.
 * Always one of the entries' values, which is what lets the marker stand on a column with no clamp.
 */
export function weightedMedian(entries: ReadonlyArray<{ stake: bigint; value: bigint; id?: string }>): bigint | null {
  if (entries.length === 0) return null;
  const anyStake = entries.some((e) => e.stake > 0n);
  const weighed = entries.map((e) => ({ value: e.value, stake: anyStake ? (e.stake > 0n ? e.stake : 0n) : 1n })).filter((e) => e.stake > 0n);
  const total = weighed.reduce((a, e) => a + e.stake, 0n);
  if (total === 0n) return null;
  const s = [...weighed].sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
  let cum = 0n;
  for (const e of s) {
    cum += e.stake;
    if (cum * 2n >= total) return e.value;
  }
  return (s[s.length - 1] as { value: bigint }).value;
}

export function numberAxis(entries: NumberEntry[], unit: { singular: string; plural: string }): NumberAxis | null {
  if (entries.length === 0) return null;
  const { keep, offHigh, offLow } = splitOffAxis(entries.map((e) => e.value));
  const { lo, hi } = axisEnds(keep);
  const mode: NumberAxis["mode"] = hi - lo + 1n <= 10n ? "values" : "slices";
  const n = mode === "values" ? Number(hi - lo + 1n) : 10;
  const columns: AxisColumn[] = Array.from({ length: n }, (_, i) => ({ n: i + 1, value: mode === "values" ? lo + BigInt(i) : null, label: null, stake: 0n, heightPermille: 0, people: 0, noStake: 0 }));
  const off = { high: offHigh === null ? null : { value: offHigh, stake: 0n, heightPermille: 0, people: 0, noStake: 0, label: `${withSeparators(offHigh)} →` }, low: offLow === null ? null : { value: offLow, stake: 0n, heightPermille: 0, people: 0, noStake: 0, label: `← ${withSeparators(offLow)}` } };
  // Each off-axis end takes one entry only: the one whose value it is, and the first of a tie.
  let highTaken = false;
  let lowTaken = false;
  for (const e of entries) {
    let target: { stake: bigint; heightPermille: number; people: number; noStake: number } | undefined;
    if (off.high && e.value === off.high.value && !highTaken) {
      target = off.high;
      highTaken = true;
    } else if (off.low && e.value === off.low.value && !lowTaken) {
      target = off.low;
      lowTaken = true;
    } else {
      const v = e.value < lo ? lo : e.value > hi ? hi : e.value;
      target = columns[mode === "values" ? Number(v - lo) : sliceOf(v, lo, hi) - 1];
    }
    if (!target) continue;
    target.people += 1;
    if (e.stake > 0n) target.stake += e.stake;
    else target.noStake += 1;
  }
  const all = [...columns, ...(off.high ? [off.high] : []), ...(off.low ? [off.low] : [])];
  const tallest = all.reduce((m, c) => (c.stake > m ? c.stake : m), 0n);
  for (const c of all) c.heightPermille = permille(c.stake, tallest);

  // Labels (3.22): every column when seven or fewer per-value columns, else the two ends and the middle; across
  // slices, lo at the left, the rounded midpoint in the centre, hi at the right. The unit rides the right end only.
  const rightEnd = (v: bigint) => `${withSeparators(v)} ${v === 1n ? unit.singular : unit.plural}`.trim();
  if (mode === "values") {
    const mid = Math.floor((n - 1) / 2);
    for (const c of columns) {
      const v = c.value as bigint;
      const last = c.n === n;
      if (n <= 7 || c.n === 1 || c.n === n || c.n - 1 === mid) c.label = last ? rightEnd(v) : withSeparators(v);
    }
  } else {
    (columns[0] as AxisColumn).label = withSeparators(lo);
    (columns[4] as AxisColumn).label = withSeparators((lo + hi + 1n) / 2n);
    (columns[9] as AxisColumn).label = rightEnd(hi);
  }

  // The marker: the stake-weighted median of everything, off-axis included, from the third entry. It is one of the
  // entries, so it stands on a column: an on-axis one, or the off-axis column whose entry it is.
  let marker: Marker | null = null;
  if (entries.length >= 3) {
    const g = weightedMedian(entries);
    if (g !== null) {
      const chip = withSeparators(g);
      if (off.high && g === off.high.value) marker = { at: "offHigh", xPermille: 500, chip };
      else if (off.low && g === off.low.value) marker = { at: "offLow", xPermille: 500, chip };
      else {
        // x = (g - lo) / (hi - lo) across slices, (g - lo + 1/2) / n across per-value columns, as thousandths.
        const v = g < lo ? lo : g > hi ? hi : g;
        const x = mode === "slices" ? Number(((v - lo) * 1000n) / (hi - lo)) : Number(((2n * (v - lo) + 1n) * 1000n) / (2n * BigInt(n)));
        marker = { at: "axis", xPermille: x, chip };
      }
    }
  }
  return { lo, hi, mode, columns, offLow: off.low, offHigh: off.high, marker };
}

/** The axis as it travels to the browser: bigints as strings. */
export type NumberLineAxis = {
  mode: NumberAxis["mode"];
  columns: Array<Omit<AxisColumn, "stake" | "value"> & { stake: string; value: string | null }>;
  offLow: (Omit<OffAxis, "stake" | "value"> & { stake: string; value: string }) | null;
  offHigh: (Omit<OffAxis, "stake" | "value"> & { stake: string; value: string }) | null;
  marker: NumberAxis["marker"];
};

export function serialiseAxis(a: NumberAxis): NumberLineAxis {
  const off = (o: OffAxis | null) => (o ? { ...o, stake: o.stake.toString(), value: o.value.toString() } : null);
  return { mode: a.mode, columns: a.columns.map((c) => ({ ...c, stake: c.stake.toString(), value: c.value === null ? null : c.value.toString() })), offLow: off(a.offLow), offHigh: off(a.offHigh), marker: a.marker };
}

export type RulerPin = { id: string; value: bigint; xPermille: number; off: "low" | "high" | null };
export type Ruler = {
  lo: bigint;
  hi: bigint;
  leftLabel: string;
  rightLabel: string;
  pins: RulerPin[];
  /** The answer's place, when there is one. Never off the ruler: the answer is never the one pushed off. */
  answer: { value: bigint; xPermille: number } | null;
};

/**
 * The ruler (3.5): the call line become a number line. Its ends are the lowest and highest of the entries and
 * the answer together, with the padding rule, and the off-axis rule runs over entries and answer together but
 * never pushes the answer off. Positions are thousandths across the track.
 */
export function ruler(pins: Array<{ id: string; value: bigint }>, answer: bigint | null, unit: { singular: string; plural: string }): Ruler | null {
  if (pins.length === 0 && answer === null) return null;
  const values = [...pins.map((p) => p.value), ...(answer === null ? [] : [answer])];
  let { keep, offHigh, offLow } = splitOffAxis(values);
  if (answer !== null && offHigh === answer) {
    keep = sorted([...keep, answer]);
    offHigh = null;
  }
  if (answer !== null && offLow === answer) {
    keep = sorted([...keep, answer]);
    offLow = null;
  }
  const { lo, hi } = axisEnds(keep);
  const span = hi - lo;
  const place = (v: bigint) => (span === 0n ? 500 : Number((((v < lo ? lo : v > hi ? hi : v) - lo) * 1000n) / span));
  let highTaken = false;
  let lowTaken = false;
  const out: RulerPin[] = pins.map((p) => {
    if (offHigh !== null && p.value === offHigh && !highTaken) {
      highTaken = true;
      return { id: p.id, value: p.value, xPermille: 1000, off: "high" };
    }
    if (offLow !== null && p.value === offLow && !lowTaken) {
      lowTaken = true;
      return { id: p.id, value: p.value, xPermille: 0, off: "low" };
    }
    return { id: p.id, value: p.value, xPermille: place(p.value), off: null };
  });
  return {
    lo,
    hi,
    leftLabel: withSeparators(lo),
    rightLabel: `${withSeparators(hi)} ${hi === 1n ? unit.singular : unit.plural}`.trim(),
    pins: out,
    answer: answer === null ? null : { value: answer, xPermille: place(answer) },
  };
}

/** "14 shirts", "1 shirt", "1,240 people": the number with the form of the unit that matches (3.26). */
export function unitPhrase(n: bigint, unit: { singular: string; plural: string }): string {
  return `${withSeparators(n)} ${n === 1n ? unit.singular : unit.plural}`.trim();
}
