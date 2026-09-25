import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** docs/design.md 3.3. Height 24 for metadata, 28 to 36 when interactive. Selected is ink on ground. */
export function Chip({ children, selected = false, disabled = false, size = 24, className }: { children: ReactNode; selected?: boolean; disabled?: boolean; size?: 24 | 28 | 36; className?: string }) {
  return (
    <span
      aria-disabled={disabled || undefined}
      className={cn(
        "inline-flex items-center gap-1 rounded-pill border px-2.5 chip-text",
        size === 24 ? "h-6" : size === 28 ? "h-7" : "h-9 px-3",
        selected ? "border-ink bg-ink text-ground" : disabled ? "border-line text-ink-3" : "border-line-strong text-ink-2",
        className,
      )}
    >
      {children}
    </span>
  );
}
