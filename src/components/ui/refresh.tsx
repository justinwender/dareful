"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** How far a finger has to pull from the top before letting go re-reads the screen. */
export const PULL_TO_REFRESH_PX = 72;
/** A screen that was hidden this briefly is not re-read on return: a flick to the app switcher and back changes nothing. */
const RETURN_AFTER_MS = 2_000;

/**
 * Refresh (docs/decisions.md, Phase 5), three pieces, because pulling only helps someone who thinks to pull:
 *
 *   1. Pull-to-refresh from the top of any scrolling screen. The installed app has no browser around the page, so
 *      the gesture does not exist unless the app provides it. A 2px line under the status band fills with the
 *      pull, in ink, and runs while the screen is being re-read, the same runner a working button carries (5.2).
 *   2. A re-read whenever the app comes back to the foreground after more than a moment away, which covers
 *      switching to Messages and back, and a page restored from the back-forward cache.
 *
 * Both re-read the current screen through the router, which is one server render of exactly what is shown and
 * never a reload. A touch that starts inside a modal sheet belongs to the sheet.
 */
export function Refresh() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pull, setPull] = useState(0);
  const pullRef = useRef(0);
  const startY = useRef<number | null>(null);
  const hiddenAt = useRef<number | null>(null);
  const refresh = () => start(() => router.refresh());
  const setPulled = (p: number) => {
    pullRef.current = p;
    setPull(p);
  };

  useEffect(() => {
    const inDialog = (t: EventTarget | null) => t instanceof Element && t.closest("[role=dialog]") !== null;
    const onStart = (e: TouchEvent) => {
      startY.current = window.scrollY <= 0 && e.touches.length === 1 && !inDialog(e.target) ? (e.touches[0]?.clientY ?? null) : null;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const dy = (e.touches[0]?.clientY ?? 0) - startY.current;
      if (dy <= 0 || window.scrollY > 0) {
        setPulled(0);
        return;
      }
      // Past the threshold the line stays full; the pull itself follows the finger with some give.
      setPulled(Math.min(1, dy / PULL_TO_REFRESH_PX));
    };
    const onEnd = () => {
      const far = pullRef.current >= 1;
      startY.current = null;
      setPulled(0);
      if (far) refresh();
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the listeners read refs; the router and the transition are stable
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      if (hiddenAt.current !== null && Date.now() - hiddenAt.current >= RETURN_AFTER_MS) refresh();
      hiddenAt.current = null;
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, []);

  if (pull === 0 && !pending) return null;
  return (
    <div aria-hidden="true" data-refresh={pending ? "running" : "pulling"} className="pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top)] z-40 h-[2px] overflow-hidden">
      {pending ? (
        <span className="absolute inset-y-0 w-1/3 bg-ink motion-safe:animate-[button-runner_1.2s_linear_infinite]" />
      ) : (
        <span className="absolute inset-y-0 left-1/2 -translate-x-1/2 bg-ink" style={{ width: `${Math.round(pull * 100)}%` }} />
      )}
    </div>
  );
}
