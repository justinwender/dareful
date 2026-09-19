/*
 * Dareful's service worker does two things and nothing else: shows a notification when one is pushed, and opens
 * the question it is about when it is tapped. No caching, no offline shell, no fetch handler: every screen is
 * rendered per request for the person asking, and a cached one would be somebody's stale ledger.
 */
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

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || "/";
  // Only ever this app's own pages, whatever the payload said.
  const target = new URL(raw, self.location.origin);
  const url = target.origin === self.location.origin ? target.href : self.location.origin + "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) if ("focus" in w && "navigate" in w) return w.navigate(url).then((c) => (c ? c.focus() : undefined));
      return self.clients.openWindow(url);
    }),
  );
});
