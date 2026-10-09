/**
 * The opening (docs/design.md section 11; docs/design/reference/LOGO.md, "The cold open"): the launch image iOS
 * shows while the installed app starts, the app's first frame drawn by the page itself before any script or
 * stylesheet loads, and the handoff to Now. The launch image is the bare ground, the first frame is the same
 * picture with nothing drawn yet, and then the tally is counted, one stroke at a time, until the first screen's
 * shell has painted: every stroke stops where it is and the two fades begin. Nothing white, ever.
 *
 * The style, the element and the handoff below are the design's own code (the logo files' `opening.css`,
 * `opening.html` and `handoff.js`), carried in as delivered and never rewritten: `OPENING_CSS`, `OPENING_MARK`
 * and `HANDOFF_JS` are their text, character for character. What the app adds is outside them: Round D's fix
 * (`dressedOnly`, the ground on `html` held only until the handoff marks the document dressed, so the Appearance
 * setting owns it from that frame, 8.1 and 11.4) and the one call that runs the handoff.
 *
 * To retune the count, change the four `--tally-` values at the top of `OPENING_CSS` and nothing else. The count
 * completes at beat + 4 x pace + stroke; keep the stroke no longer than the pace, or two strokes draw at once.
 */
export const GROUND_DARK = "#121110";
export const GROUND_LIGHT = "#F5EFE4";
/** The logo's colour on each ground (LOGO.md, "Colour"): one colour at a time, never an ink, the citron or a hue. */
export const LOGO_ON_DARK = "#F2EDE3";
export const LOGO_ON_LIGHT = "#1B1815";
export const LOGO_PX = 120;

/** The design's style for the first frame, as delivered. */
export const OPENING_CSS = `/* The opening (design.md 11), with the logo's cold-open animation: the tally counted, one stroke
   at a time, from the app's first frame. Inline this in <head>, before anything else, so it paints
   in the first frame.

   To change the timing, change these four values and nothing else. */
#opening {
  --tally-beat: 200ms;     /* the bare ground before the first stroke */
  --tally-stroke: 200ms;   /* how long each stroke takes to draw */
  --tally-pace: 275ms;     /* from the start of one stroke to the start of the next */
  --tally-curve: cubic-bezier(0.2, 0.8, 0.2, 1);   /* section 9's move curve */
}
/* The count is complete at beat + 4 x pace + stroke: 200 + 1100 + 200 = 1500ms.
   Keep the stroke no longer than the pace, or two strokes draw at once. */

html, body { margin: 0; background: #121110; color-scheme: dark; }
#opening { position: fixed; inset: 0; z-index: 100; background: #121110; }

/* The logo sits in 11.2's box: 120 x 120 CSS px, centred on the full screen. */
#opening .logo { position: absolute; left: 50%; top: 50%; width: 120px; height: 120px; margin: -60px 0 0 -60px; }

/* Each stroke sits in its own box, turned to its angle, hidden by a clip until its turn: the four
   uprights are drawn top to bottom, the crossing stroke left to right. The launch image is the bare
   ground, the same as this first frame with nothing drawn yet. */
#opening .s {
  position: absolute;
  -webkit-clip-path: inset(0 0 100% 0); clip-path: inset(0 0 100% 0);
  animation: dareful-down var(--tally-stroke) var(--tally-curve) 0ms 1 both;
}
#opening .s5 { -webkit-clip-path: inset(0 100% 0 0); clip-path: inset(0 100% 0 0); animation-name: dareful-across; }
#opening .s svg { display: block; }
#opening .s1 { left: 17.99px; top: 16.84px; width: 21.60px; height: 86.88px; transform: rotate(1.0deg); animation-delay: var(--tally-beat); }
#opening .s2 { left: 36.95px; top: 15.70px; width: 21.36px; height: 88.68px; transform: rotate(-0.5deg); animation-delay: calc(var(--tally-beat) + 1 * var(--tally-pace)); }
#opening .s3 { left: 53.87px; top: 17.50px; width: 21.84px; height: 85.08px; transform: rotate(1.0deg); animation-delay: calc(var(--tally-beat) + 2 * var(--tally-pace)); }
#opening .s4 { left: 73.19px; top: 16.24px; width: 21.60px; height: 88.08px; transform: rotate(-1.0deg); animation-delay: calc(var(--tally-beat) + 3 * var(--tally-pace)); }
#opening .s5 { left: 4.25px; top: 49.96px; width: 110.28px; height: 23.04px; transform: rotate(-25.9deg); animation-delay: calc(var(--tally-beat) + 4 * var(--tally-pace)); }

@keyframes dareful-down {
  from { -webkit-clip-path: inset(0 0 100% 0); clip-path: inset(0 0 100% 0); }
  to   { -webkit-clip-path: inset(0 0 0 0);    clip-path: inset(0 0 0 0); }
}
@keyframes dareful-across {
  from { -webkit-clip-path: inset(0 100% 0 0); clip-path: inset(0 100% 0 0); }
  to   { -webkit-clip-path: inset(0 0 0 0);    clip-path: inset(0 0 0 0); }
}

/* The handoff (11.5), whenever Now's shell has painted: every stroke stops where it is, the logo
   fades over quick (120ms) and the ground over base (200ms), from the same frame. handoff.js adds
   the class and removes the element when the ground is gone. */
#opening.handoff { animation: dareful-out 200ms cubic-bezier(0, 0, 0.58, 1) 0ms 1 forwards; }
#opening.handoff .logo { animation: dareful-out 120ms cubic-bezier(0, 0, 0.58, 1) 0ms 1 forwards; }
#opening.handoff .s { animation-play-state: paused; }
@keyframes dareful-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes dareful-in { from { opacity: 0; } to { opacity: 1; } }

/* Reduce Motion: nothing is drawn. The whole mark fades in over base (200ms) from the first frame,
   holds, then the same two fades. */
@media (prefers-reduced-motion: reduce) {
  #opening .s { animation: none; -webkit-clip-path: none; clip-path: none; }
  #opening .logo { animation: dareful-in 200ms cubic-bezier(0, 0, 0.58, 1) 0ms 1 both; }
}

/* The light ground, when the phone is in light (11.4: the opening follows the phone, not the app's
   setting). The strokes keep one shape in both schemes. */
@media (prefers-color-scheme: light) {
  html, body, #opening { background: #F5EFE4; }
  html, body { color-scheme: light; }
  #opening .s path { fill: #1B1815; }
}`;

/** The design's five strokes inside the logo's box, as delivered: what `#opening` holds. */
export const OPENING_MARK = `  <div class="logo">
    <div class="s s1"><svg viewBox="-9 -36.2 18 72.4" width="21.60" height="86.88"><path d="M-3.66 -30.5 C-3.8 -29.71 -3.91 -27.96 -3.98 -26.69 C-4.05 -25.42 -4.07 -24.15 -4.06 -22.88 C-4.05 -21.6 -3.94 -20.33 -3.92 -19.06 C-3.9 -17.79 -3.93 -16.52 -3.92 -15.25 C-3.92 -13.98 -3.9 -12.71 -3.91 -11.44 C-3.93 -10.17 -4.03 -8.9 -4.02 -7.62 C-4 -6.35 -3.81 -5.08 -3.8 -3.81 C-3.79 -2.54 -3.94 -1.27 -3.95 0 C-3.96 1.27 -3.86 2.54 -3.86 3.81 C-3.86 5.08 -3.97 6.35 -3.96 7.62 C-3.96 8.9 -3.93 10.17 -3.85 11.44 C-3.77 12.71 -3.55 13.98 -3.49 15.25 C-3.43 16.52 -3.52 17.79 -3.5 19.06 C-3.48 20.33 -3.39 21.6 -3.38 22.88 C-3.37 24.15 -3.47 25.42 -3.45 26.69 C-3.44 27.96 -3.34 29.73 -3.29 30.5 C-3.23 31.27 -3.41 31.09 -3.13 31.29 C-2.85 31.49 -2.13 31.56 -1.61 31.68 C-1.09 31.8 -0.56 32.01 0 32.02 C0.56 32.03 1.34 31.88 1.74 31.74 C2.14 31.6 2.15 31.37 2.38 31.16 C2.61 30.95 2.93 31.25 3.13 30.5 C3.33 29.75 3.45 27.96 3.59 26.69 C3.73 25.42 3.86 24.15 3.99 22.88 C4.12 21.6 4.31 20.33 4.36 19.06 C4.42 17.79 4.29 16.52 4.33 15.25 C4.37 13.98 4.55 12.71 4.61 11.44 C4.66 10.17 4.61 8.9 4.67 7.62 C4.73 6.35 4.85 5.08 4.95 3.81 C5.06 2.54 5.28 1.27 5.3 0 C5.31 -1.27 5.02 -2.54 5.03 -3.81 C5.03 -5.08 5.33 -6.35 5.31 -7.62 C5.29 -8.9 4.98 -10.17 4.92 -11.44 C4.86 -12.71 4.97 -13.98 4.95 -15.25 C4.93 -16.52 4.87 -17.79 4.79 -19.06 C4.7 -20.33 4.58 -21.6 4.45 -22.88 C4.31 -24.15 4.12 -25.42 3.98 -26.69 C3.84 -27.96 3.77 -29.72 3.59 -30.5 C3.42 -31.28 3.21 -31.09 2.93 -31.36 C2.64 -31.63 2.37 -32.03 1.88 -32.15 C1.39 -32.26 0.68 -32.11 0 -32.05 C-0.68 -31.98 -1.66 -31.86 -2.18 -31.75 C-2.7 -31.65 -2.88 -31.62 -3.13 -31.42 C-3.37 -31.21 -3.52 -31.29 -3.66 -30.5 Z" fill="#F2EDE3"/></svg></div>
    <div class="s s2"><svg viewBox="-8.9 -36.95 17.8 73.9" width="21.36" height="88.68"><path d="M-3.8 -31.25 C-3.85 -30.45 -4.01 -28.65 -4.09 -27.34 C-4.18 -26.04 -4.19 -24.74 -4.32 -23.44 C-4.45 -22.14 -4.8 -20.83 -4.88 -19.53 C-4.96 -18.23 -4.83 -16.93 -4.81 -15.62 C-4.79 -14.32 -4.79 -13.02 -4.76 -11.72 C-4.73 -10.42 -4.67 -9.11 -4.63 -7.81 C-4.6 -6.51 -4.58 -5.21 -4.55 -3.91 C-4.53 -2.6 -4.47 -1.3 -4.47 0 C-4.48 1.3 -4.58 2.6 -4.58 3.91 C-4.59 5.21 -4.54 6.51 -4.51 7.81 C-4.47 9.11 -4.43 10.42 -4.38 11.72 C-4.33 13.02 -4.24 14.32 -4.2 15.62 C-4.17 16.93 -4.23 18.23 -4.2 19.53 C-4.16 20.83 -4.06 22.14 -4 23.44 C-3.94 24.74 -3.88 26.04 -3.82 27.34 C-3.76 28.65 -3.71 30.48 -3.65 31.25 C-3.59 32.02 -3.76 31.73 -3.45 31.98 C-3.15 32.22 -2.38 32.54 -1.8 32.73 C-1.23 32.91 -0.64 33.1 0 33.08 C0.64 33.06 1.59 32.8 2.03 32.61 C2.48 32.42 2.39 32.14 2.64 31.92 C2.89 31.69 3.36 32.01 3.53 31.25 C3.71 30.49 3.65 28.65 3.68 27.34 C3.72 26.04 3.74 24.74 3.75 23.44 C3.77 22.14 3.76 20.83 3.75 19.53 C3.75 18.23 3.71 16.93 3.72 15.62 C3.74 14.32 3.89 13.02 3.85 11.72 C3.81 10.42 3.48 9.11 3.47 7.81 C3.47 6.51 3.79 5.21 3.8 3.91 C3.82 2.6 3.61 1.3 3.58 0 C3.55 -1.3 3.57 -2.6 3.63 -3.91 C3.7 -5.21 3.93 -6.51 3.98 -7.81 C4.04 -9.11 3.94 -10.42 3.94 -11.72 C3.95 -13.02 4.02 -14.32 4.02 -15.62 C4.03 -16.93 3.98 -18.23 3.98 -19.53 C3.97 -20.83 3.98 -22.14 4.01 -23.44 C4.03 -24.74 4.13 -26.04 4.14 -27.34 C4.15 -28.65 4.24 -30.43 4.09 -31.25 C3.93 -32.07 3.61 -31.97 3.21 -32.25 C2.81 -32.53 2.23 -32.77 1.7 -32.92 C1.16 -33.06 0.63 -33.11 0 -33.13 C-0.63 -33.15 -1.46 -33.19 -2.1 -33.02 C-2.73 -32.85 -3.52 -32.43 -3.8 -32.13 C-4.09 -31.84 -3.75 -32.05 -3.8 -31.25 Z" fill="#F2EDE3"/></svg></div>
    <div class="s s3"><svg viewBox="-9.1 -35.45 18.2 70.9" width="21.84" height="85.08"><path d="M-3.66 -29.75 C-3.82 -29.01 -3.61 -27.27 -3.59 -26.03 C-3.57 -24.79 -3.49 -23.55 -3.53 -22.31 C-3.57 -21.07 -3.83 -19.83 -3.85 -18.59 C-3.87 -17.35 -3.74 -16.11 -3.66 -14.88 C-3.59 -13.64 -3.4 -12.4 -3.4 -11.16 C-3.4 -9.92 -3.61 -8.68 -3.65 -7.44 C-3.69 -6.2 -3.68 -4.96 -3.65 -3.72 C-3.62 -2.48 -3.47 -1.24 -3.47 0 C-3.47 1.24 -3.6 2.48 -3.64 3.72 C-3.69 4.96 -3.74 6.2 -3.75 7.44 C-3.77 8.68 -3.75 9.92 -3.74 11.16 C-3.72 12.4 -3.64 13.64 -3.67 14.88 C-3.71 16.11 -3.92 17.35 -3.94 18.59 C-3.96 19.83 -3.86 21.07 -3.81 22.31 C-3.76 23.55 -3.71 24.79 -3.66 26.03 C-3.61 27.27 -3.52 29.01 -3.5 29.75 C-3.49 30.49 -3.89 30.22 -3.56 30.44 C-3.22 30.67 -2.08 30.96 -1.48 31.11 C-0.89 31.26 -0.59 31.39 0 31.36 C0.59 31.33 1.57 31.04 2.04 30.92 C2.5 30.81 2.49 30.86 2.77 30.67 C3.04 30.47 3.5 30.52 3.69 29.75 C3.88 28.98 3.82 27.27 3.91 26.03 C3.99 24.79 4.07 23.55 4.21 22.31 C4.34 21.07 4.65 19.83 4.74 18.59 C4.83 17.35 4.69 16.11 4.75 14.88 C4.8 13.64 5 12.4 5.06 11.16 C5.12 9.92 5.1 8.68 5.13 7.44 C5.15 6.2 5.25 4.96 5.2 3.72 C5.14 2.48 4.89 1.24 4.82 0 C4.75 -1.24 4.78 -2.48 4.79 -3.72 C4.79 -4.96 4.85 -6.2 4.84 -7.44 C4.82 -8.68 4.73 -9.92 4.71 -11.16 C4.68 -12.4 4.75 -13.64 4.68 -14.88 C4.61 -16.11 4.37 -17.35 4.3 -18.59 C4.23 -19.83 4.29 -21.07 4.26 -22.31 C4.24 -23.55 4.25 -24.79 4.14 -26.03 C4.04 -27.27 3.77 -29.01 3.63 -29.75 C3.49 -30.49 3.58 -30.19 3.29 -30.46 C3 -30.74 2.44 -31.28 1.89 -31.39 C1.34 -31.49 0.58 -31.14 0 -31.11 C-0.58 -31.08 -1.12 -31.31 -1.56 -31.2 C-2 -31.09 -2.28 -30.7 -2.63 -30.45 C-2.98 -30.21 -3.5 -30.49 -3.66 -29.75 Z" fill="#F2EDE3"/></svg></div>
    <div class="s s4"><svg viewBox="-9 -36.7 18 73.4" width="21.60" height="88.08"><path d="M-3.58 -31 C-3.71 -30.24 -3.83 -28.42 -3.97 -27.12 C-4.11 -25.83 -4.29 -24.54 -4.4 -23.25 C-4.51 -21.96 -4.56 -20.67 -4.62 -19.38 C-4.69 -18.08 -4.76 -16.79 -4.8 -15.5 C-4.84 -14.21 -4.77 -12.92 -4.86 -11.62 C-4.94 -10.33 -5.24 -9.04 -5.32 -7.75 C-5.39 -6.46 -5.36 -5.17 -5.32 -3.88 C-5.29 -2.58 -5.14 -1.29 -5.12 0 C-5.11 1.29 -5.22 2.58 -5.23 3.88 C-5.23 5.17 -5.23 6.46 -5.15 7.75 C-5.07 9.04 -4.8 10.33 -4.76 11.62 C-4.72 12.92 -4.97 14.21 -4.93 15.5 C-4.88 16.79 -4.67 18.08 -4.5 19.38 C-4.34 20.67 -4.04 21.96 -3.94 23.25 C-3.84 24.54 -4.03 25.83 -3.92 27.12 C-3.81 28.42 -3.47 30.25 -3.28 31 C-3.1 31.75 -3.1 31.43 -2.79 31.62 C-2.49 31.82 -1.92 31.99 -1.46 32.17 C-0.99 32.35 -0.51 32.7 0 32.68 C0.51 32.67 1.18 32.25 1.63 32.09 C2.07 31.94 2.38 31.94 2.69 31.76 C3 31.58 3.33 31.77 3.46 31 C3.59 30.23 3.44 28.42 3.45 27.12 C3.46 25.83 3.51 24.54 3.53 23.25 C3.56 21.96 3.51 20.67 3.6 19.38 C3.69 18.08 4 16.79 4.07 15.5 C4.15 14.21 4.05 12.92 4.04 11.62 C4.04 10.33 4.04 9.04 4.03 7.75 C4.01 6.46 3.98 5.17 3.95 3.88 C3.92 2.58 3.86 1.29 3.88 0 C3.89 -1.29 4.05 -2.58 4.03 -3.88 C4.01 -5.17 3.75 -6.46 3.78 -7.75 C3.8 -9.04 4.16 -10.33 4.17 -11.62 C4.19 -12.92 3.94 -14.21 3.87 -15.5 C3.8 -16.79 3.74 -18.08 3.75 -19.38 C3.76 -20.67 3.97 -21.96 3.95 -23.25 C3.92 -24.54 3.66 -25.83 3.59 -27.12 C3.52 -28.42 3.61 -30.21 3.52 -31 C3.44 -31.79 3.35 -31.66 3.07 -31.89 C2.8 -32.12 2.39 -32.32 1.88 -32.4 C1.36 -32.48 0.62 -32.41 0 -32.4 C-0.62 -32.38 -1.29 -32.44 -1.82 -32.32 C-2.35 -32.2 -2.89 -31.91 -3.19 -31.69 C-3.48 -31.47 -3.45 -31.76 -3.58 -31 Z" fill="#F2EDE3"/></svg></div>
    <div class="s s5"><svg viewBox="-45.95 -9.6 91.9 19.2" width="110.28" height="23.04"><path d="M-3.8 -40.25 C-3.84 -39.27 -4.04 -36.9 -4.06 -35.22 C-4.08 -33.54 -3.95 -31.86 -3.89 -30.19 C-3.82 -28.51 -3.7 -26.83 -3.68 -25.16 C-3.66 -23.48 -3.82 -21.8 -3.78 -20.12 C-3.73 -18.45 -3.48 -16.77 -3.4 -15.09 C-3.31 -13.42 -3.25 -11.74 -3.25 -10.06 C-3.25 -8.39 -3.36 -6.71 -3.39 -5.03 C-3.41 -3.35 -3.44 -1.68 -3.4 0 C-3.37 1.68 -3.27 3.35 -3.19 5.03 C-3.12 6.71 -2.97 8.39 -2.95 10.06 C-2.94 11.74 -3.11 13.42 -3.12 15.09 C-3.13 16.77 -3.04 18.45 -3.02 20.12 C-3 21.8 -2.98 23.48 -3.02 25.16 C-3.06 26.83 -3.19 28.51 -3.24 30.19 C-3.29 31.86 -3.3 33.54 -3.31 35.22 C-3.33 36.9 -3.43 39.31 -3.32 40.25 C-3.21 41.19 -2.95 40.69 -2.65 40.88 C-2.36 41.08 -1.99 41.25 -1.55 41.42 C-1.11 41.58 -0.58 41.79 0 41.85 C0.58 41.91 1.48 41.93 1.96 41.77 C2.43 41.62 2.59 41.19 2.83 40.94 C3.06 40.68 3.2 41.2 3.37 40.25 C3.54 39.3 3.67 36.9 3.82 35.22 C3.98 33.54 4.19 31.86 4.31 30.19 C4.42 28.51 4.45 26.83 4.52 25.16 C4.59 23.48 4.67 21.8 4.74 20.12 C4.81 18.45 4.86 16.77 4.92 15.09 C4.98 13.42 5.01 11.74 5.11 10.06 C5.21 8.39 5.41 6.71 5.53 5.03 C5.64 3.35 5.81 1.68 5.8 0 C5.78 -1.68 5.45 -3.35 5.45 -5.03 C5.45 -6.71 5.79 -8.39 5.8 -10.06 C5.8 -11.74 5.53 -13.42 5.49 -15.09 C5.45 -16.77 5.6 -18.45 5.55 -20.12 C5.49 -21.8 5.28 -23.48 5.16 -25.16 C5.04 -26.83 4.98 -28.51 4.84 -30.19 C4.7 -31.86 4.51 -33.54 4.34 -35.22 C4.17 -36.9 3.96 -39.27 3.84 -40.25 C3.72 -41.23 3.9 -40.84 3.62 -41.08 C3.34 -41.32 2.75 -41.49 2.15 -41.68 C1.54 -41.86 0.62 -42.2 0 -42.18 C-0.62 -42.17 -0.93 -41.76 -1.56 -41.58 C-2.2 -41.4 -3.42 -41.32 -3.79 -41.1 C-4.16 -40.88 -3.75 -41.23 -3.8 -40.25 Z" transform="rotate(90)" fill="#F2EDE3"/></svg></div>
  </div>`;

/** The element as the design delivers it: `#opening`, hidden from a screen reader, holding the five strokes. */
export const OPENING_ELEMENT = `<div id="opening" aria-hidden="true">${OPENING_MARK}</div>`;

/** The design's handoff, as delivered (its two functions, without the module's `export`). */
export const HANDOFF_JS = `// The opening's handoff (design.md 11.5). Call once, on the frame after Now's shell has painted.
// It never waits for data, and never holds the logo for show: if the app is ready while the count
// is still being drawn, the strokes stop where they are and the fades start from that frame.
function handOffOpening() {
  const el = document.getElementById('opening');
  if (!el || el.classList.contains('handoff')) return;
  el.classList.add('handoff');                       // logo fades over 120ms, ground over 200ms
  const done = () => el.remove();
  el.addEventListener('animationend', (e) => { if (e.target === el) done(); });
  setTimeout(done, 260);                             // in case animationend never arrives (keep it above the ground's 200ms)
}

// "The frame after the shell has painted": two animation frames after the first render commits.
function afterFirstPaint(fn) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

// In the app's entry, after the first render of the shell:
//   afterFirstPaint(handOffOpening);
// Returning to a running app shows nothing: #opening only exists in the first page load.`;

/**
 * Round D's fix, merged into the design's style (11.4): as delivered, `html` and `body` take the phone's ground
 * for good, and an inline style outranks the stylesheet, so "Always dark" on a light phone kept a light ground.
 * Here the same rules hold only until the handoff marks the document (`data-dressed`); from that frame the tokens,
 * and the Appearance setting with them, own the ground. Nothing else in the style is touched. Pure.
 */
export function dressedOnly(css: string): string {
  return css.replace(/(^|\n)([ \t]*)html, body\b/g, "$1$2html:not([data-dressed]), html:not([data-dressed]) body");
}

/** The first frame's inline style: the design's, with the ground handed to the tokens at the handoff, and nothing else. */
export const OPENING_STYLE = dressedOnly(OPENING_CSS);

/**
 * The one handoff (11.5): the design's two functions, called once, on the frame after the first screen's shell has
 * painted. On that same frame the document is marked dressed (Round D). Before any of it, the document is marked
 * as one whose content is still arriving, so what streams into the shell fades in (9.4). It never waits for data.
 * The one mark on the performance timeline, when the shell had painted, is read by the http suite's watch over
 * the opening and draws nothing.
 */
export const OPENING_HANDOFF_SCRIPT = `(function(){var d=document.documentElement;d.setAttribute("data-arriving","");var mark=function(n){try{performance.mark(n)}catch(e){}};\n${HANDOFF_JS}\nafterFirstPaint(function(){d.setAttribute("data-dressed","");mark("dareful:shell");handOffOpening();});})();`;

/** The four values the count is tuned by, read out of a style in milliseconds (the curve as written). Pure. */
export function tallyOf(css: string): { beat: number; stroke: number; pace: number; curve: string; complete: number } | null {
  const ms = (name: string): number | null => {
    const m = new RegExp(`--tally-${name}:\\s*(\\d+(?:\\.\\d+)?)(ms|s)\\s*;`).exec(css);
    return m ? Number(m[1]) * (m[2] === "s" ? 1000 : 1) : null;
  };
  const beat = ms("beat");
  const stroke = ms("stroke");
  const pace = ms("pace");
  const curve = /--tally-curve:\s*([^;]+);/.exec(css)?.[1]?.trim() ?? null;
  if (beat === null || stroke === null || pace === null || curve === null) return null;
  return { beat, stroke, pace, curve, complete: beat + 4 * pace + stroke };
}

/** The handoff's two fades and the timer that removes the element if the fade's end never arrives, in milliseconds. Pure. */
export function handoffOf(css: string, js: string): { ground: number; logo: number; fallback: number } | null {
  const ground = /#opening\.handoff\s*\{[^}]*?(\d+)ms/.exec(css)?.[1];
  const logo = /#opening\.handoff \.logo\s*\{[^}]*?(\d+)ms/.exec(css)?.[1];
  const fallback = /setTimeout\(done,\s*(\d+)\)/.exec(js)?.[1];
  if (!ground || !logo || !fallback) return null;
  return { ground: Number(ground), logo: Number(logo), fallback: Number(fallback) };
}

/**
 * The iPhone screens the app supports, in CSS px with the pixel ratio (11.3): the design's list, in its order,
 * through the iPhone 17 line and iPhone Air, then the two older sizes Round D already covered. When a new size
 * ships, add a line here and to `scripts/opening.mjs` and run it.
 */
export const LAUNCH_DEVICES: ReadonlyArray<{ width: number; height: number; ratio: 2 | 3; phones: string }> = [
  { width: 440, height: 956, ratio: 3, phones: "iPhone 16 Pro Max, 17 Pro Max" },
  { width: 420, height: 912, ratio: 3, phones: "iPhone Air" },
  { width: 402, height: 874, ratio: 3, phones: "iPhone 16 Pro, 17, 17 Pro" },
  { width: 430, height: 932, ratio: 3, phones: "iPhone 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus" },
  { width: 393, height: 852, ratio: 3, phones: "iPhone 14 Pro, 15, 15 Pro, 16" },
  { width: 428, height: 926, ratio: 3, phones: "iPhone 12 Pro Max, 13 Pro Max, 14 Plus" },
  { width: 390, height: 844, ratio: 3, phones: "iPhone 12, 12 Pro, 13, 13 Pro, 14, 16e" },
  { width: 375, height: 812, ratio: 3, phones: "iPhone X, XS, 11 Pro, 12 mini, 13 mini" },
  { width: 414, height: 896, ratio: 3, phones: "iPhone XS Max, 11 Pro Max" },
  { width: 414, height: 896, ratio: 2, phones: "iPhone XR, 11" },
  { width: 375, height: 667, ratio: 2, phones: "iPhone SE (2nd and 3rd), 8" },
  { width: 414, height: 736, ratio: 3, phones: "iPhone 6 Plus to 8 Plus" },
  { width: 320, height: 568, ratio: 2, phones: "iPhone SE (1st)" },
];

export type Scheme = "dark" | "light";
export const SCHEMES: readonly Scheme[] = ["dark", "light"];

/** The published path of one launch image: its pixel size and its scheme, named as the design names them. */
export function launchImagePath(d: { width: number; height: number; ratio: number }, scheme: Scheme): string {
  return `/launch/launch-${d.width * d.ratio}x${d.height * d.ratio}-${scheme}.png`;
}

/** The media query iOS matches a startup image on: the device's width, height, pixel ratio, portrait, and the scheme. */
export function launchImageMedia(d: { width: number; height: number; ratio: number }, scheme: Scheme): string {
  return `(device-width: ${d.width}px) and (device-height: ${d.height}px) and (-webkit-device-pixel-ratio: ${d.ratio}) and (orientation: portrait) and (prefers-color-scheme: ${scheme})`;
}

/** Every `<link rel="apple-touch-startup-image">`, both sets (11.3); dark before light at each size, so a phone that ignores the scheme takes dark. */
export function launchImageLinks(): Array<{ url: string; media: string }> {
  const out: Array<{ url: string; media: string }> = [];
  for (const d of LAUNCH_DEVICES) for (const scheme of SCHEMES) out.push({ url: launchImagePath(d, scheme), media: launchImageMedia(d, scheme) });
  return out;
}

/**
 * The tally on pull-to-refresh (the field round's 3.2, built in the games-and-the-reveal round, 2026-10-07): the
 * opening's five strokes and its count's timing, read out of the design's own style and mark above so the two never
 * drift. As a list is pulled the four uprights draw one at a time with the finger; letting go past the threshold
 * crosses the fifth; while the screen is read again the count redraws in a loop; when it has arrived it settles and
 * retracts. Under Reduce Motion it is a still mark that fades.
 */
export type TallyStroke = { left: number; top: number; width: number; height: number; rotate: number; viewBox: string; d: string; transform: string | null };

/** The count's four values, from the design's style. */
export const TALLY_TIMING = ((css: string) => {
  const ms = (name: string) => Number(new RegExp(`--tally-${name}: (\\d+)ms`).exec(css)?.[1] ?? 0);
  return { beat: ms("beat"), stroke: ms("stroke"), pace: ms("pace"), curve: /--tally-curve: (cubic-bezier\([^)]*\))/.exec(css)?.[1] ?? "ease" };
})(OPENING_CSS);

/** The five strokes in the logo's 120px box, from the design's style (their boxes) and mark (their paths). */
export const TALLY_STROKES: TallyStroke[] = [1, 2, 3, 4, 5].map((n) => {
  const box = new RegExp(`#opening \\.s${n} \\{ left: ([\\d.]+)px; top: ([\\d.]+)px; width: ([\\d.]+)px; height: ([\\d.]+)px; transform: rotate\\((-?[\\d.]+)deg\\)`).exec(OPENING_CSS);
  const svg = new RegExp(`<div class="s s${n}"><svg viewBox="([^"]+)"[^>]*><path d="([^"]+)"(?: transform="([^"]+)")?`).exec(OPENING_MARK);
  return { left: Number(box?.[1] ?? 0), top: Number(box?.[2] ?? 0), width: Number(box?.[3] ?? 0), height: Number(box?.[4] ?? 0), rotate: Number(box?.[5] ?? 0), viewBox: svg?.[1] ?? "0 0 1 1", d: svg?.[2] ?? "", transform: svg?.[3] ?? null };
});

/** How long the loop's count takes, and the rest it holds the whole tally before counting again. */
export const TALLY_LOOP_MS = TALLY_TIMING.beat + 4 * TALLY_TIMING.pace + TALLY_TIMING.stroke + TALLY_TIMING.pace;

/**
 * The loop while the screen is read again, as keyframes: each stroke draws in its turn of the count, the whole tally
 * holds for a pace, and the count starts over. The crossing stroke draws across; the uprights top to bottom.
 */
export function pullTallyCss(): string {
  const { beat, stroke, pace, curve } = TALLY_TIMING;
  const pct = (t: number) => `${((t / TALLY_LOOP_MS) * 100).toFixed(2)}%`;
  const frames = [0, 1, 2, 3, 4].map((k) => {
    const start = beat + k * pace;
    const hidden = k === 4 ? "inset(0 100% 0 0)" : "inset(0 0 100% 0)";
    return `@keyframes tally-loop-${k + 1}{0%,${pct(start)}{clip-path:${hidden}}${pct(start + stroke)},99.9%{clip-path:inset(0 0 0 0)}100%{clip-path:${hidden}}}`;
  });
  const runs = [1, 2, 3, 4, 5].map((n) => `[data-tally="loading"] .t${n}{animation:tally-loop-${n} ${TALLY_LOOP_MS}ms ${curve} 0ms infinite both}`);
  // A pull's finished tally while the screen is read again (the touch-ups round): the uprights stay, and the fifth redraws across them, holding a pace between.
  const fifth = stroke + pace;
  const reloading = `@keyframes tally-fifth{0%{clip-path:inset(0 100% 0 0)}${((stroke / fifth) * 100).toFixed(2)}%,100%{clip-path:inset(0 0 0 0)}}[data-tally="reloading"] .t5{animation:tally-fifth ${fifth}ms ${curve} 0ms infinite both}`;
  return `${frames.join("")}${runs.join("")}${reloading}[data-tally]{transition:opacity ${TALLY_TIMING.stroke}ms ${curve},transform ${TALLY_TIMING.stroke}ms ${curve}}@media (prefers-reduced-motion: reduce){[data-tally] .t1,[data-tally] .t2,[data-tally] .t3,[data-tally] .t4,[data-tally] .t5{animation:none!important;clip-path:none!important;transition:none}}`;
}
