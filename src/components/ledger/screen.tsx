import type { ReactNode } from "react";
import { BackControl } from "@/components/ui/back-control";
import { PinnedSheet } from "@/components/ui/pinned-sheet";
import { cn } from "@/lib/utils";

/**
 * One phone layout, 390px reference, 20px gutters, centered on wider viewports (docs/design.md 4.2). The bottom
 * padding grows by `--sheet-room` while a pinned sheet (3.24) is on the screen, so nothing is trapped under it.
 */
export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className={cn("mx-auto flex w-full max-w-[430px] flex-1 flex-col px-5 pb-[calc(max(2rem,env(safe-area-inset-bottom)+1rem)+var(--sheet-room,0px))]", className)}>
      {/* The status bar is translucent in the installed app (viewport-fit=cover) and the body's top padding only
          keeps content out from under it at rest: scrolled, the content ran under the clock. This band is the
          ground, with its grain, fixed behind the status bar for exactly the top inset. Inside the screen rather
          than the root layout so that on a market's own screen it reads the market's ground (1.8). */}
      <div aria-hidden="true" data-status-band="" className="grain fixed inset-x-0 top-0 z-20 h-[env(safe-area-inset-top)]" />
      {children}
    </main>
  );
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
 * A task screen's one move, in the sheet pinned where the bar would be on a root (docs/design.md 3.24, 6.4).
 * At most one primary button per viewport.
 */
export function ActionArea({ label = "Your move", children }: { label?: string; children: ReactNode }) {
  return <PinnedSheet label={label} low={children} />;
}
