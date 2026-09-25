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
 * plus roughly 30 percent.
 *
 * DarefulDares (2026-09-19, `scripts/gas-survey-dares.ts`, same method, quorum of five, threshold three):
 * `create` 573,411 / 677,643 / 781,778 / 886,010 for two to five positions, which is 365k plus 104k a
 * position; `resolve` in its worst case (every pair mints) 274,229 / 507,595 / 829,653 / 1,240,427 for one,
 * three, six, and ten edges, which is 167k plus 107k an edge; `resolve` for VOID 74k flat. The Phase 0
 * extrapolation was about 2.3x too high, which on a chain that charges the declared limit was a 2.3x
 * overpayment on every market. The per-edge limit carries extra room because the survey's group already
 * held balances for some of those token ids, and a first mint into an empty slot costs more than a second.
 * `arbitrate` is measured (below). `expire` is one status write and is still derived; measure it when a
 * void-rule question first expires.
 *
 * A number market (2026-09-25, the same survey with `number`, quorum of five): `create` 590,596 for two positions
 * and 924,879 for five, which is 368k plus 111k a position; `resolve` 274,309 for one edge and 1,232,630 for ten,
 * which is 168k plus 106k an edge; VOID 74k to 82k. Within three percent of the yes-or-no figures, since the
 * struct is the same size and scoring by distance costs no more than Brier, so the limits below cover both kinds
 * with the same room (about 25 percent at five positions). Monad receipts report
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

  // DarefulDares (measured 2026-09-19; see the provenance above)
  create: (positions: number, quorum: number) => n(280_000 + 136_000 * positions + 40_000 * quorum), // 886k measured at 5 and 5
  resolve: (positions: number, votes: number) => n(180_000 + 13_000 * votes + 160_000 * edgesFor(positions)), // 1.24M measured at 10 edges, 3 votes
  resolveVoid: (votes: number) => n(100_000 + 13_000 * votes), // 74k measured; mints nothing, so it never pays for edges
  // Measured on Monad 2026-09-21 (eth_estimateGas against real locked questions): 1,318,098 for five people
  // and ten edges, 289,963 for three. The same shape as `resolve` without the vote recovery, so the same limit.
  arbitrate: (positions: number) => n(180_000 + 160_000 * edgesFor(positions)),
  /** A ruling that the terms cannot decide it: a status write and the ruling's hash, and nothing minted. */
  // Measured 65,107, the same whatever the size: nothing is scored and nothing mints.
  arbitrateVoid: () => n(90_000),
  expire: () => n(80_000), // not yet measured
} as const;

/** A market with N positions mints at most N(N - 1) / 2 edges. */
export function edgesFor(positions: number): number {
  return (positions * (positions - 1)) / 2;
}
