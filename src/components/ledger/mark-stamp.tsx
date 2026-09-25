import { INKS, type InkName } from "@/lib/ui/ink";
import { cn } from "@/lib/utils";

type Size = 20 | 28 | 40 | 44 | 64;
const RADIUS: Record<Size, string> = { 20: "rounded-stamp-20", 28: "rounded-stamp-28", 40: "rounded-button", 44: "rounded-card", 64: "rounded-panel" };
const GLYPH: Record<Size, number> = { 20: 13, 28: 16, 40: 22, 44: 24, 64: 34 };

/**
 * docs/design.md 1.7 and 3.9. A mark always sits in a stamp: 20px in a token or kicker, 28 in a compact row, 40 in
 * a list row, 44 in the question band, 64 in the picker. The stamp's background is the market's field, which is
 * how a list stays one calm surface with small windows of each market's ink in it (1.8); in the question band it
 * is the market's ground. An emoji renders as text at the glyph size, never as an image; a picture mark fills the
 * stamp. No mark renders nothing at all: callers must not render this component for a blank mark.
 *
 * `ink`: the market this mark belongs to. Without one (a unit's mark inside a token) the stamp takes the neutral
 * field, which the specification does not name; recorded as a gap in docs/decisions.md.
 */
export function MarkStamp({ kind, value, size = 28, ink, onGround = false, className }: { kind: "emoji" | "image"; value: string; size?: Size; ink?: InkName; onGround?: boolean; className?: string }) {
  const background = onGround ? "var(--ground)" : ink ? INKS[ink].field : "var(--field)";
  return (
    <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden", RADIUS[size], className)} style={{ width: size, height: size, fontSize: GLYPH[size], lineHeight: 1, background }}>
      {kind === "emoji" ? (
        value
      ) : (
        // A 256px derivative behind a signed URL; next/image would need a loader for a URL that expires.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" width={size} height={size} className="h-full w-full object-cover" />
      )}
    </span>
  );
}
