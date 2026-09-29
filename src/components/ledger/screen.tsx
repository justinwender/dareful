import type { ReactNode } from "react";
import { BackControl, CloseControl } from "@/components/ui/back-control";
import { InfoIcon } from "@/components/ui/info";
import { OfflineBar } from "@/components/ui/offline-bar";
import { Arrived } from "@/components/ui/arrived";
import { PinnedSheet } from "@/components/ui/pinned-sheet";
import { INFO_ICON_ON } from "@/lib/ui/info";
import { cn } from "@/lib/utils";

/**
 * One phone layout, 390px reference, 20px gutters, centered on wider viewports (docs/design.md 4.2). The bottom
 * padding grows by `--sheet-room` while a pinned sheet (3.24) is on the screen, so nothing is trapped under it.
 * A root (`root`: Now, What's on, People, You) is at least one pixel taller than the large viewport, so the
 * document always scrolls: the installed app on iOS 26 lays a page that fits the screen out short of it and
 * pins the tab bar above the real edge, and a page that scrolls is laid out right (docs/decisions.md
 * 2026-09-27, "The band, properly this time"; docs/testing.md item 61). This is the `page` layer (9.3): nothing
 * inside it is fixed, and the fixed layers it renders portal themselves to the app root. The band behind the
 * status bar and the grain are the shell's (`LayersRoot`), painted from `--ground` on `html`, which a market's
 * own screen swaps for its ink (1.8).
 */
export function Screen({ children, className, root = false, layer, arrive }: { children: ReactNode; className?: string; root?: boolean; /** The layer this screen lives in (the ask layer, 9.5), so the root page under it can be told apart. */ layer?: string; /** How the screen arrives (9.7): a push moves its content 24px and crossfades while its header crossfades ("step", the default off a root); a market fades in under its shell ("fade"); a root and a step in the ask layer arrive at once ("none"). */ arrive?: "step" | "fade" | "none" }) {
  const how = arrive ?? (root || layer ? "none" : "step");
  return (
    <main data-page={layer ?? ""} data-arrive={how} className={cn("mx-auto flex w-full max-w-[430px] flex-1 flex-col px-5 pb-[calc(max(2rem,env(safe-area-inset-bottom))+1rem+var(--sheet-room,0px))]", how === "step" && "page-arrive", how === "fade" && "motion-arrive", root && "min-h-[calc(100lvh_+_1px)]", className)}>
      <Arrived />
      {children}
    </main>
  );
}

/**
 * The top of a screen. Every non-root screen carries the 48px back control at its top left, which lands on the
 * root it came from (docs/design.md 6.4); a screen that rose from below (the question step, 9.5) carries Close, a
 * down chevron; a screen reached from outside the app while signed out shows the wordmark instead, because there
 * is nowhere in the app to go back to. For the hackathon the information icon owns the top-right corner (10.3):
 * a screen's own control from that corner (`right`: More, "Got a code?") sits directly left of it.
 */
export function TopBar({ back, onBack, close, onClose, closeHref, title, right, info }: { back?: boolean; /** Back within a flow (a step of asking, 9.8) rather than to the root. */ onBack?: () => void; /** Close in place of back, where the screen rose from below (9.5). */ close?: boolean; onClose?: () => void; closeHref?: string; title?: string; right?: ReactNode; /** The screen's information sheet (10), by key; none for a screen 10.1 leaves out. */ info?: string }) {
  return (
    <>
      <header className="flex h-14 items-center justify-between" data-top-bar="">
        <div className="flex min-w-0 items-center gap-2">
          {close ? <CloseControl onClose={onClose} href={closeHref} /> : onBack ? <BackControl onBack={onBack} /> : back ? <BackControl /> : null}
          {title ? <span className="truncate text-body-strong text-ink">{title}</span> : null}
        </div>
        <div className="flex items-center gap-1">
          {right}
          {info && INFO_ICON_ON ? <InfoIcon sheet={info} /> : null}
        </div>
      </header>
      {/* The offline bar sits under the header (3.14); the roots draw it under their own. */}
      <OfflineBar />
    </>
  );
}

/**
 * A root's header row (10.3): 56px, with what sat at the top of the screen (the date line, the tab's label) on
 * the left, a root's own control (Now's "Got a code?") and the information icon on the right. Once the icon goes,
 * the row goes with it and the label returns to the top of the screen.
 */
export function RootHeader({ children, right, info }: { children: ReactNode; right?: ReactNode; info: string }) {
  if (!INFO_ICON_ON)
    return (
      <div className="flex items-center justify-between pt-5">
        {children}
        {right}
      </div>
    );
  return (
    <header className="flex h-14 items-center justify-between" data-root-header="">
      <div className="flex min-w-0 items-center">{children}</div>
      <div className="flex items-center gap-1">
        {right}
        <InfoIcon sheet={info} />
      </div>
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
