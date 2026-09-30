import type { ReactNode } from "react";
import { CREAM } from "@/lib/ui/palette";
import { cn } from "@/lib/utils";

/**
 * A pill on a scrim (docs/design.md 3.8, 3.38, 8.7): the credit chip and the counter on a media frame, a clip's
 * "+N", the empty slot's chip and the album's counter. The scrim is the same dark value in both themes (1.1), so
 * what sits on it is cream in both themes: the palette's literal, never `--ink`, which is graphite on paper.
 */
export function ScrimChip({ children, className, ...rest }: { children: ReactNode; className?: string } & Record<`data-${string}`, string>) {
  return (
    <span {...rest} className={cn("inline-flex items-center rounded-pill bg-scrim", className)} style={{ color: CREAM }}>
      {children}
    </span>
  );
}
