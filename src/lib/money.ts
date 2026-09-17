/**
 * Branded integer types for every monetary or quantity value.
 *
 * Offchain money is integer cents. Onchain quantities are integer units (cents for USD denominations,
 * whole units for everything else). No float ever touches either. The brands are erased at runtime; they
 * exist so that a plain `bigint` or `number` cannot be passed where a `Cents` or `Units` is expected without
 * going through a constructor that checks it is a non-negative integer.
 */

declare const brand: unique symbol;

export type Cents = bigint & { readonly [brand]: "Cents" };
export type Units = bigint & { readonly [brand]: "Units" };

function toIntegerBigint(value: bigint | number, label: string): bigint {
  if (typeof value === "bigint") return value;
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} must be an integer, received ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} exceeds the safe integer range; pass a bigint`);
  }
  return BigInt(value);
}

/** Integer cents. Rejects fractions and negative values. */
export function cents(value: bigint | number): Cents {
  const v = toIntegerBigint(value, "cents");
  if (v < 0n) throw new RangeError(`cents must be non-negative, received ${v}`);
  return v as Cents;
}

/** Integer onchain units. Rejects fractions and negative values. */
export function units(value: bigint | number): Units {
  const v = toIntegerBigint(value, "units");
  if (v < 0n) throw new RangeError(`units must be non-negative, received ${v}`);
  return v as Units;
}

export function addCents(a: Cents, b: Cents): Cents {
  return (a + b) as Cents;
}

export function addUnits(a: Units, b: Units): Units {
  return (a + b) as Units;
}

/** For a USD denomination the onchain unit is the cent, so the conversion is the identity. */
export function centsToUsdUnits(c: Cents): Units {
  return c as unknown as Units;
}

/** Render cents as a dollar string for display only. Never feed the result back into arithmetic. */
export function formatUsd(c: Cents): string {
  const negative = c < 0n;
  const abs = negative ? -c : c;
  const dollars = abs / 100n;
  const rem = abs % 100n;
  return `${negative ? "-" : ""}$${dollars.toString()}.${rem.toString().padStart(2, "0")}`;
}
