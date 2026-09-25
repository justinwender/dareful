import { cn } from "@/lib/utils";
import { firstInitial } from "@/lib/ui/copy";
import { hueVar, type Hue } from "@/lib/ui/hue";

export type AvatarProps = {
  name: string;
  hue: Hue;
  size?: 20 | 22 | 24 | 26 | 28 | 32 | 36 | 44 | 52 | 56 | 76;
  /** Unknown or unclaimed person: stone hue and a dashed ring (docs/design.md 3.1). */
  ghost?: boolean;
  /** The surface behind it, for the overlap ring when stacked. */
  ring?: string;
  className?: string;
};

/** Circle, person hue fill, dark initial, Hanken 700. Always one character. */
export function Avatar({ name, hue, size = 28, ghost = false, ring, className }: AvatarProps) {
  const initial = firstInitial(name);
  const fontSize = Math.round(size * 0.42);
  // 1.5: the ring is 2px at 28px and under, 3px at 32px and above.
  const ringWidth = size >= 32 ? 3 : 2;
  return (
    <span
      role="img"
      aria-label={initial ? name : "unnamed friend"}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-pill font-bold text-avatar-ink", ghost && "outline-dashed outline-1 outline-line-strong", className)}
      style={{
        width: size,
        height: size,
        fontSize,
        lineHeight: 1,
        background: ghost ? hueVar("stone") : hueVar(hue),
        boxShadow: ring ? `0 0 0 ${ringWidth}px ${ring}` : undefined,
      }}
    >
      {initial}
    </span>
  );
}

/** Overlapping avatars, at most four, then a +N chip. */
export function AvatarStack({ people, size = 28, ring = "var(--surface)" }: { people: Array<{ name: string; hue: Hue; ghost?: boolean }>; size?: 26 | 28 | 56; ring?: string }) {
  const shown = people.slice(0, 4);
  const extra = people.length - shown.length;
  const overlap = size >= 56 ? -14 : -8;
  return (
    <span className="inline-flex items-center">
      {shown.map((p, i) => (
        <span key={`${p.name}-${i}`} style={{ marginLeft: i === 0 ? 0 : overlap }}>
          <Avatar name={p.name} hue={p.hue} size={size} ghost={p.ghost} ring={ring} />
        </span>
      ))}
      {extra > 0 && (
        <span className="ml-1 inline-flex h-6 items-center rounded-pill border border-line-strong px-2 chip-text text-ink-2">+{extra}</span>
      )}
    </span>
  );
}
