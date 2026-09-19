"use client";

import { useEffect, useSyncExternalStore } from "react";
import { dayLabel, whenLabel } from "@/lib/ui/copy";

const ZONE_COOKIE = "dareful_tz";

/** The current minute, as the browser sees it; null on the server, where there is no viewer clock. */
function subscribe(onChange: () => void): () => void {
  const id = window.setInterval(onChange, 30_000);
  return () => window.clearInterval(id);
}
const minuteNow = () => Math.floor(Date.now() / 60_000);
const noMinute = () => null;

/**
 * A timestamp in the viewer's zone. The server paints it in the zone the browser last reported (`zone`); once
 * mounted, the browser recomputes in its own zone and, if the server's guess was wrong or missing, remembers
 * the right one for the next request. `style` picks relative ("yesterday") or a plain day ("Oct 2").
 */
export function When({ iso, zone, serverNow, style = "relative" }: { iso: string; zone: string; serverNow: number; style?: "relative" | "day" }) {
  const minute = useSyncExternalStore(subscribe, minuteNow, noMinute);
  const mounted = minute !== null;
  const mine = mounted ? Intl.DateTimeFormat().resolvedOptions().timeZone || zone : zone;

  useEffect(() => {
    if (mine !== zone) document.cookie = `${ZONE_COOKIE}=${encodeURIComponent(mine)}; path=/; max-age=31536000; samesite=lax`;
  }, [mine, zone]);

  const at = new Date(iso);
  const now = new Date(mounted ? minute * 60_000 + 59_999 : serverNow);
  return <time dateTime={iso}>{style === "day" ? dayLabel(at, mine) : whenLabel(at, now, mine)}</time>;
}
