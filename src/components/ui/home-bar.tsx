"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LinkPending } from "./link-pending";

/**
 * A way home from anywhere, under the thumb. An installed app has no browser chrome, the top-left back control is
 * the hardest place on a phone to reach one-handed, and taking the group list and sign-out off home removed most
 * of the incidental ways back without putting a deliberate one in their place (docs/testing.md, the three-person
 * session). This is that one: a bar at the bottom of every screen but home, holding one thing.
 *
 * Deliberately the smallest structure that fixes it. A navigation architecture for the whole feature set is being
 * designed in parallel; this holds one destination so it can be replaced without anything depending on it.
 */
export const HOME_BAR_HEIGHT = 52;

export function HomeBar({ signedIn }: { signedIn: boolean }) {
  const path = usePathname();
  if (!signedIn || path === "/" || path === "/welcome") return null;
  return (
    <>
      <div aria-hidden="true" style={{ height: `calc(${HOME_BAR_HEIGHT}px + env(safe-area-inset-bottom))` }} />
      <nav aria-label="Home" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ground pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-[430px] justify-center px-5" style={{ height: HOME_BAR_HEIGHT }}>
          <Link prefetch={false} href="/" className="relative inline-flex h-12 min-w-[120px] items-center justify-center gap-2 self-center rounded-pill px-5 text-[15px] font-semibold text-ink-2">
            <LinkPending />
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 11l8-7 8 7" />
              <path d="M6 10v9h12v-9" />
            </svg>
            Home
          </Link>
        </div>
      </nav>
    </>
  );
}
