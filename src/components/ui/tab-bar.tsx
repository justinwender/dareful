"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { LinkPending } from "./link-pending";
import { StartButton } from "./start-sheet";
import { ROOT_KEY, type RootPath } from "@/lib/ui/root";
import { cn } from "@/lib/utils";

/**
 * The shell (docs/design.md section 6): three destinations and one button. The bar renders on the three roots and
 * nowhere else; a task screen hides it and puts its one move where the bar would be. Each root renders the bar
 * itself, which is what keeps it off every other screen, and remembers itself as the root that "back" lands on.
 *
 * The citron dot on Now means one thing: something with a clock is waiting on this person. No number, ever.
 */
export const TAB_BAR_HEIGHT = 64;
const TABS: Array<{ href: RootPath; label: string }> = [
  { href: "/", label: "Now" },
  { href: "/people", label: "People" },
  { href: "/you", label: "You" },
];

export function TabBar({ active, live, start }: { active: RootPath; live: boolean; start: boolean }) {
  const path = usePathname();
  useEffect(() => {
    try {
      sessionStorage.setItem(ROOT_KEY, path);
    } catch {
      // Storage blocked (a private window): back lands on Now, which is always right enough.
    }
  }, [path]);
  return (
    <>
      {/* Room under the content for the bar, and for the Start button floating 16px above it. */}
      <div aria-hidden="true" style={{ height: `calc(${TAB_BAR_HEIGHT + (start ? 88 : 16)}px + env(safe-area-inset-bottom))` }} />
      {start ? <StartButton /> : null}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid w-full max-w-[430px] grid-cols-3" style={{ height: TAB_BAR_HEIGHT }}>
          {TABS.map((t) => {
            const on = t.href === active;
            const dot = t.href === "/" && live;
            return (
              <Link key={t.href} prefetch={false} href={t.href} aria-current={on ? "page" : undefined} className={cn("relative flex flex-col items-center justify-center gap-1 text-[13px] leading-none", on ? "font-semibold text-ink" : "font-medium text-ink-3")}>
                <LinkPending />
                <span className="relative">
                  <TabGlyph tab={t.href} />
                  {dot ? <span aria-hidden="true" className="absolute -top-px -right-[5px] h-1.5 w-1.5 rounded-pill bg-live" /> : null}
                </span>
                <span>{t.label}</span>
                {dot ? <span className="sr-only">, something with a clock is waiting on you</span> : null}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

function TabGlyph({ tab }: { tab: RootPath }) {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {tab === "/" ? (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
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
