"use client";

import { useLinkStatus } from "next/link";

/**
 * A tap on a link answers at once. Every screen here renders on the server per request, so without this a tap
 * showed nothing until the next page arrived, and testers tapped again (docs/testing.md, session 2). Placed
 * inside a `<Link>`, it keeps the tapped thing pressed (9.4: a row to the ground of its place, a control at
 * 0.88) until the navigation lands, with no pulse: nothing moves to get attention (9.2).
 *
 * This is deliberately not a route-level `loading.tsx`. A loading boundary makes the response stream, and once
 * it streams the server can no longer answer 404 or redirect: "someone else gets a 404" quietly becomes a 200
 * with not-found content inside. Pending state on the link gives the same instant feedback and keeps the
 * status codes honest (docs/decisions.md 2026-09-19).
 */
export function LinkPending({ look = "row" }: { /** A row presses to the ground; a control (a chalk or lined button) dims. */ look?: "row" | "control" }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span aria-hidden="true" data-link-pending="" className={`pointer-events-none absolute inset-0 rounded-[inherit] ${look === "row" ? "bg-ground" : "bg-ground/12"}`} />;
}
