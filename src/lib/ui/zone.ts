/**
 * The viewer's time zone, server side. Timestamps are stored UTC and rendered in the viewer's zone, and a
 * server cannot know that zone on its own, so the browser reports it once in a cookie (`When` sets it). The
 * cookie is a display convenience and nothing else: it is validated, never stored, and a missing or bad value
 * falls back to UTC for the first paint only, after which the browser corrects the text itself.
 */
import { cookies } from "next/headers";
import { validZone } from "./copy";

export const ZONE_COOKIE = "dareful_tz";

export async function viewerZone(): Promise<string> {
  const raw = (await cookies()).get(ZONE_COOKIE)?.value;
  return validZone(raw ? decodeURIComponent(raw) : null) ?? "UTC";
}

/** What a server-rendered timestamp needs: the viewer's zone, and one "now" for the whole request. */
export type ViewerClock = { zone: string; now: number };

export async function viewerClock(): Promise<ViewerClock> {
  return { zone: await viewerZone(), now: Date.now() };
}
