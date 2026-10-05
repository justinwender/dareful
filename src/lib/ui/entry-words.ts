/**
 * The odds line before anyone touches it (docs/design.md 3.13 as amended 2026-10-04, the owner's call): the thumb at
 * 50%, the words "Slide to your prediction" where the band will read, and the primary saying the number it will
 * enter, so an untouched entry reads "I'm in at 50%". An argument starts all the way to one side instead, and a
 * number or a pick starts empty.
 */
export const UNTOUCHED_PERCENT = 50;
export const SLIDE_PROMPT = "Slide to your prediction";

/** What the header's right side says: the prompt until the first touch, then the words for the number. */
export function headerWords(touched: boolean, value: number | null, words: (v: number) => string): string {
  if (!touched || value === null) return SLIDE_PROMPT;
  return words(value);
}

/**
 * Whether the entry sheet opens raised: a first entry does, so "I'm in at 50%" is on screen without a touch, and so
 * does an entry waiting to be kept (a bound guest's); a number starts on its field at rest, and a draft rests so the
 * terms its asker is about to approve stay on screen (the first-contact round, on the iOS 27 simulator). Pure.
 */
export function opensRaised(input: { mine: { unsigned?: boolean } | null; number: boolean; draft: boolean }): boolean {
  if (input.mine?.unsigned === true) return true;
  return input.mine === null && !input.number && !input.draft;
}
