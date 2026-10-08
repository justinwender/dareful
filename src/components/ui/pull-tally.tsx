"use client";

import { pullTallyCss, TALLY_STROKES } from "@/lib/ui/opening";

/** The tally's size on a pull: the logo's box drawn at this many pixels. */
export const PULL_TALLY_PX = 32;
/** The ground around it, so its patch is 44px, a touch target's size, and the tally keeps its place under the status band. */
export const TALLY_PATCH_PAD = 6;

export type TallyPhase = "pulling" | "crossing" | "loading" | "settling";

/** How much of each upright shows at a pull from 0 to 1 (the threshold): one at a time, top to bottom, the fourth whole at the threshold. Pure. */
export function uprightsAt(pull: number): number[] {
  const p = Math.min(1, Math.max(0, pull));
  return [0, 1, 2, 3].map((i) => Math.min(1, Math.max(0, p * 4 - i)));
}

/**
 * The tally on pull-to-refresh (the field round's 3.2; the games-and-the-reveal round): under the status band, in ink,
 * the logo's five strokes at a pull's size. Pulling draws the uprights with the finger; letting go past the threshold the
 * fifth crosses them; while the screen is read again the count redraws in a loop (`pullTallyCss`); once it has arrived the
 * whole tally settles and retracts. Under Reduce Motion the stylesheet draws it whole, a still mark that fades.
 */
export function PullTally({ phase, pull }: { phase: TallyPhase; pull: number }) {
  const shown = uprightsAt(pull);
  // The fifth crosses as the pull is let go past the threshold (3.2), never while the finger still holds it.
  const crossed = phase !== "pulling";
  const scale = PULL_TALLY_PX / 120;
  const half = PULL_TALLY_PX / 2 + TALLY_PATCH_PAD;
  return (
    <div aria-hidden="true" data-fixed="top" className="pointer-events-none fixed inset-x-0 z-40 flex justify-center" style={{ top: `calc(env(safe-area-inset-top) + ${12 - TALLY_PATCH_PAD}px)` }}>
      <style>{pullTallyCss()}</style>
      {/* Its own patch of ground, painted as the status band is with the grain lined up to the screen's: let go, the page
          springs back under the tally, and its strokes must never cross a line of text (the device notice, the guest line). */}
      <div data-tally-patch="" className="grain rounded-card" style={{ padding: TALLY_PATCH_PAD, backgroundPosition: `calc(${half}px - 50vw) calc(${TALLY_PATCH_PAD - 12}px - env(safe-area-inset-top))`, opacity: phase === "settling" ? 0 : phase === "pulling" ? Math.min(1, pull * 2) : 1, transform: phase === "settling" ? "translateY(-12px)" : "none" }}>
        <div data-tally={phase} className="relative text-ink" style={{ width: PULL_TALLY_PX, height: PULL_TALLY_PX }}>
          <div className="absolute top-0 left-0 origin-top-left" style={{ width: 120, height: 120, transform: `scale(${scale})` }}>
            {TALLY_STROKES.map((s, i) => {
              const across = i === 4;
              const pulled = phase === "pulling" ? (across ? (crossed ? 0 : 100) : (1 - (shown[i] ?? 0)) * 100) : 0;
              return (
                <div key={i} className={`absolute t${i + 1}`} style={{ left: s.left, top: s.top, width: s.width, height: s.height, transform: `rotate(${s.rotate}deg)`, clipPath: phase === "loading" ? undefined : across ? `inset(0 ${pulled}% 0 0)` : `inset(0 0 ${pulled}% 0)` }}>
                  <svg viewBox={s.viewBox} width={s.width} height={s.height} className="block">
                    <path d={s.d} transform={s.transform ?? undefined} fill="currentColor" />
                  </svg>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
