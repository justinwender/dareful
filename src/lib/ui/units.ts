/**
 * The visual language for denominations (docs/design.md 2.2): standing units get a drawn glyph and a tally,
 * invented units stay the words someone typed in curly quotes, money is a plain numeral and always last.
 * Money is integer cents; nothing here does arithmetic on a float.
 */
import type { DenominationRow } from "@/lib/ledger/denominations";

export type GlyphKey = "beer" | "coffee" | "round" | "next_time";

export function glyphKeyOf(d: Pick<DenominationRow, "template">): GlyphKey | null {
  switch (d.template) {
    case "beer":
    case "coffee":
    case "round":
    case "next_time":
      return d.template;
    default:
      return null;
  }
}

/**
 * Dollars from cents, with the cents whenever the amount is not whole dollars, in a list as on a detail sheet
 * (pre-submission bug fixes 1: lists rounded to whole dollars, so a judge's $0.37 read "$0"); `cents` shows them on a
 * whole amount too. Never a float.
 */
export function formatMoney(centsValue: bigint, opts: { cents?: boolean } = {}): string {
  const negative = centsValue < 0n;
  const abs = negative ? -centsValue : centsValue;
  const sign = negative ? "-" : "";
  const dollars = abs / 100n;
  const rem = abs % 100n;
  if (opts.cents || rem !== 0n) {
    return `${sign}$${dollars.toLocaleString("en-US")}.${rem.toString().padStart(2, "0")}`;
  }
  return `${sign}$${dollars.toLocaleString("en-US")}`;
}

/** The unit as words: "2 beers", "a beer", "a next time", "3 next times", "$40", "2 × “dumpling run”". */
export function unitWords(d: Pick<DenominationRow, "label" | "pluralLabel" | "quantifiable" | "monetary" | "template">, qty: bigint): string {
  if (d.monetary) return formatMoney(qty);
  if (!d.quantifiable) return qty === 1n ? d.label : `${qty.toString()} ${d.pluralLabel}`;
  if (glyphKeyOf(d)) return qty === 1n ? `a ${d.label}` : `${qty.toString()} ${d.pluralLabel}`;
  return qty === 1n ? `“${d.label}”` : `${qty.toString()} × “${d.label}”`;
}

/** Curly-quoted invented units, truncated at 18 characters with the ellipsis inside the closing quote. */
export function quotedUnit(label: string): string {
  const shown = label.length > 18 ? `${label.slice(0, 17)}…` : label;
  return `“${shown}”`;
}
