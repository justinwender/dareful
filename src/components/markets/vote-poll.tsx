"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Every six seconds for the first five minutes on the screen, then every thirty (docs/decisions.md, Phase 5). */
export const POLL_MS = 6_000;
export const POLL_SLOW_MS = 30_000;
export const POLL_SLOW_AFTER_MS = 5 * 60_000;

/**
 * A market in voting goes stale on screen: someone votes on their phone and everyone else keeps looking at
 * "1 of 2 has said yes" until they reload, and the installed app has no browser around the page to pull. So
 * while a locked market's screen is visible it asks, lightly, whether anything changed (`/api/m/[id]/pulse`,
 * Postgres only, never the indexer) and re-reads the screen only when the answer differs from what it shows.
 * It stops when the market settles or the screen is hidden, and slows down after five minutes.
 */
export function VotePoll({ dareId, pulse }: { dareId: string; pulse: string }) {
  const router = useRouter();
  const shown = useRef(pulse);
  useEffect(() => {
    shown.current = pulse;
  }, [pulse]);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const started = Date.now();
    const schedule = () => {
      if (stopped) return;
      timer = setTimeout(tick, Date.now() - started > POLL_SLOW_AFTER_MS ? POLL_SLOW_MS : POLL_MS);
    };
    const tick = async () => {
      timer = null;
      if (stopped) return;
      if (document.visibilityState !== "visible") return; // resumes on visibilitychange
      try {
        const r = await fetch(`/api/m/${dareId}/pulse`, { cache: "no-store" });
        if (r.status === 404) return; // not this person's to watch, or gone: stop quietly
        const body = (await r.json()) as { pulse: string; resolved: boolean };
        if (body.pulse !== shown.current) {
          shown.current = body.pulse;
          router.refresh();
        }
        if (body.resolved) return; // settled: the screen re-reads once above and the poll ends
      } catch {
        // A dropped request is a missed beat, nothing more.
      }
      schedule();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && timer === null && !stopped) schedule();
    };
    document.addEventListener("visibilitychange", onVisible);
    schedule();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [dareId, router]);
  return null;
}
