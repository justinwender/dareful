/**
 * What the mutation audit knows about the relayer it spends (the submission round, section 3), pure, so the runner's
 * arithmetic has tests of its own: the suites' floor, where the run pauses, the last full audit's spend and what a run
 * should take from it.
 */

/** `TEST_FLOOR` (src/lib/chain/watch.ts), written out so the runner never imports the app. */
export const TEST_FLOOR_WEI = 5n * 10n ** 18n;
/** Where the run pauses: the floor and a mutant's worst run above it, since the suites check the floor only as they start. */
export const PAUSE_AT_WEI = TEST_FLOOR_WEI + 10n ** 18n;
/**
 * The last full audit's spend, from the relayer's own record of what it signed (`chain_writes`, mined or reverted,
 * priced at the base fee): October 9, 2026, 1,682 mutants, 427 of them on the database, 8.10 MON in 169 writes (the
 * one before it, October 6: 1,480 mutants, 377 on the database, 7.99 MON in 167). Only the database's mutants sign, so
 * the estimate scales with them.
 */
export const LAST_FULL = { date: "2026-10-09", mutants: 1682, db: 427, wei: 8_101_554_000_000_000_000n };
/** What the run should take: the last full audit's spend per database mutant, for this many, and one run of every suite at the end. */
export function estimateWei(dbMutants: number, baselineSuites: number): bigint {
  const perMutant = LAST_FULL.wei / BigInt(LAST_FULL.db);
  return perMutant * BigInt(dbMutants + baselineSuites);
}
/** MON to two places, from wei, with no float near it. */
export function mon(wei: bigint): string {
  const neg = wei < 0n;
  const v = neg ? -wei : wei;
  const whole = v / 10n ** 18n;
  const cents = (v % 10n ** 18n) / 10n ** 16n;
  return `${neg ? "-" : ""}${whole}.${cents.toString().padStart(2, "0")}`;
}

