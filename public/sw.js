/*
 * Dareful's service worker does two things and nothing else: shows a notification when one is pushed, and opens
 * the question it is about when it is tapped. No caching of pages, no offline shell, no fetch handler: every
 * screen is rendered per request for the person asking, and a cached one would be somebody's stale ledger.
 *
 * Opening the right question has three paths, because phones do not agree on any one of them:
 *   1. The app is open or backgrounded: focus it, THEN navigate it. Focusing without navigating is how a tap
 *      opened whatever question the phone was last on (docs/decisions.md 2026-09-20).
 *   2. Navigating is refused or missing (iOS does both at times): tell the page where to go, and it goes.
 *   3. The app is fully closed: open a window at the address. Some installed apps ignore the address and open
 *      at their start page, so the address is also left where the page looks for it the moment it starts.
 * The one thing kept in a cache is that address, for a minute.
 */
const PENDING_CACHE = "dareful-pending-v1";
const PENDING_KEY = "/__pending-notification";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let notice = { title: "Dareful", body: "Something happened in one of your questions.", url: "/" };
  try {
    if (event.data) notice = Object.assign(notice, event.data.json());
  } catch (_) {
    // A payload that is not JSON still deserves a notification; the default above is it.
  }
  event.waitUntil(self.registration.showNotification(String(notice.title).slice(0, 120), { body: String(notice.body).slice(0, 240), data: { url: String(notice.url) }, icon: "/icons/192", badge: "/icons/96", tag: String(notice.url) }));
});

/** Only ever this app's own pages, whatever the payload said. */
function ownUrl(raw) {
  try {
    const target = new URL(raw || "/", self.location.origin);
    return target.origin === self.location.origin ? target.href : self.location.origin + "/";
  } catch (_) {
    return self.location.origin + "/";
  }
}

async function remember(url) {
  const cache = await self.caches.open(PENDING_CACHE);
  await cache.put(PENDING_KEY, new Response(JSON.stringify({ url, at: Date.now() }), { headers: { "content-type": "application/json" } }));
}

async function openOn(url) {
  await remember(url).catch(() => undefined);
  const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const win = wins.find((w) => "focus" in w);
  if (!win) return self.clients.openWindow(url);
  const focused = await win.focus().catch(() => win);
  const target = focused || win;
  try {
    if ("navigate" in target) {
      const moved = await target.navigate(url);
      if (moved) return moved;
    }
  } catch (_) {
    // Refused. The page is told instead, below.
  }
  target.postMessage({ type: "dareful:open", url });
  return target;
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(openOn(ownUrl(event.notification.data && event.notification.data.url)));
});
