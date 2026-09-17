import { cn } from "@/lib/utils";

type Size = 20 | 28 | 44 | 64;
const RADIUS: Record<Size, string> = { 20: "rounded-stamp-20", 28: "rounded-stamp-28", 44: "rounded-tile", 64: "rounded-button" };
const GLYPH: Record<Size, number> = { 20: 14, 28: 16, 44: 24, 64: 34 };

/**
 * docs/design.md 1.7 and 3.9. An emoji renders as text at the glyph size, never as an image; a picture mark
 * fills the stamp. No mark renders nothing at all: callers must not render this component for a blank mark.
 */
export function MarkStamp({ kind, value, size = 28, inToken = false, className }: { kind: "emoji" | "image"; value: string; size?: Size; inToken?: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden bg-surface", RADIUS[size], !inToken && "border border-line", className)}
      style={{ width: size, height: size, fontSize: GLYPH[size], lineHeight: 1 }}
    >
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
