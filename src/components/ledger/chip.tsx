import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * docs/design.md 3.3. Height 24 for metadata, 28 to 36 when interactive, 40 for a name to pick on the link page (3.17).
 * A filter chip selects as ink on ground; a choice among words (`choice`: the kind chips under the band, the picker's
 * categories, the terms step's rows) selects with a `--surface-2` fill, a 1px `--ink-3` border and `--ink` text. The
 * stake chips are a different control with the same name (`StakeChips`).
 */
export function Chip({ children, selected = false, disabled = false, size = 24, className, choice = false, dashed = false, ...rest }: { children: ReactNode; selected?: boolean; disabled?: boolean; size?: 24 | 28 | 36 | 40 | 44; className?: string; /** A choice among words rather than a filter (3.3). */ choice?: boolean; /** A set of people that has not been named (3.19): a dashed border around its first names. */ dashed?: boolean } & Record<`data-${string}`, string>) {
  return (
    <span
      {...rest}
      aria-disabled={disabled || undefined}
      className={cn(
        "inline-flex items-center gap-1 rounded-pill border px-2.5 chip-text",
        size === 24 ? "h-6" : size === 28 ? "h-7" : size === 44 ? "h-11 justify-center px-3" : size === 40 ? "h-10 px-3" : "h-9 px-3",
        selected ? (choice ? "border-ink-3 bg-surface-2 text-ink" : "border-ink bg-ink text-ground") : disabled ? "border-line text-ink-3" : "border-line-strong text-ink-2",
        dashed && "border-dashed",
        className,
      )}
    >
      {children}
    </span>
  );
}
