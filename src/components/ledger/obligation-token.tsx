import type { DenominationRow } from "@/lib/ledger/denominations";
import { hueBorder, type Hue } from "@/lib/ui/hue";
import { formatMoney, glyphKeyOf, quotedUnit, unitWords } from "@/lib/ui/units";
import { possessive } from "@/lib/ui/copy";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { UnitGlyph } from "./glyphs";

export type TokenOwner = { id: string; displayName: string; hue: Hue; ghost?: boolean };

export type ObligationTokenProps = {
  owner: TokenOwner; // who picks up next
  other: { id: string; displayName: string };
  viewerId: string;
  denomination: Pick<DenominationRow, "label" | "pluralLabel" | "quantifiable" | "monetary" | "template" | "markKind" | "markValue">;
  quantity: bigint;
  /** Unconfirmed: dashed border, no hue border, text stays full strength (3.2). */
  pending?: boolean;
  height?: 32 | 40;
  className?: string;
};

/**
 * docs/design.md 3.2. Pill, surface-2, 1px border in the owner's hue. The owner's avatar leads when the
 * obligation is theirs and trails when it is yours, so a token torn out of its row still says who is buying.
 * Contents in order: avatar, glyph tally, mark plus quoted words, rule, dollars.
 */
export function ObligationToken({ owner, other, viewerId, denomination, quantity, pending = false, height = 32, className }: ObligationTokenProps) {
  const yours = owner.id === viewerId;
  const glyph = glyphKeyOf(denomination);
  const words = unitWords(denomination, quantity);
  const label = `${possessiveSentence(owner, other, viewerId)} ${words}`;
  const avatarSize = height === 40 ? 28 : 22;
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

  let body: React.ReactNode;
  if (denomination.monetary) {
    body = <span className="text-numeral-sm text-ink">{formatMoney(quantity)}</span>;
  } else if (glyph) {
    const n = Number(quantity);
    body =
      n <= 3 ? (
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
  } else {
    const n = Number(quantity);
    body = (
      <span className="inline-flex items-center gap-1 text-ink" aria-hidden="true">
        {mark}
        <span className="text-serif-m">
          {n > 1 ? `${n} × ` : ""}
          {quotedUnit(denomination.label)}
        </span>
      </span>
    );
  }

  const avatar = <Avatar name={owner.displayName} hue={owner.hue} ghost={owner.ghost} size={avatarSize === 28 ? 28 : 22} />;

  return (
    <span
      role="img"
      aria-label={label}
      className={cn("inline-flex max-w-full items-center gap-2 rounded-pill bg-surface-2", yours ? "pr-3 pl-1" : "pr-3 pl-1", className)}
      style={{
        height,
        border: pending ? "1px dashed var(--line-strong)" : `1px solid ${hueBorder(owner.hue)}`,
        flexDirection: yours ? "row-reverse" : "row",
        paddingLeft: yours ? 12 : 4,
        paddingRight: yours ? 4 : 12,
      }}
    >
      {avatar}
      {body}
    </span>
  );
}

function possessiveSentence(owner: TokenOwner, other: { id: string; displayName: string }, viewerId: string): string {
  if (owner.id === viewerId) return `You've got ${other.displayName}`;
  if (other.id === viewerId) return `${possessive(owner.displayName)} got you`;
  return `${possessive(owner.displayName)} got ${other.displayName}`;
}
