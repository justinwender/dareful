/**
 * The weight line's arithmetic (docs/design.md 3.22), as data, so the picture's claims have tests.
 *
 * It is weighted by stake, not by headcount, and that is the point rather than a detail: six numbers averaging
 * 6 in 10 give a group's number of 4 in 10 when one person holds half of what is riding at the bottom of the
 * range. A count histogram would show the opposite of what is happening.
 *
 * Integers throughout. Values are basis points (0 to 10000); stakes are units of the question's one unit
 * (cents, for dollars). A question has exactly one stake unit, fixed when it is asked (`dares.denom_id`, and
 * `Dare.denomId` onchain), which is the only reason stakes can be weighed against each other at all.
 */
import { groupNumber } from "./scoring";

export type Entry = { id: string; stake: bigint; valueBps: bigint };
export type Bucket = {
  /** 1 to 10. */
  n: number;
  stake: bigint;
  /** 0 to 1000, thousandths of the tallest column, so no float decides a height. */
  heightPermille: number;
  /** People here who put nothing on it: a person, not weight. Drawn as hollow dots on the baseline. */
  noStake: number;
  people: number;
};

/** `bucket(v) = ceil(v / 10)` for v in 1 to 100. Zero has no tenth of its own and sits in the first. */
export function bucketOf(valueBps: bigint): number {
  const v = valueBps < 0n ? 0n : valueBps > 10_000n ? 10_000n : valueBps;
  const n = Number((v + 999n) / 1000n);
  return n < 1 ? 1 : n;
}

export function buckets(entries: Entry[]): Bucket[] {
  const out: Bucket[] = Array.from({ length: 10 }, (_, i) => ({ n: i + 1, stake: 0n, heightPermille: 0, noStake: 0, people: 0 }));
  for (const e of entries) {
    const b = out[bucketOf(e.valueBps) - 1];
    if (!b) continue;
    b.people += 1;
    if (e.stake > 0n) b.stake += e.stake;
    else b.noStake += 1;
  }
  const tallest = out.reduce((m, b) => (b.stake > m ? b.stake : m), 0n);
  for (const b of out) b.heightPermille = tallest === 0n ? 0 : Number((b.stake * 1000n) / tallest);
  return out;
}

/**
 * The group's number in basis points: the stake-weighted mean. When nothing at all is riding, everyone weighs
 * the same, so it is the plain mean; the picture is then a row of hollow dots and must still say something true.
 */
export function groupsNumberBps(entries: Entry[]): bigint | null {
  if (entries.length === 0) return null;
  const weighted = groupNumber(entries.map((e) => ({ stake: e.stake > 0n ? e.stake : 0n, value: e.valueBps })));
  if (weighted !== null) return weighted;
  return entries.reduce((a, e) => a + e.valueBps, 0n) / BigInt(entries.length);
}

/** "45%": the nearest whole percent, halves rounding up. The exact figure lives on the details sheet. */
export function percentOf(bps: bigint): number {
  return Number((bps + 50n) / 100n);
}

/** The marker appears from the third entry: with one or two it would only restate a number already on screen. */
export function showsMarker(entries: Entry[]): boolean {
  return entries.length >= 3;
}

/** Whoever holds more than half of everything riding, if anyone does. The caption has to say so in words. */
export function overHalf(entries: Entry[]): Entry | null {
  const total = entries.reduce((a, e) => a + (e.stake > 0n ? e.stake : 0n), 0n);
  if (total === 0n || entries.length < 2) return null;
  return entries.find((e) => e.stake * 2n > total) ?? null;
}

/**
 * A slow question gets a line of the group's number over time; a fast one has no shape worth drawing. Both
 * conditions, checked when it is drawn: a three-entry week-long question and a six-entry ten-minute one both
 * exist, and neither gets a chart.
 */
export const SPARK_MIN_OPEN_MS = 24 * 3_600_000;
export const SPARK_MIN_ENTRIES = 4;
export function sparkEligible(input: { openedAt: Date; now: Date; entries: number; points: number }): boolean {
  return input.now.getTime() - input.openedAt.getTime() > SPARK_MIN_OPEN_MS && input.entries >= SPARK_MIN_ENTRIES && input.points >= 2;
}

const COUNT_WORDS = ["none", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
export const countWord = (n: number) => COUNT_WORDS[n] ?? String(n);

/**
 * The picture, said in words, for whoever never saw it move and for anyone who cannot see it at all. It stays
 * inside the vocabulary boundary (docs/design.md 4.6): the group's number, where the stake sits, what's riding.
 * Never odds, price, pot, or "the market says". It is six friends guessing.
 */
export function weightCaption(input: { entries: Entry[]; viewerId: string; nameOf: (id: string) => string; stakeWords: (stake: bigint) => string }): string {
  const { entries } = input;
  const base = "Height is how much is riding on each number, not how many people picked it.";
  if (entries.length <= 1) return `You’re first in. ${base}`;
  if (entries.every((e) => e.stake <= 0n)) return "Nobody has anything riding on it, so every number counts the same. A dot is a person.";
  const heavy = overHalf(entries);
  const number = groupsNumberBps(entries);
  if (heavy && number !== null) {
    const who = heavy.id === input.viewerId ? "You have" : `${input.nameOf(heavy.id)} has`;
    return `${base} ${who} ${input.stakeWords(heavy.stake)} on ${percentOf(heavy.valueBps)}%, more than half of what’s riding, which is why the group’s number sits at ${percentOf(number)}%.`;
  }
  if (new Set(entries.map((e) => bucketOf(e.valueBps))).size === 1) return `No spread at all. ${base}`;
  return base;
}
