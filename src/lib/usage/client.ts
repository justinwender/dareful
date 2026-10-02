"use client";

import { type ClientEventName, type EventProps } from "./events";

/**
 * The browser's report of a usage event (the field round, 2026-10-02): one request to `/api/usage`, fire and
 * forget, kept alive through a page leaving. Nothing here waits for an answer, retries or shows anything: a
 * count that does not arrive is a count missed, never a screen's problem. The requests go one after another,
 * because the first one a device ever sends is answered with the device's cookie, and two sent at once (a link
 * opened and a notification's tap, on the same first paint) would each be given a device of their own.
 */
let queue: Promise<unknown> = Promise.resolve();

export function report<N extends ClientEventName>(name: N, props: EventProps<N>, about: { dareId?: string | null; gameId?: string | null } = {}): void {
  if (typeof window === "undefined" || typeof fetch !== "function") return;
  const body = JSON.stringify({ name, props, ...(about.dareId ? { dareId: about.dareId } : {}), ...(about.gameId ? { gameId: about.gameId } : {}) });
  queue = queue.then(() => fetch("/api/usage", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true, credentials: "same-origin" })).catch(() => undefined);
}

/** Whether this page runs as the installed app (a home-screen web app) rather than in a browser tab. */
export function installedHere(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}
