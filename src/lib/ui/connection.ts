/**
 * Whether the phone is offline, settled by a request when the browser's own word says so (the first-contact round,
 * 2026-10-04). iOS 27's WebKit, on the simulator, says offline with the network up, and the app took that word
 * alone: the offline bar stood on every screen and every tap was refused with "You're offline". Now, when the
 * browser says offline, a HEAD request to this origin decides. An answer means the word was wrong, and it is not
 * believed again on this page until the browser says offline anew; a failure, or nothing within three seconds,
 * means offline. A phone that really is offline fails the request at once, so nothing waits on the check.
 */

/** A small file this origin always serves, asked for with HEAD and no cache. */
export const PROBE_PATH = "/favicon.svg";
/** How long the request may take before the phone counts as offline. */
export const PROBE_MS = 3000;

let wordWrong = false;
let confirmed = false;
let listening = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** The browser says offline anew (the word changed): it is believed again until a request says otherwise. */
export function browserWentOffline(): void {
  wordWrong = false;
}

/** The browser's word for the connection, unless a request on this page has shown it wrong. */
export function browserSaysOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false && !wordWrong;
}

/** Whether this origin answers a HEAD request within `ms`. Never throws. */
export async function reachable(fetcher: typeof fetch = fetch, ms: number = PROBE_MS): Promise<boolean> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), ms);
  try {
    await fetcher(PROBE_PATH, { method: "HEAD", cache: "no-store", signal: stop.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Offline, settled: false at once when the browser says online; when it says offline, whether this origin fails to answer. */
export async function offlineSettled(probe: () => Promise<boolean> = () => reachable()): Promise<boolean> {
  if (!browserSaysOffline()) return false;
  if (await probe()) {
    wordWrong = true;
    return false;
  }
  return true;
}

function recheck(): void {
  void offlineSettled().then((off) => {
    if (off === confirmed) return;
    confirmed = off;
    notify();
  });
}

function listen(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("online", recheck);
  window.addEventListener("offline", () => (browserWentOffline(), recheck()));
}

/** For `useSyncExternalStore`: the offline bar's subscription, which settles the word when it first subscribes. */
export function subscribeOffline(onChange: () => void): () => void {
  listen();
  listeners.add(onChange);
  if (listeners.size === 1) recheck();
  return () => void listeners.delete(onChange);
}

/** Offline as settled by the last check (the bar's snapshot): never before a request has failed. */
export function offlineConfirmed(): boolean {
  return confirmed;
}
