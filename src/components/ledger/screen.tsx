import type { ReactNode } from "react";
import { BackControl } from "@/components/ui/back-control";
import { cn } from "@/lib/utils";

/** One phone layout, 390px reference, 20px gutters, centered on wider viewports (docs/design.md 4.2). */
export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn("mx-auto flex w-full max-w-[430px] flex-1 flex-col px-5 pb-[max(2rem,calc(env(safe-area-inset-bottom)+1rem))]", className)}>{children}</main>;
}

/**
 * The top of a screen. Every non-root screen carries the 48px back control at its top left, which lands on the
 * root it came from (docs/design.md 6.4); a screen reached from outside the app while signed out shows the
 * wordmark instead, because there is nowhere in the app to go back to. The three roots have neither.
 */
export function TopBar({ back, title, right }: { back?: boolean; title?: string; right?: ReactNode }) {
  return (
    <header className="flex h-14 items-center justify-between">
      <div className="flex min-w-0 items-center gap-2">
        {back ? <BackControl /> : null}
        {title ? <span className="truncate text-body-strong text-ink">{title}</span> : null}
      </div>
      <div className="flex items-center gap-1">{right}</div>
    </header>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="text-label text-ink-3">{children}</h2>;
}

/**
 * A task screen's one move, pinned where the bar would be on a root (docs/design.md 3.24, 6.4): 16px top, 20px
 * sides, and the home indicator's inset at the bottom. At most one primary button per viewport.
 */
export function ActionArea({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 -mx-5 mt-auto bg-ground px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>;
}
