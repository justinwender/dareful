"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const PENDING_CACHE = "dareful-pending-v1";
const PENDING_KEY = "/__pending-notification";
const FRESH_MS = 60_000;

/**
 * The page's half of opening the right question from a notification (see public/sw.js). The worker focuses and
 * navigates the app when it can. When it cannot, it tells the page, or leaves the address where this looks the
 * moment the app starts or comes back to the front. An address is used once, only if it is this app's own and
 * was left in the last minute, so an old tap can never yank someone across the app later.
 */
export function OpenFromNotification() {
  const router = useRouter();
  useEffect(() => {
    if (typeof window === "undefined" || !("caches" in window)) return;
    const go = (raw: unknown) => {
      if (typeof raw !== "string") return;
      let target: URL;
      try {
        target = new URL(raw, window.location.origin);
      } catch {
        return;
      }
      if (target.origin !== window.location.origin) return;
      const here = window.location.pathname + window.location.search + window.location.hash;
      const there = target.pathname + target.search + target.hash;
      if (there !== here) router.push(there);
    };
    const collect = async () => {
      try {
        const cache = await window.caches.open(PENDING_CACHE);
        const hit = await cache.match(PENDING_KEY);
        if (!hit) return;
        await cache.delete(PENDING_KEY);
        const left = (await hit.json()) as { url?: unknown; at?: unknown };
        if (typeof left.at === "number" && Date.now() - left.at < FRESH_MS) go(left.url);
      } catch {
        // No cache, or nothing readable in it: there is nowhere to go, which is fine.
      }
    };
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: unknown; url?: unknown } | null;
      if (data && data.type === "dareful:open") {
        void window.caches.open(PENDING_CACHE).then((c) => c.delete(PENDING_KEY)).catch(() => undefined);
        go(data.url);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void collect();
    };
    void collect();
    navigator.serviceWorker?.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);
  return null;
}
