/**
 * Fetching on the touch (docs/design.md 9.4, amended 2026-09-29; docs/decisions.md 2026-09-29): a row that opens
 * a market or a game starts its screen's request when the finger lands, not when it lifts, so the screen has
 * usually arrived by the time the opening has run. The row still opens on release; only the asking is early.
 *
 * What is asked for depends on what the router knows. A whole screen asked for on the touch is used by the tap
 * that follows only while the router still knows the route's shape, which it learns from any request of that
 * kind and keeps for thirty seconds (`staleTimes` in next.config.ts). Asked for without that, the screen is
 * rendered twice and lands later than it does today. So a touch asks for the whole screen ("full") only inside
 * a window that opens 800ms after the router certainly fetched the shape and closes 25 seconds after; outside
 * it, the touch asks for the shape alone ("auto"), which is cheap and opens the window for the next touch. The
 * rule is one-sided on purpose: it may miss a head start, and it never claims the shape is known when it may
 * not be. Pure but for the record it keeps, in the manner of `roots-store.ts`, so a test can hold it.
 */
export type TouchKind = "market" | "game";
export type FetchKind = "full" | "auto";

export const WARM_AFTER_MS = 800;
export const WARM_FOR_MS = 25_000;
/** The router's thirty seconds and the shape's own round trip: a quiet this long means the shape has to be learned again. */
export const QUIET_MS = 33_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Which kind of screen a row's address opens: a market, a game page, or neither (asking, a root, a person). */
export function touchKindOf(href: string | null | undefined): TouchKind | null {
  if (!href) return null;
  const path = (href.split(/[?#]/)[0] ?? "").replace(/\/+$/, "");
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "m" && parts.length === 2 && UUID.test(parts[1] ?? "")) return "market";
  if (parts[0] === "on" && (parts.length === 2 || parts.length === 3) && (parts[1] ?? "").length > 0) return "game";
  return null;
}

type Known = { anchorAt: number | null; lastAt: number | null };
const known: Record<TouchKind, Known> = { market: { anchorAt: null, lastAt: null }, game: { anchorAt: null, lastAt: null } };

function record(k: Known, now: number): void {
  // Only a request after a quiet teaches the router the shape afresh: one it answered from what it held teaches nothing.
  if (k.lastAt === null || now - k.lastAt >= QUIET_MS) k.anchorAt = now;
  k.lastAt = now;
}

/** A finger has landed on a row of this kind: what to ask for. */
export function touched(kind: TouchKind, now: number = Date.now()): FetchKind {
  const k = known[kind];
  const warm = k.anchorAt !== null && now - k.anchorAt >= WARM_AFTER_MS && now - k.anchorAt < WARM_FOR_MS;
  record(k, now);
  return warm ? "full" : "auto";
}

/** A screen of this kind has arrived by a navigation inside the app: the router fetched its shape to get there. */
export function landedOn(kind: TouchKind, now: number = Date.now()): void {
  record(known[kind], now);
}

/** The router let go of what it held (a re-read, an action that changed something): the shape has to be learned again. */
export function invalidated(kind: TouchKind): void {
  known[kind].anchorAt = null;
}

export function resetTouchFetch(): void {
  for (const k of Object.values(known)) {
    k.anchorAt = null;
    k.lastAt = null;
  }
}

/** The router's prefetch with the one option the app relies on, in one place, since the framework's own types carry it and its reference does not. */
export type Prefetch = (href: string, options?: { kind: FetchKind; onInvalidate?: () => void }) => void;
