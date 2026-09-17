/**
 * Explicit gas limits for every relayer transaction.
 *
 * Monad charges gas against the declared limit, not gas used, so every limit here is a real cost and
 * `estimateGas` is never called in a production path. Monad's opcode schedule is also heavier than a local
 * EVM for the storage patterns these contracts use (cold storage is 8100 per 128-slot page rather than
 * 2100 per slot, cold account access is 10100, ecrecover is 6000), so `forge test --gas-report` figures
 * are wrong here: `net` measured 78k in Foundry and 128k on Monad.
 *
 * Provenance (2026-09-16, Monad testnet, `scripts/gas-survey.ts` via Monad eth_estimateGas, calibration
 * only): confirm 185,592; close 95,914; net 128,528; createDenom 125,298; createGroup 368,341 with two
 * members and 794,829 with five; setDares 66,158 from the deployment receipt. Limits are those figures
 * plus roughly 30 percent. The DarefulDares figures are extrapolated from the Foundry maxima at 2.1x and
 * must be re-measured with the survey the first time markets go onchain (Phase 2). Monad receipts report
 * `gasUsed` equal to the declared limit, so receipts cannot calibrate anything; `RELAYER_LOG_GAS=1` only
 * shows whether a limit was enough. Re-measure with the survey whenever a contract changes and record the
 * change in docs/decisions.md.
 */

const n = (x: number) => BigInt(x);

export const gasFor = {
  // DarefulLedger, relayer-only registration
  createGroup: (members: number) => n(110_000 + 185_000 * members), // 368k (2) / 795k (5) measured
  addMember: () => n(215_000), // per-member cost of createGroup plus the base
  createDenom: () => n(165_000), // 125k measured
  setDares: () => n(90_000), // 66k measured

  // DarefulLedger, signed mutations
  confirm: () => n(250_000), // 186k measured
  confirmMany: (items: number) => n(90_000 + 165_000 * items), // per-item from confirm less the base
  close: () => n(130_000), // 96k measured
  net: () => n(170_000), // 129k measured

  // DarefulDares (extrapolated; re-measure in Phase 2)
  create: (positions: number, quorum: number) => n(700_000 + 220_000 * positions + 40_000 * quorum),
  resolve: (positions: number, votes: number) => n(150_000 + 30_000 * votes + 260_000 * edgesFor(positions)),
  arbitrate: (positions: number) => n(150_000 + 260_000 * edgesFor(positions)),
  expire: () => n(80_000),
} as const;

/** A market with N positions mints at most N(N - 1) / 2 edges. */
export function edgesFor(positions: number): number {
  return (positions * (positions - 1)) / 2;
}
