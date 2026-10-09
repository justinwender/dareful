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

/**
 * A tip remembered on its own rather than with its screen (the touch-ups round, section 10; docs/design.md 10.9 as
 * amended 2026-10-08): "Ask something" once per person, since the + is the same on every tab, and each of the new tips
 * once, wherever its control first shows. The key is what the account (or a guest's phone) keeps.
 */
export type Tip = { entry: InfoEntry; target: string; key?: string };
export const ASK_SOMETHING_KEY = "/tip/ask-something";

const tip = (key: string, target: string, term: string, description: string): Tip => ({ key, target, entry: { term, description } });
const MARKET_TIPS = [
  tip("/tip/share", "[data-share]", "Share", "Sends the question and its link to a chat; the preview shows who asks and when it closes."),
  tip("/tip/copy", "[data-copy]", "Copy the link", "Copies it; the icon turns to a check for a moment."),
  tip("/tip/code", "[data-code]", "Show a code to scan", "A code a friend scans with their own phone to open this market."),
  tip("/tip/pass", "[data-pass-phone]", "Pass the phone", "A friend makes their call on your phone, with their own PIN."),
  tip("/tip/photos", "[data-empty-slot], [data-add-tile]", "Photos", "Add them here; everyone in it and its group sees them."),
];
/** The new tips, by the information sheet of the screen they show on, in order; their words are the sheet's where it has them. */
export const CURATED_TIPS: Record<string, Tip[]> = {
  "market-open": MARKET_TIPS,
  "market-open-number": MARKET_TIPS,
  "market-open-pick": MARKET_TIPS,
  "ask-question": [
    tip("/tip/mark", "[data-add-mark]", "Add a mark", "Opens the picker; a mark with a colour of its own gives the question that colour."),
    tip("/tip/stickers", "[data-add-mark]", "Stickers", "Make one from a photo here, or hold a photo’s subject on an iPhone, tap Copy, and paste it in."),
    tip("/tip/pace", "[data-pace-choice]", "What kind of thing", "Something that’ll happen, or an argument between two of you that the app rules on."),
    tip("/tip/type", "[data-market-type]", "Market type", "Yes or no, a number, or one of up to six answers."),
    tip("/tip/setup", "[data-ai-setup]", "AI market setup", "Quick setup writes the terms from your line; Help define the terms asks three things first."),
  ],
  people: [tip("/tip/people", "[data-person-row]", "Who’s got who", "Everyone with something open with you right now; a row opens what’s between you two.")],
  person: [tip("/tip/got-this", "[data-cover-open]", "I got this one", "Logs what you covered; once they say yep, it’s on the record between you two.")],
};

/**
 * A screen's tips, at most three at a time. A screen with new tips shows those it has a control on screen for and
 * that were never shown, each remembered on its own; any other screen shows the first entries of its sheet, in its
 * order, that point at a control on the screen (rules are skipped, and so is an entry whose control is hidden or off
 * the screen), remembered with the screen, with "Ask something" left out once it has been seen anywhere. Pure.
 */
export function tipsFor(sheet: InfoSheet, onScreen: (selector: string) => boolean, opts: { key?: string; seen?: readonly string[] } = {}): Tip[] {
  const seen = opts.seen ?? [];
  const curated = opts.key ? CURATED_TIPS[opts.key] : undefined;
  if (curated) return curated.filter((t) => !seen.includes(t.key as string) && onScreen(t.target)).slice(0, TIPS_AT_MOST);
  const out: Tip[] = [];
  for (const g of INFO_GROUPS) {
    if (g === "Rules and timing") continue;
    for (const entry of sheet.groups[g] ?? []) {
      const target = tipTarget(entry);
      const key = target === GLYPH_TARGETS.plus ? ASK_SOMETHING_KEY : undefined;
      if (key && seen.includes(key)) continue;
      if (target && onScreen(target)) out.push(key ? { entry, target, key } : { entry, target });
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
  const width = Math.min(tip.width, TIP_MAX_WIDTH, screen.width - 2 * TIP_EDGE);
  const middle = control.x + control.width / 2;
  const x = Math.min(Math.max(middle - width / 2, TIP_EDGE), screen.width - TIP_EDGE - width);
  const ring = 2;
  const under = cut.y + cut.height + ring + TIP_GAP;
  const over = cut.y - ring - TIP_GAP - tip.height;
  // Under a control in the top half, over one in the bottom half; and where that side has no room, the other (the touch-ups round: a card over the + was cut off at the top edge).
  const preferBelow = control.y + control.height / 2 < screen.height / 2;
  const fitsBelow = under + tip.height <= screen.height - TIP_EDGE;
  const fitsAbove = over >= TIP_EDGE;
  const below = preferBelow ? fitsBelow || !fitsAbove : !fitsAbove && fitsBelow;
  const y = Math.min(Math.max(below ? under : over, TIP_EDGE), Math.max(TIP_EDGE, screen.height - TIP_EDGE - tip.height));
  const caretX = Math.min(Math.max(middle - x, 12), width - 12);
  return { cut, tip: { x, y }, below, caretX };
}

/** The screen a tip is remembered for: its shape, so a market once you're in is the same screen as before. */
export function seenAlready(seen: readonly string[], screen: string): boolean {
  return seen.includes(screen);
}
