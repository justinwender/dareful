/**
 * The viewer's time zone, server side. Timestamps are stored UTC and rendered in the viewer's zone, and a
 * server cannot know that zone on its own, so the browser reports it once in a cookie (`ZoneReporter`, on
 * every screen). The cookie is a display convenience and nothing else: it is validated, never stored, and a
 * missing or bad value falls back to UTC for the first draw only, which the reporter then asks for again.
 */
import { cookies } from "next/headers";
import { validZone } from "./copy";
import { ZONE_COOKIE } from "./zone-report";

export { ZONE_COOKIE };

export async function viewerZone(): Promise<string> {
  const raw = (await cookies()).get(ZONE_COOKIE)?.value;
  return validZone(raw ? decodeURIComponent(raw) : null) ?? "UTC";
}

/** What a server-rendered timestamp needs: the viewer's zone, and one "now" for the whole request. */
export type ViewerClock = { zone: string; now: number };

export async function viewerClock(): Promise<ViewerClock> {
  return { zone: await viewerZone(), now: Date.now() };
}
