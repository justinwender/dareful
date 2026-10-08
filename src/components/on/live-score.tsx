"use client";

import { useEffect, useState } from "react";
import { TeamStamp } from "@/components/ledger/team-stamp";
import { LIVE_EVERY_MS, liveLine, type LiveScore as Live } from "@/lib/sports/live-words";
import type { TeamFace } from "@/lib/ui/team";

/**
 * The live score on a game question's screen (docs/design.md 3.24; the games-and-the-reveal round, section 3): the two
 * 20px team stamps, the score in `body` 600 and where the game is in `caption`, read every thirty seconds while the
 * screen is in view and never animated. Nothing when the feed cannot be read, and no more reads once it is final.
 */
export function LiveScore({ gameId, away, home, initial }: { gameId: string; away: TeamFace; home: TeamFace; initial: Live | null }) {
  const [live, setLive] = useState<Live | null>(initial);
  const final = live?.final === true;
  useEffect(() => {
    if (final) return;
    let stopped = false;
    const read = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch(`/api/live/${gameId}`, { cache: "no-store" });
        const j = (await r.json()) as { live: Live | null };
        if (!stopped) setLive(j.live ?? null);
      } catch {
        if (!stopped) setLive(null);
      }
    };
    void read();
    const timer = setInterval(() => void read(), LIVE_EVERY_MS);
    const onShow = () => {
      if (document.visibilityState === "visible") void read();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [gameId, final]);
  if (!live) return null;
  return (
    <section className="flex items-center justify-between gap-3" data-live-score={live.final ? "final" : "live"}>
      <span className="flex min-w-0 items-center gap-2">
        <span className="inline-flex shrink-0 items-center gap-1">
          <TeamStamp team={away} size={20} />
          <TeamStamp team={home} size={20} />
        </span>
        <span className="truncate text-body-strong tabular-nums text-ink">{liveLine(live, away.name, home.name)}</span>
      </span>
      {live.where ? <span className="shrink-0 text-caption text-ink-2">{live.where}</span> : null}
    </section>
  );
}
