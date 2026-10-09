/**
 * First-visit tips (docs/design.md 10.9; built in the first-contact round, 2026-10-04): the first time a person opens
 * a screen, up to three of its sheet's entries, one at a time, each beside the control it describes. Pure here, so
 * the choice and the placement have tests; `FirstTips` draws them. They go with the sheets after the hackathon.
 */
import { INFO_GROUPS, type InfoEntry, type InfoSheet } from "./info";

export const TIPS_AT_MOST = 3;
/** How far the cut-out stands off the control on every side, how far the tip stands off the ring, and how far inside the screen it keeps. */
export const CUT_PAD = 6;
export const TIP_GAP = 6;
export const TIP_EDGE = 12;
export const TIP_MAX_WIDTH = 240;

/**
 * The tips there are (the final round, section 3; docs/design.md 10.9 as amended 2026-10-08): "Ask something" once per
 * person, the first time its control shows, since the + is the same on every tab; on a market, each way to share, pass
 * the phone and adding photos; when asking, the mark, stickers and each choice; on People, who's got who; on a person's
 * page, I got this one. Every tip is remembered on its own, once it has shown. Their words are the screens' own, as
 * last round wrote them. The keys moved from `/tip/` to `/tips/`: the touch-ups round's build wrote each `/tip/` key
 * as seen on a frame where the tip never showed, so those say nothing about what anyone has read.
 */
export type Tip = { entry: InfoEntry; target: string; key: string };
export const ASK_SOMETHING_KEY = "/tips/ask-something";
/** The +, on a root with something on it; the chalk "Ask something" on an empty Now, where the + is hidden. */
export const ASK_TARGET = "[data-start], [data-ask-something]";

const tip = (key: string, target: string, term: string, description: string): Tip => ({ key: `/tips/${key}`, target, entry: { term, description } });
const MARKET_TIPS = [
  // The share button, never the bars of where the stake sits, which carry `data-share` for whose share each is.
  tip("share", "button[data-share]", "Share", "Sends the question and its link to a chat; the preview shows who asks and when it closes."),
  tip("copy", "button[data-copy]", "Copy the link", "Copies it; the icon turns to a check for a moment."),
  tip("code", "button[data-code]", "Show a code to scan", "A code a friend scans with their own phone to open this market."),
  tip("pass", "button[data-pass-phone]", "Pass the phone", "A friend makes their call on your phone, with their own PIN."),
  tip("photos", "[data-empty-slot], [data-add-tile]", "Photos", "Add them here; everyone in it and its group sees them."),
];
/** The tips by the information sheet of the screen they show on, in order. Every state of a market, and a game's page, shares the market's. */
export const CURATED_TIPS: Record<string, Tip[]> = {
  ...Object.fromEntries(
    ["market-draft", "market-open", "market-open-number", "market-open-pick", "market-calls", "market-ruling", "market-voting", "market-voting-number", "market-voting-pick", "market-ended", "market-memory", "market-link", "game", "game-link", "game-night"].map((k) => [k, MARKET_TIPS]),
  ),
  "ask-question": [
    tip("mark", "[data-add-mark]", "Add a mark", "Opens the picker; a mark with a colour of its own gives the question that colour."),
    tip("stickers", "[data-add-mark]", "Stickers", "Make one from a photo here, or hold a photo’s subject on an iPhone, tap Copy, and paste it in."),
    tip("pace", "[data-pace-choice]", "What kind of thing", "Something that’ll happen, or an argument between two of you that the app rules on."),
    tip("type", "[data-market-type]", "Market type", "Yes or no, a number, or one of up to six answers."),
    tip("setup", "[data-ai-setup]", "AI market setup", "Quick setup writes the terms from your line; Help define the terms asks three things first."),
  ],
  people: [tip("people", "[data-person-row]", "Who’s got who", "Everyone with something open with you right now; a row opens what’s between you two.")],
  person: [tip("got-this", "[data-cover-open]", "I got this one", "Logs what you covered; once they say yep, it’s on the record between you two.")],
};

/** The screen's own words for "Ask something", or null on a screen whose sheet has none. Pure. */
function askSomethingIn(sheet: InfoSheet): InfoEntry | null {
  for (const g of INFO_GROUPS) for (const entry of sheet.groups[g] ?? []) if (entry.term === "Ask something") return { term: entry.term, description: entry.description };
  return null;
}

/**
 * A screen's tips, at most three at a time: "Ask something" first while it was never shown and its control is on the
 * screen, then the screen's own tips that were never shown and whose control is on the screen, in order. Pure.
 */
export function tipsFor(sheet: InfoSheet, onScreen: (selector: string) => boolean, opts: { key?: string; seen?: readonly string[] } = {}): Tip[] {
  const seen = opts.seen ?? [];
  const out: Tip[] = [];
  const ask = askSomethingIn(sheet);
  if (ask && !seen.includes(ASK_SOMETHING_KEY) && onScreen(ASK_TARGET)) out.push({ key: ASK_SOMETHING_KEY, target: ASK_TARGET, entry: ask });
  for (const t of (opts.key ? CURATED_TIPS[opts.key] : undefined) ?? []) if (!seen.includes(t.key) && onScreen(t.target)) out.push(t);
  return out.slice(0, TIPS_AT_MOST);
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
