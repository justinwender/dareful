import type { DenominationRow } from "@/lib/ledger/denominations";
import { hueBorder, type Hue } from "@/lib/ui/hue";
import { formatMoney, glyphKeyOf, quotedUnit, unitWords } from "@/lib/ui/units";
import { possessive } from "@/lib/ui/copy";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { UnitGlyph } from "./glyphs";

export type TokenOwner = { id: string; displayName: string; hue: Hue; ghost?: boolean };
type TokenUnit = Pick<DenominationRow, "label" | "pluralLabel" | "quantifiable" | "monetary" | "template" | "markKind" | "markValue">;

export type ObligationTokenProps = {
  owner: TokenOwner; // who picks up next
  other: { id: string; displayName: string };
  viewerId: string;
  denomination: TokenUnit;
  quantity: bigint;
  /** Unconfirmed: dashed border, no hue border, text stays full strength (3.2). */
  pending?: boolean;
  height?: 32 | 40;
  className?: string;
};

/**
 * docs/design.md 3.2. Pill, surface-2, 1px border in the owner's hue. The owner's avatar leads when the
 * obligation is theirs and trails when it is yours, so a token torn out of its row still says who is buying.
 * Contents in order: avatar, glyph tally, mark plus quoted words, rule, dollars. Whole dollars in lists (2.2);
 * the cents stay in the accessible name and on the detail sheet.
 */
export function ObligationToken({ owner, other, viewerId, denomination, quantity, pending = false, height = 32, className }: ObligationTokenProps) {
  const label = `${possessiveSentence(owner, other, viewerId)} ${unitWords(denomination, quantity)}`;
  return (
    <Pill owner={owner} viewerId={viewerId} label={label} pending={pending} height={height} className={className}>
      <UnitPart denomination={denomination} quantity={quantity} height={height} />
    </Pill>
  );
}

/**
 * The Mixed state (3.2): several units between two people in one pill, glyph tallies, then quoted words, then the
 * rule, then dollars, in that order (2.2: count before amount). A pill that would exceed the row width drops to
 * two stacked tokens on the owner's side rather than shrinking type: `splitMixed` says where.
 */
export function MixedToken({ owner, other, viewerId, lines, height = 40, className }: { owner: TokenOwner; other: { id: string; displayName: string }; viewerId: string; lines: Array<{ denomination: TokenUnit; quantity: bigint }>; height?: 32 | 40; className?: string }) {
  const ordered = orderMixed(lines);
  const label = `${possessiveSentence(owner, other, viewerId)} ${ordered.map((l) => unitWords(l.denomination, l.quantity)).join(", ")}`;
  return (
    <Pill owner={owner} viewerId={viewerId} label={label} height={height} className={className} data-mixed={ordered.length}>
      {ordered.map((l, i) => (
        <span key={i} className="inline-flex items-center gap-2">
          {i > 0 && l.denomination.monetary ? <span aria-hidden="true" className="h-4 w-px bg-line-strong" /> : null}
          <UnitPart denomination={l.denomination} quantity={l.quantity} height={height} />
        </span>
      ))}
    </Pill>
  );
}

/** Glyph tallies, then quoted words, then dollars always last (2.2). Pure. */
export function orderMixed<T extends { denomination: TokenUnit }>(lines: T[]): T[] {
  const rank = (d: TokenUnit) => (d.monetary ? 2 : glyphKeyOf(d) ? 0 : 1);
  return [...lines].sort((a, b) => rank(a.denomination) - rank(b.denomination));
}

/** One pill while it fits: up to two non-money parts beside the dollars; past that, the rest in a second token, dollars always in the last (3.10). Pure. */
export function splitMixed<T extends { denomination: TokenUnit }>(lines: T[]): T[][] {
  const ordered = orderMixed(lines);
  if (ordered.length <= 1) return ordered.length ? [ordered] : [];
  const money = ordered.filter((l) => l.denomination.monetary);
  const rest = ordered.filter((l) => !l.denomination.monetary);
  if (rest.length + money.length <= 3) return [ordered];
  return money.length ? [rest, money] : [rest.slice(0, 3), rest.slice(3)];
}

function Pill({ owner, viewerId, label, pending = false, height, className, children, ...rest }: { owner: TokenOwner; viewerId: string; label: string; pending?: boolean; height: 32 | 40; className?: string; children: React.ReactNode; "data-mixed"?: number }) {
  const yours = owner.id === viewerId;
  const avatar = <Avatar name={owner.displayName} hue={owner.hue} ghost={owner.ghost} size={height === 40 ? 28 : 22} />;
  return (
    <span
      role="img"
      aria-label={label}
      className={cn("inline-flex max-w-full items-center gap-2 rounded-pill bg-surface-2", className)}
      style={{
        height,
        border: pending ? "1px dashed var(--line-strong)" : `1px solid ${hueBorder(owner.hue)}`,
        flexDirection: yours ? "row-reverse" : "row",
        paddingLeft: yours ? 12 : 4,
        paddingRight: yours ? 4 : 12,
      }}
      {...rest}
    >
      {avatar}
      {children}
    </span>
  );
}

/** One unit's part of a token: the glyph tally, the numeral and one glyph past three, the mark and the quoted words, or whole dollars. */
function UnitPart({ denomination, quantity, height }: { denomination: TokenUnit; quantity: bigint; height: 32 | 40 }) {
  const glyph = glyphKeyOf(denomination);
  const glyphSize = height === 40 ? 18 : 16;
  // A unit's mark inside a token is a bare 16px glyph on the token's own fill, 4px before the quoted words, with
  // no stamp behind it (docs/design.md 1.7, 3.2): a filled square inside a 32px capsule is a box in a box.
  const mark =
    denomination.markKind === "emoji" && denomination.markValue ? (
      <span aria-hidden="true" className="inline-block shrink-0" style={{ fontSize: 16, lineHeight: 1 }}>
        {denomination.markValue}
      </span>
    ) : denomination.markKind === "image" && denomination.markValue ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={denomination.markValue} alt="" width={16} height={16} className="h-4 w-4 shrink-0 object-cover" />
    ) : null;
  if (denomination.monetary) return <span className="text-numeral-sm text-ink">{formatMoney(quantity, { whole: true })}</span>;
  const n = Number(quantity);
  if (glyph) {
    return n <= 3 ? (
      <span className="inline-flex items-center gap-0.5 text-ink" aria-hidden="true">
        {Array.from({ length: Math.max(1, n) }, (_, i) => (
          <UnitGlyph key={i} unit={glyph} size={glyphSize} />
        ))}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-ink" aria-hidden="true">
        <span className="text-numeral-sm">{n} ×</span>
        <UnitGlyph unit={glyph} size={glyphSize} />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-ink" aria-hidden="true">
      {mark}
      <span className="text-serif-m">
        {n > 1 ? `${n} × ` : ""}
        {quotedUnit(denomination.label)}
      </span>
    </span>
  );
}

function possessiveSentence(owner: TokenOwner, other: { id: string; displayName: string }, viewerId: string): string {
  if (owner.id === viewerId) return `You've got ${other.displayName}`;
  if (other.id === viewerId) return `${possessive(owner.displayName)} got you`;
  return `${possessive(owner.displayName)} got ${other.displayName}`;
}
