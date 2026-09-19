"use client";

import { useLinkStatus } from "next/link";

/**
 * A tap on a link answers at once. Every screen here renders on the server per request, so without this a tap
 * showed nothing until the next page arrived, and testers tapped again (docs/testing.md, session 2). Placed
 * inside a `<Link>`, it dims the tapped thing and pulses it (docs/design.md 3.8: no spinner, an opacity pulse)
 * until the navigation lands.
 *
 * This is deliberately not a route-level `loading.tsx`. A loading boundary makes the response stream, and once
 * it streams the server can no longer answer 404 or redirect: "someone else gets a 404" quietly becomes a 200
 * with not-found content inside. Pending state on the link gives the same instant feedback and keeps the
 * status codes honest (docs/decisions.md 2026-09-19).
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span aria-hidden="true" className="pointer-events-none absolute inset-0 animate-[link-pending_1.2s_ease-in-out_infinite] rounded-[inherit] bg-ground/45" />;
}
