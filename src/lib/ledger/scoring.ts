/**
 * The scoring rule and the pairwise settlement, in integers (PLANNING.md sections 5a and 8c, as corrected in
 * docs/decisions.md 2026-09-17: truncation toward zero, and the single-edge collapse). This mirrors what
 * DarefulDares computes onchain. The chain is authoritative for an onchain market; this exists to show a
 * leaderboard's arithmetic, to let `verify-envio` check that the edges a market minted are the edges the rule
 * produces, and, in Phase 2D, to settle provisional markets that never reach the chain.
 *
 * Written from the specification's formulas, not from the contract's code, so that agreement between the two is
 * evidence. Everything is bigint: scores in basis points, stakes and transfers in whole units. No float touches
 * a stake, a score, or a transfer.
 */
export const BPS = 10_000n;

export type ScoredPosition = { id: string; stake: bigint; score: bigint };
export type Edge = { debtor: string; creditor: string; qty: bigint };

/** Binary: S = 10000 - (value - outcome * 10000)^2 / 10000. `outcome` is 0 or 1; `valueBps` is 0 to 10000. */
export function scoreBinary(valueBps: bigint, outcome: bigint): bigint {
  if (valueBps < 0n || valueBps > BPS) throw new RangeError("a probability is 0 to 10000 basis points");
  if (outcome !== 0n && outcome !== 1n) throw new RangeError("a binary outcome is 0 or 1");
  const miss = valueBps - outcome * BPS;
  return BPS - (miss * miss) / BPS;
}

/** The largest number a number market takes as an entry or an answer (docs/design.md 3.26): nine digits. */
export const MAX_NUMBER = 999_999_999n;

/**
 * Numeric: S = max(0, 10000 - |value - outcome| x 10000 / range), integer division, floored at zero once the
 * miss reaches the scale. The scale is fixed when the question is asked and never derived from entries
 * (docs/decisions.md 2026-09-24): one absurd entry would otherwise widen it, compress everyone else's score
 * differences, and under truncation collapse the market to a single edge.
 */
export function scoreNumeric(value: bigint, outcome: bigint, range: bigint): bigint {
  if (range <= 0n) throw new RangeError("a number market's scale is at least one");
  if (value < 0n || outcome < 0n) throw new RangeError("a number is never negative");
  const miss = value > outcome ? value - outcome : outcome - value;
  if (miss >= range) return 0n;
  return BPS - (miss * BPS) / range;
}

/** BigInt division already truncates toward zero, for either sign. Named so the rule is visible at the call. */
export function truncDiv(x: bigint, d: bigint): bigint {
  return x / d;
}

/** transfer_ij = min(s_i, s_j) x (S_i - S_j) / (N - 1) / 10000, truncated toward zero. Positive: j pays i. */
export function pairwiseTransfer(stakeI: bigint, stakeJ: bigint, scoreI: bigint, scoreJ: bigint, n: bigint): bigint {
  if (n < 2n) throw new RangeError("a market needs two positions");
  const atRisk = stakeI < stakeJ ? stakeI : stakeJ;
  return truncDiv(atRisk * (scoreI - scoreJ), (n - 1n) * BPS);
}

/**
 * Every nonzero transfer is one edge from the lower scorer to the higher. If every transfer truncates to zero,
 * the market collapses to a single edge of one unit, lowest scorer to highest, and a tie at either end mints
 * nothing. An unquantifiable denomination (every stake 1) is an instance of that rule, not a special case.
 */
export function settle(positions: ScoredPosition[]): Edge[] {
  const n = BigInt(positions.length);
  if (n < 2n) throw new RangeError("a market needs two positions");
  const edges: Edge[] = [];
  for (let i = 0; i < positions.length; i += 1) {
    for (let j = i + 1; j < positions.length; j += 1) {
      const a = positions[i] as ScoredPosition;
      const b = positions[j] as ScoredPosition;
      const t = pairwiseTransfer(a.stake, b.stake, a.score, b.score, n);
      if (t > 0n) edges.push({ debtor: b.id, creditor: a.id, qty: t });
      else if (t < 0n) edges.push({ debtor: a.id, creditor: b.id, qty: -t });
    }
  }
  if (edges.length > 0) return edges;

  const top = positions.reduce((m, p) => (p.score > m ? p.score : m), -1n);
  const bottom = positions.reduce((m, p) => (p.score < m ? p.score : m), BPS + 1n);
  const highest = positions.filter((p) => p.score === top);
  const lowest = positions.filter((p) => p.score === bottom);
  if (top === bottom || highest.length !== 1 || lowest.length !== 1) return [];
  return [{ debtor: (lowest[0] as ScoredPosition).id, creditor: (highest[0] as ScoredPosition).id, qty: 1n }];
}

/** Each participant's net: what they are owed minus what they owe. Sums to zero, always. */
export function nets(positions: ScoredPosition[], edges: Edge[]): Map<string, bigint> {
  const out = new Map(positions.map((p) => [p.id, 0n]));
  for (const e of edges) {
    out.set(e.creditor, (out.get(e.creditor) ?? 0n) + e.qty);
    out.set(e.debtor, (out.get(e.debtor) ?? 0n) - e.qty);
  }
  return out;
}

/** The group's number on a yes-or-no market: the stake-weighted mean probability. A poll average, never a price. A number market's is the median (`weightedMedian`, number-axis.ts). */
export function groupNumber(positions: Array<{ stake: bigint; value: bigint }>): bigint | null {
  const total = positions.reduce((a, p) => a + p.stake, 0n);
  if (total === 0n) return null;
  return positions.reduce((a, p) => a + p.stake * p.value, 0n) / total;
}
