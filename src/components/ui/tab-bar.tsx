"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FixedLayer } from "./layers";
import { LinkPending } from "./link-pending";
import { ROOT_KEY, ROOTS, rootFor, type RootPath } from "@/lib/ui/root";
import { rootMounted } from "@/lib/ui/roots-store";
import { cn } from "@/lib/utils";

/**
 * The shell (docs/design.md section 6): four destinations and one button. The bar renders on the four roots and
 * nowhere else; a task screen hides it and puts its one move where the bar would be. Each root renders the bar
 * itself, which is what keeps it off every other screen, and remembers itself as the root that "back" lands on.
 * What's on is the second tab (3.32): the one destination holding things nothing in the app has pointed you to.
 * Its icon is a ticket stub at the same 1.8px stroke on the 24px grid; no badge, dot or count on it, ever.
 *
 * Switching tabs is instant (9.6): the bar acts on `pointerdown`, the one control in the app that does, since a
 * touch on it is always meant and a switch is undone by another tap; the selected glyph and label change at once
 * and the new root is drawn in the next frame. A root once visited is held by the router for thirty seconds
 * (`staleTimes`, next.config.ts) with its scroll position, so going back to it draws its last content at once and
 * re-reads silently after; from Now the other three are fetched while the phone is idle, so no tab's first visit
 * waits. Tapping the tab you are on scrolls that root to the top, smoothly, and at once with Reduce Motion.
 *
 * No badge, dot or count on any tab, ever (Round C, the owner's ruling amending 6.4): the one citron dot lives on
 * the soonest needs-you row (3.15), and the tab bar says nothing about what is waiting.
 *
 * Start, the button (6.1): a 56px chalk circle 16px above the bar, on the four roots, hidden on an empty Now. It
 * asks and does nothing else: a tap opens the ask layer with the question step (9.5), where an argument is a chip
 * and "Got a code?" sits at the top right. The Start sheet is gone; a cover is logged from the person it is with.
 * The question step is the one route a root prefetches (9.5: nothing on it waits on the server), since the + is the
 * primary act and its payload is one render of the asker's sets; the router holds it for thirty seconds.
 */
export const TAB_BAR_HEIGHT = 64;
const TABS: Array<{ href: RootPath; label: string }> = [
  { href: "/", label: "Now" },
  { href: "/on", label: "What’s on" },
  { href: "/people", label: "People" },
  { href: "/you", label: "You" },
];
const SCROLL_KEY = "dareful.scroll:";

/** Where a root was scrolled to when it was left, so coming back draws it where it was (9.6). */
export function rememberScroll(path: string, y: number): void {
  try {
    sessionStorage.setItem(SCROLL_KEY + path, String(Math.max(0, Math.round(y))));
  } catch {
    // Storage blocked: the root opens at the top, which is right enough.
  }
}
export function rememberedScroll(path: string): number {
  try {
    return Number(sessionStorage.getItem(SCROLL_KEY + path) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function TabBar({ active, start }: { active: RootPath; start: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const [, startNav] = useTransition();
  /** The tab pressed and not yet arrived, so the bar shows the destination selected from the touch (9.6). */
  const [going, setGoing] = useState<RootPath | null>(null);
  useEffect(() => {
    try {
      sessionStorage.setItem(ROOT_KEY, path);
    } catch {
      // Storage blocked (a private window): back lands on Now, which is always right enough.
    }
  }, [path]);
  // The root's scroll position, restored on arrival and remembered as it moves.
  useEffect(() => {
    const y = rememberedScroll(active);
    if (y > 0) window.scrollTo({ top: y, behavior: "instant" });
    rootMounted(active);
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => rememberScroll(active, window.scrollY));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [active]);
  // From Now, the other three roots are fetched while the phone is idle (9.6), the one place prefetch is on.
  useEffect(() => {
    if (active !== "/") return;
    const idle = typeof requestIdleCallback === "function" ? requestIdleCallback : (cb: () => void) => setTimeout(cb, 1500);
    const cancel = typeof cancelIdleCallback === "function" ? cancelIdleCallback : clearTimeout;
    const handle = idle(() => {
      for (const t of TABS) if (t.href !== "/") (router.prefetch as (href: string, options?: { kind: "auto" | "full" }) => void)(t.href, { kind: "full" });
    });
    return () => cancel(handle as number);
  }, [active, router]);

  const go = (href: RootPath) => {
    if (href === active) {
      // The current tab again: to the top, smoothly, and at once with Reduce Motion (9.6).
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduce ? "instant" : "smooth" });
      return;
    }
    setGoing(href);
    rememberScroll(active, window.scrollY);
    startNav(() => router.push(href, { scroll: false }));
  };
  const selected = going ?? rootFor(active);

  return (
    <>
      {/* Room under the content for the bar, and for the Start button floating 16px above it. */}
      <div aria-hidden="true" style={{ height: `calc(${TAB_BAR_HEIGHT + (start ? 88 : 16)}px + env(safe-area-inset-bottom))` }} />
      {start ? <StartButton /> : null}
      <FixedLayer name="tab-bar">
        {/* At the viewport's bottom edge. The installed app on iOS lays a page that fits the screen out short of it and pins this above the real edge, so every root is at least tall enough to scroll (`Screen root`, docs/decisions.md 2026-09-27, "The band, properly this time"). */}
        <nav aria-label="Main" data-tab-bar="" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto grid w-full max-w-[430px] grid-cols-4" style={{ height: TAB_BAR_HEIGHT }}>
            {TABS.map((t) => {
              const on = t.href === selected;
              return (
                <Link
                  key={t.href}
                  prefetch={false}
                  href={t.href}
                  aria-current={on ? "page" : undefined}
                  data-press="line"
                  onPointerDown={(e) => {
                    if (e.button !== 0 && e.pointerType === "mouse") return;
                    go(t.href);
                  }}
                  onClick={(e) => {
                    // The touch already acted (9.6); the click serves the keyboard and a modifier tap alone.
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                    e.preventDefault();
                    if (e.detail === 0) go(t.href);
                  }}
                  className={cn("relative flex flex-col items-center justify-center gap-1 tab-text press-line", on ? "font-semibold text-ink" : "font-medium text-ink-3")}
                >
                  <span className="relative">
                    <TabGlyph tab={t.href} />
                  </span>
                  <span>{t.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </FixedLayer>
    </>
  );
}

export function StartButton() {
  return (
    <FixedLayer name="start">
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px]">
        <Link prefetch href="/m/new" aria-label="Ask something" data-press="fill" data-start="" className="pointer-events-auto absolute right-5 bottom-[calc(80px+env(safe-area-inset-bottom))] flex h-14 w-14 items-center justify-center overflow-hidden rounded-pill bg-primary text-primary-foreground press-fill">
          <LinkPending look="control" />
          <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </Link>
      </div>
    </FixedLayer>
  );
}

export { ROOTS };

function TabGlyph({ tab }: { tab: RootPath }) {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {tab === "/" ? (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </>
      ) : tab === "/on" ? (
        <>
          <path d="M4 9a2 2 0 0 0 2-2V6h12v1a2 2 0 0 0 2 2v6a2 2 0 0 0-2 2v1H6v-1a2 2 0 0 0-2-2z" />
          <path d="M12 7v10" strokeDasharray="1.5 2.5" />
        </>
      ) : tab === "/people" ? (
        <>
          <circle cx="9" cy="9" r="3.4" />
          <path d="M3.5 19.5c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5" />
          <path d="M16 6.4a3.2 3.2 0 0 1 0 5.9" />
          <path d="M17.6 14.9c2 .6 3.4 2.2 3.9 4.6" />
        </>
      ) : (
        <>
          <circle cx="12" cy="8.5" r="3.6" />
          <path d="M5 20c.8-3.6 3.5-5.6 7-5.6s6.2 2 7 5.6" />
        </>
      )}
    </svg>
  );
}
