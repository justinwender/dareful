/**
 * First-visit tips (docs/design.md 10.9; built in the first-contact round, 2026-10-04): the first time a person opens
 * a screen, up to three of its sheet's entries, one at a time, each beside the control it describes. Pure here, so
 * the choice and the placement have tests; `FirstTips` draws them. They go with the sheets after the hackathon.
 */
import { INFO_GROUPS, type InfoEntry, type InfoGlyph, type InfoSheet } from "./info";

export const TIPS_AT_MOST = 3;
/** How far the cut-out stands off the control on every side, how far the tip stands off the ring, and how far inside the screen it keeps. */
export const CUT_PAD = 6;
export const TIP_GAP = 6;
export const TIP_EDGE = 12;
export const TIP_MAX_WIDTH = 240;

/** An icon's entry points at its control by its glyph. */
const GLYPH_TARGETS: Partial<Record<InfoGlyph, string>> = { plus: "[data-start]", share: "[data-share]", copy: "[data-copy]", code: "[data-code]", pass: "[data-pass-phone]", more: "[data-more]", back: "[data-back]" };
/** A gesture's entry, and one under "Everything else", points at the labelled control it names. */
const TERM_TARGETS: Record<string, string> = {
  "Swipe the sheet": "[data-sheet-handle]",
  "Swipe the sheet up": "[data-sheet-handle]",
  "Swipe the sheet down": "[data-sheet-handle]",
  "Tap the avatars": "[data-whos-in-stack]",
  "Got a code?": "[data-got-a-code]",
  "A game row": "[data-game-row]",
  "Sign out": "[data-sign-out]",
  Appearance: "[data-appearance-choice]",
};

/** What an entry points at, or null for an entry about a rule, which has nothing to point at. */
export function tipTarget(entry: InfoEntry): string | null {
  return TERM_TARGETS[entry.term] ?? (entry.glyph ? (GLYPH_TARGETS[entry.glyph] ?? null) : null);
}

/** The first entries of a sheet, in its order, that point at a control on the screen; at most three. Rules are skipped, and so is an entry whose control is hidden or off the screen. */
export function tipsFor(sheet: InfoSheet, onScreen: (selector: string) => boolean): Array<{ entry: InfoEntry; target: string }> {
  const out: Array<{ entry: InfoEntry; target: string }> = [];
  for (const g of INFO_GROUPS) {
    if (g === "Rules and timing") continue;
    for (const entry of sheet.groups[g] ?? []) {
      const target = tipTarget(entry);
      if (target && onScreen(target)) out.push({ entry, target });
      if (out.length === TIPS_AT_MOST) return out;
    }
  }
  return out;
}

export type Box = { x: number; y: number; width: number; height: number };

/**
 * Where a tip goes: the cut-out `CUT_PAD` larger than the control on every side, rounded to match; the tip under it
 * when the control is in the top half of the screen and over it otherwise, `TIP_GAP` off the ring, moved sideways
 * to stay `TIP_EDGE` inside the screen; the caret at the middle of the control, kept on the tip.
 */
export function tipPlacement(control: Box, radius: number, screen: { width: number; height: number }, tip: { width: number; height: number }): { cut: Box & { radius: number }; tip: { x: number; y: number }; below: boolean; caretX: number } {
  const cut = { x: control.x - CUT_PAD, y: control.y - CUT_PAD, width: control.width + 2 * CUT_PAD, height: control.height + 2 * CUT_PAD, radius: radius + CUT_PAD };
  const below = control.y + control.height / 2 < screen.height / 2;
  const width = Math.min(tip.width, TIP_MAX_WIDTH, screen.width - 2 * TIP_EDGE);
  const middle = control.x + control.width / 2;
  const x = Math.min(Math.max(middle - width / 2, TIP_EDGE), screen.width - TIP_EDGE - width);
  const ring = 2;
  const y = below ? cut.y + cut.height + ring + TIP_GAP : cut.y - ring - TIP_GAP - tip.height;
  const caretX = Math.min(Math.max(middle - x, 12), width - 12);
  return { cut, tip: { x, y }, below, caretX };
}

/** The screen a tip is remembered for: its shape, so a market once you're in is the same screen as before. */
export function seenAlready(seen: readonly string[], screen: string): boolean {
  return seen.includes(screen);
}
