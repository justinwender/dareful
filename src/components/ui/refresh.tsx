"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pullStartsHere } from "./handle";
import { scrollTopOf } from "@/lib/ui/scroller";
import { TALLY_TIMING } from "@/lib/ui/opening";
import { PullTally } from "./pull-tally";

/** How far a finger has to pull from the top before letting go re-reads the screen. */
export const PULL_TO_REFRESH_PX = 72;
/** A screen that was hidden this briefly is not re-read on return: a flick to the app switcher and back changes nothing. */
const RETURN_AFTER_MS = 2_000;

/**
 * Refresh (docs/decisions.md, Phase 5), three pieces, because pulling only helps someone who thinks to pull:
 *
 *   1. Pull-to-refresh from the top of any scrolling screen. The installed app has no browser around the page, so
 *      the gesture does not exist unless the app provides it. The tally under the status band draws with the pull,
 *      crosses as it is let go past the threshold, counts while the screen is being re-read and settles once it has (`PullTally`;
 *      the field round's 3.2, built in the games-and-the-reveal round).
 *   2. A re-read whenever the app comes back to the foreground after more than a moment away, which covers
 *      switching to Messages and back, and a page restored from the back-forward cache. Nobody pulled, so it runs
 *      the 2px line under the status band (`TopRunner`) while it reads, never the tally.
 *
 * Both re-read the current screen through the router, which is one server render of exactly what is shown and
 * never a reload. A touch that starts on a sheet, pinned or modal, or in the ask layer belongs to it
 * (`pullStartsHere`; 5.5 as amended 2026-09-29): a drag down on a sheet's handle at the top of a page used to
 * fill the line and re-read the screen as the sheet lowered.
 */
export function Refresh() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pull, setPull] = useState(0);
  const pullRef = useRef(0);
  const startY = useRef<number | null>(null);
  const hiddenAt = useRef<number | null>(null);
  const refresh = () => start(() => router.refresh());
  // Whether the read in flight was asked for by a pull: only a pull draws the tally (the field round's 3.2); a re-read
  // nobody pulled for (a return to the app, a page back from the cache) runs the 2px line, as it always has (5.5).
  const [byPull, setByPullState] = useState(false);
  const byPullRef = useRef(false);
  const setByPull = (v: boolean) => {
    byPullRef.current = v;
    setByPullState(v);
  };
  // Once the screen has been read again the tally settles and retracts over a stroke's time, then goes.
  const [settling, setSettling] = useState(false);
  const wasPending = useRef(false);
  // Before paint, so the frame between the count and the settle is never drawn empty (a blink, on the simulator).
  useLayoutEffect(() => {
    if (pending) wasPending.current = true;
    else if (wasPending.current) {
      wasPending.current = false;
      if (!byPullRef.current) return;
      setSettling(true);
      const t = setTimeout(() => {
        setSettling(false);
        setByPull(false);
      }, TALLY_TIMING.stroke * 2);
      return () => clearTimeout(t);
    }
  }, [pending]);
  const setPulled = (p: number) => {
    pullRef.current = p;
    setPull(p);
  };
  // Letting go with all five drawn holds the finished tally until the read is under way, so no frame between the two is empty.
  const [letGo, setLetGo] = useState(false);
  useEffect(() => {
    if (!letGo) return;
    const t = setTimeout(() => setLetGo(false), TALLY_TIMING.stroke);
    return () => clearTimeout(t);
  }, [letGo]);

  useEffect(() => {
    const onPage = (t: EventTarget | null) => !(t instanceof Element) || pullStartsHere(t.closest("[data-layer]")?.getAttribute("data-layer") ?? null, t.closest("[role=dialog]") !== null);
    const onStart = (e: TouchEvent) => {
      startY.current = scrollTopOf() <= 0 && e.touches.length === 1 && onPage(e.target) ? (e.touches[0]?.clientY ?? null) : null;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const dy = (e.touches[0]?.clientY ?? 0) - startY.current;
      if (dy <= 0 || scrollTopOf() > 0) {
        setPulled(0);
        return;
      }
      // Past the threshold all five stay drawn; the pull itself follows the finger with some give.
      setPulled(Math.min(1, dy / PULL_TO_REFRESH_PX));
    };
    const onEnd = () => {
      const far = pullRef.current >= 1;
      startY.current = null;
      setPulled(0);
      if (far) {
        setByPull(true);
        setLetGo(true);
        refresh();
      }
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
      if (hiddenAt.current !== null && Date.now() - hiddenAt.current >= RETURN_AFTER_MS) {
        setByPull(false);
        refresh();
      }
      hiddenAt.current = null;
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      setByPull(false);
      refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, []);

  if (pull === 0 && !pending && !settling && !letGo) return null;
  if (pending && !byPull && !letGo) return <TopRunner state="running" />;
  // The tally (3.2, the touch-ups round): all five drawn with the pull, the fifth redrawing while the screen is read again, settling once it has.
  return <PullTally phase={letGo || pending ? "reloading" : settling ? "settling" : "pulling"} pull={pull} />;
}

/** The 2px line under the status band (5.5, 9.4): filling with a pull, or running while something is being read. */
export function TopRunner({ state, pull = 1 }: { state: "running" | "pulling"; pull?: number }) {
  return (
    <div aria-hidden="true" data-refresh={state} data-fixed="top" className="pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top)] z-40 h-[2px] overflow-hidden">
      {state === "running" ? <span className="absolute inset-y-0 w-1/3 bg-ink motion-loop-runner" /> : <span className="absolute inset-y-0 left-1/2 -translate-x-1/2 bg-ink" style={{ width: `${Math.round(pull * 100)}%` }} />}
    </div>
  );
}
