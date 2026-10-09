"use client";

import { TALLY_STROKES } from "@/lib/ui/opening";

/** The tally's size on a pull: the logo's box drawn at this many pixels. */
export const PULL_TALLY_PX = 32;
/** The ground around it, so its patch is 44px, a touch target's size, and the tally keeps its place under the status band. */
export const TALLY_PATCH_PAD = 6;

export type TallyPhase = "pulling" | "reloading" | "settling";

/**
 * How much of each stroke shows at a pull from 0 to 1 (the threshold), in the count's order: the four uprights one at a
 * time, top to bottom, then the crossing fifth, left to right, whole at the threshold (the touch-ups round, section 9:
 * the fifth came only after letting go, and people kept pulling for it). Pure.
 */
export function strokesAt(pull: number): number[] {
  const p = Math.min(1, Math.max(0, pull));
  return [0, 1, 2, 3, 4].map((i) => Math.min(1, Math.max(0, p * 5 - i)));
}

/**
 * The tally on pull-to-refresh (the field round's 3.2; the touch-ups round): under the status band, in ink, the logo's
 * five strokes at a pull's size. Pulling draws all five with the finger, the crossing fifth last, and letting go once
 * all five are drawn reads the screen again; while it is read the finished tally's fifth stroke redraws in a loop
 * (`pullTallyCss`, placed once in the root layout), and once it has arrived the tally settles and retracts. Under
 * Reduce Motion the stylesheet draws it whole, a still mark that fades.
 */
export function PullTally({ phase, pull }: { phase: TallyPhase; pull: number }) {
  const shown = strokesAt(pull);
  const scale = PULL_TALLY_PX / 120;
  const half = PULL_TALLY_PX / 2 + TALLY_PATCH_PAD;
  return (
    <div aria-hidden="true" data-fixed="top" className="pointer-events-none fixed inset-x-0 z-40 flex justify-center" style={{ top: `calc(env(safe-area-inset-top) + ${12 - TALLY_PATCH_PAD}px)` }}>
      {/* Its own patch of ground, painted as the status band is with the grain lined up to the screen's: let go, the page
          springs back under the tally, and its strokes must never cross a line of text (the device notice, the guest line). */}
      <div data-tally-patch="" className="grain rounded-card" style={{ padding: TALLY_PATCH_PAD, backgroundPosition: `calc(${half}px - 50vw) calc(${TALLY_PATCH_PAD - 12}px - env(safe-area-inset-top))`, opacity: phase === "settling" ? 0 : phase === "pulling" ? Math.min(1, pull * 2) : 1, transform: phase === "settling" ? "translateY(-12px)" : "none" }}>
        <div data-tally={phase} className="relative text-ink" style={{ width: PULL_TALLY_PX, height: PULL_TALLY_PX }}>
          <div className="absolute top-0 left-0 origin-top-left" style={{ width: 120, height: 120, transform: `scale(${scale})` }}>
            {TALLY_STROKES.map((s, i) => {
              const across = i === 4;
              // Drawn with the finger while pulling; whole after, where the fifth's loop is the stylesheet's.
              const hidden = phase === "pulling" ? (1 - (shown[i] ?? 0)) * 100 : 0;
              return (
                <div key={i} className={`absolute t${i + 1}`} style={{ left: s.left, top: s.top, width: s.width, height: s.height, transform: `rotate(${s.rotate}deg)`, clipPath: phase !== "pulling" ? undefined : across ? `inset(0 ${hidden}% 0 0)` : `inset(0 0 ${hidden}% 0)` }}>
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
