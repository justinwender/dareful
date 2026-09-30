/**
 * Traversals (docs/design.md 9.7, amended 2026-09-29): a move through the history that the app did not make
 * by a tap of its own, above all the phone's swipe from the edge, which the installed app gets for free and
 * which the phone animates itself. When the phone has already brought a screen in, none of the app's motion runs
 * on top of it: no view transition, no arrival, no fade of what arrives, no layer rising.
 *
 * This is the one place that knows. A traversal is told apart from a tap by the browser's own flag on the
 * `popstate` event (`hasUAVisualTransition`, read as `=== true` since it is undefined where unsupported), and
 * where the flag is missing by a touch that began within 30px of a side edge and was never released to the page:
 * a touch the phone took for its gesture ends in a cancel, never in a release. Pure but for the one record it
 * keeps, in the manner of `roots-store.ts`, so a test can hold the rule.
 */
export const EDGE_PX = 30;
/** How long after a traversal a screen mounting at its path counts as landing from it. */
export const LANDING_MS = 5_000;

type Landing = { path: string; at: number; browser: boolean };
let edgeTouchAt: number | null = null;
let landing: Landing | null = null;

/** A touch went down: remembered only when it began at a side edge, where the phone's swipe begins. */
export function touchBegan(x: number, width: number, now: number = Date.now()): void {
  edgeTouchAt = x <= EDGE_PX || x >= width - EDGE_PX ? now : null;
}

/** The touch came up on the page, so the page kept it: a tap, or the page's own drag. */
export function touchReleased(): void {
  edgeTouchAt = null;
}

/** The history moved (a `popstate`): `flag` is the browser's word that it animated the move itself. */
export function traversed(flag: boolean | undefined, path: string, now: number = Date.now()): void {
  const byEdge = edgeTouchAt !== null && now - edgeTouchAt < LANDING_MS;
  landing = { path, at: now, browser: flag === true || byEdge };
  edgeTouchAt = null;
}

/** Whether a screen at this path is landing from a traversal: the app's motion stays out of its way. */
export function landingByTraversal(path: string, now: number = Date.now()): boolean {
  return landing !== null && landing.path === path && now - landing.at < LANDING_MS;
}

/** The same, and the browser animated it. */
export function browserAnimated(path: string, now: number = Date.now()): boolean {
  return landingByTraversal(path, now) && landing?.browser === true;
}

/** The screen has landed: the next arrival is its own. */
export function landed(): void {
  landing = null;
}

export function resetTraversal(): void {
  edgeTouchAt = null;
  landing = null;
}

/** The mark on `html` while a traversal lands, which the stylesheet reads to hold every arrival still. */
export const TRAVERSAL_ATTR = "data-traversal";
