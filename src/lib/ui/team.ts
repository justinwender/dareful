/**
 * Team stamps (docs/design.md 1.7, 4.5): a team appears as its abbreviation on the team's colour, the colour the
 * feed supplies, and that colour appears nowhere else. No logos anywhere: they are trademarks the leagues police,
 * and a logo that grows and shrinks is exactly the kind of use that draws attention. Pure, so the sizes, the
 * contrast rule and the words for a lean have tests.
 */
import { CAN_TIE } from "@/lib/sports/templates";

export type TeamFace = { abbr: string; name: string; color: string | null };
/** The stamp sizes the doc names: 20 beside the name in words, 28 in a list row, 44 in a game's header, and 18 to 60 on a slider. */
export type StampSize = 20 | 28 | 44 | number;

import { CREAM, GRAPHITE } from "./palette";

/** The stamp's fill: the team's colour, or the ground when the feed gave none. */
export const stampFill = (color: string | null): string => (color ? `#${color}` : "var(--ground)");

/** Whichever of graphite and cream has more contrast with the colour (1.7), by relative luminance; cream on the ground when there is no colour. */
export function stampInk(color: string | null): string {
  if (!color) return CREAM;
  const n = parseInt(color, 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  // Contrast against graphite (L 0.005) and cream (L 0.83): graphite wins on anything lighter than about mid grey.
  const againstGraphite = (l + 0.05) / (0.005 + 0.05);
  const againstCream = (0.83 + 0.05) / (l + 0.05);
  return againstGraphite >= againstCream ? GRAPHITE : CREAM;
}

/** The abbreviation's size: Hanken 700 at 0.42 of the stamp for two letters, 0.36 for three or more (1.7). */
export const stampGlyph = (size: number, abbr: string): number => Math.round(size * (abbr.length <= 2 ? 0.42 : 0.36));

/** The stacked pair in Now's 40px mark (4.7, the field round): two bars the mark's width, 19px tall with 2px between, the abbreviation at 10px, a radius of a quarter of the bar. */
export const STACKED = { mark: 40, bar: 19, gap: 2, glyph: 10, radius: 5 } as const;

/** A quarter of the size (1.7). */
export const stampRadius = (size: number): number => Math.round(size / 4);

/** The two stamps on a slider (3.40): the right one 18 + 42v, the left 18 + 42(1 − v); both 39 at the middle, 60 against 18 at an end. Size only, never fading. */
export function sliderStamps(v: number): { left: number; right: number } {
  const t = Math.min(1, Math.max(0, v));
  return { left: Math.round((18 + 42 * (1 - t)) * 10) / 10, right: Math.round((18 + 42 * t) * 10) / 10 };
}

/** The pill on the who-wins line (3.40): the team the thumb leans to and its chance, "Even" at 50. */
export function leanPill(percent: number, away: string, home: string): string {
  if (percent === 50) return "Even";
  return percent > 50 ? `${home} ${percent}%` : `${away} ${100 - percent}%`;
}

/** The word band for a lean (3.40): 0 "Chiefs, no doubt"; 1–15 "Chiefs, surely"; 16–44 "Leaning Chiefs"; 45–55 "Close to even"; 56–84 "Leaning Bills"; 85–99 "Bills, surely"; 100 "Bills, no doubt". */
export function leanBand(percent: number, away: string, home: string): string {
  if (percent <= 0) return `${away}, no doubt`;
  if (percent <= 15) return `${away}, surely`;
  if (percent <= 44) return `Leaning ${away}`;
  if (percent <= 55) return "Close to even";
  if (percent <= 84) return `Leaning ${home}`;
  if (percent <= 99) return `${home}, surely`;
  return `${home}, no doubt`;
}

/** "said Bills 70%", "said Chiefs 55%", "said even": a person's number on a who-wins question (3.7). */
export function saidLean(percent: number, away: string, home: string): string {
  return percent === 50 ? "said even" : `said ${leanPill(percent, away, home)}`;
}

/** Whether a sport's game can end tied, for the tie row and the tie pill (3.40): football only. */
export const canTie = (sport: string): boolean => CAN_TIE[sport as keyof typeof CAN_TIE] === true;
