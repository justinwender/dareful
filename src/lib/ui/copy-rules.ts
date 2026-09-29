/**
 * Copy the product never says, as patterns a lint can hold (docs/design.md 4.9, 10.6). Two lists.
 *
 * `CUT_PHRASES` are phrases cut from every screen, sheet, share text and notice. The style lint refuses them
 * anywhere under `src` before every build, and the sheet lint and the page scan refuse them where they read.
 *
 * `DESIGN_WORDS` are the design document's own names for things, which no screen ever shows. An information
 * sheet names a thing as the screen names it, or by what a person sees (10.6), so a sheet that borrows one is
 * refused. Pure.
 */
export const CUT_PHRASES: ReadonlyArray<{ phrase: RegExp; said: string; why: string }> = [
  { phrase: /\bput(?:s|ting)? your numbers? on it\b/i, said: "Put your number on it", why: "cut everywhere, since it reads awkwardly and a pick-one question has no number (4.9)" },
  { phrase: /\bvote is signed\b/i, said: "Your vote is signed", why: "out, since the copy rules keep signing's vocabulary off every screen (4.6): a vote only ever comes from your own phone" },
];

export const DESIGN_WORDS: ReadonlyArray<{ word: RegExp; said: string }> = [
  { word: /\bthe chalk\b/i, said: "the chalk" },
  { word: /\bband\b/i, said: "the band" },
  { word: /\bwells\b|\bthe well\b/i, said: "the wells" },
  { word: /\bphoto moment\b/i, said: "the photo moment" },
  { word: /\brally\b/i, said: "the rally" },
  { word: /\b(?:the|a|this|that|your|last|one) sets?\b|\bsets? of (?:people|one)\b/i, said: "the set" },
  { word: /\bslot\b/i, said: "the slot" },
  { word: /\badd tile\b/i, said: "the add tile" },
  { word: /\bowner[’']s colou?r\b/i, said: "the owner's colour" },
  { word: /\bcount line\b/i, said: "the count line" },
  { word: /\bcitron\b/i, said: "citron" },
  { word: /\bcontext chips?\b/i, said: "the context chips" },
  { word: /\bin stone\b/i, said: "stone" },
  { word: /\bthe frame\b|\bframe[’']s\b/i, said: "the frame" },
];

/** Every cut phrase a text says. */
export function cutPhrasesIn(text: string): string[] {
  return CUT_PHRASES.filter((c) => c.phrase.test(text)).map((c) => c.said);
}

/** Every one of the design's own words a text borrows. */
export function designWordsIn(text: string): string[] {
  return DESIGN_WORDS.filter((d) => d.word.test(text)).map((d) => d.said);
}
