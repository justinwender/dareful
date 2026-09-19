/**
 * One total, several people (PLANNING.md section 9, "Allocation" and "Rounding", applied to the common case of
 * a single total rather than an itemized receipt). Integer cents throughout. The shares always sum to the total
 * exactly, and the residual goes to the payer: nobody else is ever asked for a cent that division invented.
 *
 * `present` is everyone who was in on it, other than the payer. `payerIn` says whether the payer's own share
 * comes out of the total (dinner for five, one of them paid) or not (the payer bought for the others).
 * `fixed` pins individual people to an amount; the rest of the total is split evenly among everyone else.
 */
export type SplitShare = { personId: string; cents: bigint };
export type Split = { shares: SplitShare[]; payerCents: bigint };

export class SplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SplitError";
  }
}

export function splitTotal(input: { totalCents: bigint; present: string[]; payerIn: boolean; fixed?: ReadonlyMap<string, bigint> }): Split {
  const { totalCents, payerIn } = input;
  const present = Array.from(new Set(input.present));
  const fixed = input.fixed ?? new Map<string, bigint>();
  if (totalCents <= 0n) throw new SplitError("How much was it?");
  if (present.length === 0) throw new SplitError("Who was there?");
  for (const [id, cents] of fixed) {
    if (!present.includes(id)) throw new SplitError("That adjustment is for someone who wasn't there.");
    if (cents < 0n) throw new SplitError("An amount can't be less than nothing.");
  }

  const fixedSum = Array.from(fixed.values()).reduce((a, b) => a + b, 0n);
  if (fixedSum > totalCents) throw new SplitError("Those amounts add up to more than the total.");
  const even = present.filter((id) => !fixed.has(id));
  const heads = BigInt(even.length) + (payerIn ? 1n : 0n);
  const rest = totalCents - fixedSum;
  if (heads === 0n && rest !== 0n) throw new SplitError("Those amounts don't add up to the total.");

  const each = heads === 0n ? 0n : rest / heads; // integer division: truncates, and the payer takes what is left
  const shares = present.map((personId) => ({ personId, cents: fixed.get(personId) ?? each }));
  const othersSum = shares.reduce((a, s) => a + s.cents, 0n);
  const payerCents = totalCents - othersSum;

  // Principle 9: the books balance or this throws. Never a silent cent.
  if (payerCents < 0n || othersSum + payerCents !== totalCents) throw new SplitError("That split doesn't add up.");
  if (!payerIn && payerCents >= heads && heads > 0n) throw new SplitError("That split doesn't add up.");
  return { shares, payerCents };
}
