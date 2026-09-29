/**
 * The motion set (docs/design.md 9.1), for the timers that live in script: the same three durations, the stagger
 * and the loop that `globals.css` holds as custom properties. Nothing in the app moves on any other timing, and
 * a script that waits for a motion to end waits for exactly one of these. Pure.
 */
export const MOTION = {
  /** A press letting go; a label changing in place; the page being left. */
  quick: 120,
  /** Content arriving in a shell; a step of asking; a row collapsing; anything leaving the screen. */
  base: 200,
  /** Something going to a new place: a market opening, the ask layer rising, a sheet rising, a column growing. */
  travel: 320,
  /** Each of several things growing at once starts this much after the one before it. */
  stagger: 40,
  /** The three things that repeat (the runner, the on-its-way ring, the caret) repeat on this. */
  loop: 1200,
} as const;

/** When the `i`th of several things starts (9.1): ten columns take 680ms from the first starting to the last landing. */
export const staggerDelay = (i: number): number => Math.max(0, i) * MOTION.stagger;

/** How long a moment that grows `n` things takes, from the first starting to the last landing. */
export const staggeredTotal = (n: number): number => (n <= 0 ? 0 : MOTION.travel + (n - 1) * MOTION.stagger);

/**
 * The slow-load stages, one set of rules for a tap that does something and a tap that goes somewhere (5.2, 9.4,
 * reconciled 2026-09-28): nothing under 300ms, the runner from 300ms, "Still going." at three seconds, and at ten
 * the block with "Try again". The words differ by what is waited on (9.8's "Still writing."); the stages do not.
 */
export type WaitStage = "none" | "pending" | "still" | "block";
export const RUNNER_MS = 300;
export const STILL_GOING_MS = 3_000;
export const TRY_AGAIN_MS = 10_000;
export function waitStage(waiting: boolean, heldMs: number): WaitStage {
  if (!waiting) return "none";
  if (heldMs >= TRY_AGAIN_MS) return "block";
  if (heldMs >= STILL_GOING_MS) return "still";
  if (heldMs >= RUNNER_MS) return "pending";
  return "none";
}

/** The pinned sheet settling (9.9): base if less than half the distance is left, travel otherwise. */
export function settleDuration(remainingPx: number, distancePx: number): number {
  if (distancePx <= 0) return MOTION.base;
  return Math.abs(remainingPx) < distancePx / 2 ? MOTION.base : MOTION.travel;
}

/** Past either of the sheet's heights a drag moves a third of the finger's travel, 16px at most (9.9). */
export function overscroll(px: number): number {
  const third = px / 3;
  return Math.max(-16, Math.min(16, third));
}
