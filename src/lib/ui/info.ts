/**
 * The information icon and its sheets (docs/design.md section 10), for the hackathon only: every full screen a
 * person can look around carries a 22px circled-i at its top right, opening a sheet that lists everything they
 * can do there. One switch removes it and returns every corner to its place (10.3).
 */
import { cutPhrasesIn, designWordsIn } from "./copy-rules";

export const INFO_ICON_ON = true;

/** A sheet's entry (10.6): a term of five words at most, one sentence of at most 90 characters, and an optional qualifier. */
export type InfoEntry = { term: string; description: string; qualifier?: string; /** An icon's own glyph, drawn before its name (10.4). */ glyph?: InfoGlyph };
export type InfoGlyph = "more" | "share" | "copy" | "code" | "pass" | "camera" | "back" | "close" | "down" | "chevron" | "check" | "remove" | "save" | "sticker" | "plus" | "info";
export type InfoGroup = "Gestures" | "Icons" | "Rules and timing" | "Everything else";
export const INFO_GROUPS: readonly InfoGroup[] = ["Gestures", "Icons", "Rules and timing", "Everything else"];
export type InfoSheet = { /** The screen's name, five words at most, sentence case. */ name: string; groups: Partial<Record<InfoGroup, InfoEntry[]>> };

/** The one line every sheet carries, word for word (10.7). */
export const INFO_FIXED_LINE = "This sheet is here only for the hackathon, so every feature on every screen can be seen.";

export const INFO_TERM_WORDS = 5;
export const INFO_DESCRIPTION_CHARS = 90;
export const INFO_ENTRIES_MAX = 16;

/** The words a gesture is named with (10.6): never press, long-press, click or scroll. */
export const GESTURE_WORDS = ["Tap", "Hold", "Drag", "Swipe", "Pinch"] as const;

/** The checks 10.6 asks for, as reasons a sheet fails; empty when it holds. Pure, so the lint over the sheets can fail. */
export function sheetProblems(sheet: InfoSheet): string[] {
  const out: string[] = [];
  if (sheet.name.trim().split(/\s+/).length > INFO_TERM_WORDS) out.push(`name over ${INFO_TERM_WORDS} words: "${sheet.name}"`);
  const groups = Object.keys(sheet.groups) as InfoGroup[];
  let last = -1;
  let total = 0;
  for (const g of groups) {
    const i = INFO_GROUPS.indexOf(g);
    if (i === -1) out.push(`unknown group "${g}"`);
    if (i < last) out.push(`group "${g}" out of order`);
    last = i;
    const entries = sheet.groups[g] ?? [];
    if (entries.length === 0) out.push(`empty group "${g}"`);
    total += entries.length;
    for (const e of entries) {
      if (e.term.trim().split(/\s+/).length > INFO_TERM_WORDS) out.push(`term over ${INFO_TERM_WORDS} words: "${e.term}"`);
      if (e.description.length > INFO_DESCRIPTION_CHARS) out.push(`description over ${INFO_DESCRIPTION_CHARS} characters: "${e.description}"`);
      if (!/[.]$/.test(e.description.trim())) out.push(`description is not one sentence: "${e.description}"`);
      if ((e.description.match(/[.!?](\s|$)/g) ?? []).length > 1) out.push(`description is more than one sentence: "${e.description}"`);
      if (/!/.test(e.description) || /!/.test(e.term)) out.push(`exclamation mark: "${e.term}"`);
      if (g === "Gestures" && !GESTURE_WORDS.some((w) => e.term.startsWith(w))) out.push(`a gesture starts with Tap, Hold, Drag, Swipe or Pinch: "${e.term}"`);
      if (/\b(press|long-press|click|scroll|button|simply)\b/i.test(`${e.term} ${e.description}`)) out.push(`banned word in "${e.term}"`);
      if (g === "Icons" && !e.glyph) out.push(`an icon's entry names its glyph: "${e.term}"`);
      // A thing is named as the screen names it, or by what a person sees, never by the design's word for it; and a phrase cut everywhere is cut here.
      const words = `${e.term} ${e.description} ${e.qualifier ?? ""}`;
      for (const w of designWordsIn(words)) out.push(`says "${w}", the design's word, which no screen shows: "${e.term}"`);
      for (const c of cutPhrasesIn(words)) out.push(`says "${c}", which is cut everywhere: "${e.term}"`);
    }
  }
  if (total > INFO_ENTRIES_MAX) out.push(`${total} entries; a sheet holds at most ${INFO_ENTRIES_MAX}`);
  if (total === 0) out.push("a sheet with nothing in it");
  return out;
}
