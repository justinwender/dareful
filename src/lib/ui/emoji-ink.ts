import table from "./emoji-inks.json";
import { isInkName, type InkName } from "./ink";

/**
 * The emoji ink table (docs/design.md 1.8, docs/marks-and-memories.md): every emoji the tile renderer's font can
 * draw, mapped straight to an ink, or to null when its colour is a template (faces, hands, everything in People
 * and Body) or when fewer than a quarter of its pixels carry colour. Computed once by `scripts/emoji-inks.py`
 * from Noto Color Emoji, the font the link tiles are drawn with, so a market's ink never depends on which phone
 * asked it: 👕 is Sea everywhere, even on a phone that draws it blue.
 *
 * The keys are exactly what that font can draw. An emoji that is not a key would come out as a blank box on the
 * asking tile, which is the worst place to find out, so the picker never offers one and `drawable` says so.
 */
const TABLE = table as Record<string, string | null>;

/** The table's keys carry no variation selector and no skin tone; a mark is read the same way. */
export function normaliseMark(emoji: string): string {
  let out = "";
  for (const ch of emoji) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0xfe0f || (cp >= 0x1f3fb && cp <= 0x1f3ff)) continue;
    out += ch;
  }
  return out;
}

/** Whether the reference font draws this emoji at all. */
export function drawable(emoji: string): boolean {
  return normaliseMark(emoji) in TABLE;
}

/** The ink the table gives a mark, or null: a hueless or template mark, or one the font cannot draw, falls to the hash. */
export function emojiInk(emoji: string): InkName | null {
  const ink = TABLE[normaliseMark(emoji)];
  return isInkName(ink) ? ink : null;
}

/** How many marks the table knows, for the checks. */
export const EMOJI_INK_COUNT = Object.keys(TABLE).length;
