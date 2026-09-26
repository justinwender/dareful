/**
 * A yes-or-no market's outcomes in the question's own words (docs/design.md 3.25): the two wells ("He fell
 * asleep", "He stayed up") and the two outcome lines ("He did.", "He didn't."), written with the terms and stored
 * on the row as four strings. A market without them, any made before or a write-up that returned none, says
 * "Yes" and "No" on the wells, "Priya says yes" on the claim card, and "Yes." or "No." as the outcome line.
 * Pure, so the fallback has a test.
 */
export type OutcomeWords = { yesWell: string; noWell: string; yesLine: string; noLine: string };

/** The stored order: yes well, no well, yes line, no line. */
export function outcomeWordsOf(d: { outcomeWords?: string[] | null }): OutcomeWords | null {
  const w = d.outcomeWords;
  if (!w || w.length !== 4 || w.some((x) => typeof x !== "string" || x.trim().length === 0)) return null;
  return { yesWell: (w[0] as string).trim(), noWell: (w[1] as string).trim(), yesLine: (w[2] as string).trim(), noLine: (w[3] as string).trim() };
}

/** The well for an outcome: the market's words, else "Yes" or "No". */
export function wellWord(d: { outcomeWords?: string[] | null }, yes: boolean): string {
  const w = outcomeWordsOf(d);
  return w ? (yes ? w.yesWell : w.noWell) : yes ? "Yes" : "No";
}

/** The same in the middle of a sentence: "Priya says he fell asleep", "Priya says yes". */
export function saidWord(d: { outcomeWords?: string[] | null }, yes: boolean): string {
  const w = outcomeWordsOf(d);
  return w ? lowerFirst(yes ? w.yesWell : w.noWell) : yes ? "yes" : "no";
}

/** The settled line: "He did.", "He didn't.", else "Yes." or "No.". Always ends in a full stop. */
export function outcomeLine(d: { outcomeWords?: string[] | null }, yes: boolean): string {
  const w = outcomeWordsOf(d);
  const line = w ? (yes ? w.yesLine : w.noLine) : yes ? "Yes" : "No";
  return /[.!?]$/.test(line) ? line : `${line}.`;
}

/** The words a well may open with that are only capitalised because they open it; a name ("Gabe wore 14") keeps its capital after "Priya says". */
const OPENERS = /^(He|She|They|It|We|You|The|A|An|Nobody|Everyone|Someone|Anyone|Somebody|Everybody|There|This|That|These|Those|No|Yes|Not|Nothing|Both|Neither|Every|Each|One|Two|Three|Four|Five|His|Her|Their|Our|Your|Its|My)\b/;

/** The first letter lowered, for a phrase that follows a name, when it opens with a pronoun or a function word; a name, an initialism or "I" keeps its capital. */
export function lowerFirst(s: string): string {
  const m = OPENERS.exec(s);
  if (!m) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Four phrasings from a write-up, or null when any is missing or too long to be a well. */
export function outcomeWordsFrom(input: { yesWell?: string; noWell?: string; yesLine?: string; noLine?: string } | null | undefined): [string, string, string, string] | null {
  if (!input) return null;
  const parts = [input.yesWell, input.noWell, input.yesLine, input.noLine].map((s) => (typeof s === "string" ? s.trim().replace(/\s+/g, " ") : ""));
  if (parts.some((p) => p.length < 2 || p.length > 48)) return null;
  return parts as [string, string, string, string];
}
