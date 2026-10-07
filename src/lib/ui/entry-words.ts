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
 * terms its asker is about to approve stay on screen (the first-contact round, on the iOS 27 simulator). The asker's
 * own question rests too until they are in, so its share row is on screen without scrolling: sending it round is the
 * asker's first move (the second-pass round). Pure.
 */
export function opensRaised(input: { mine: { unsigned?: boolean } | null; number: boolean; draft: boolean; asker?: boolean }): boolean {
  if (input.mine?.unsigned === true) return true;
  return input.mine === null && !input.number && !input.draft && !input.asker;
}

/** The longest name a guest is saved under. */
export const GUEST_NAME_MAX = 40;

/**
 * The name a guest's entry is saved under (the second-pass round, 2026-10-06): what they typed, trimmed, at most
 * `GUEST_NAME_MAX` characters. The server saves exactly this, and the join button says exactly this, whole, so
 * "Justin incognito" is never joined as "Justin". Pure.
 */
export function guestNameOf(typed: string): string {
  return typed.trim().slice(0, GUEST_NAME_MAX);
}

/**
 * Whether the sheet's next step after a guest's entry is keeping it in an account (the second-pass round): always
 * after a new guest's first entry, and for a guest this phone remembers until the step has come once here. Pure.
 */
export function offersKeep(input: { remembered: boolean; offeredHere: boolean }): boolean {
  return !input.remembered || !input.offeredHere;
}

const KEEP_OFFERED_KEY = "dareful_keep_offered";

/** Whether this phone has shown a guest the account step: in its own storage, so a phone that keeps nothing offers it again. */
export function keepOfferedHere(): boolean {
  try {
    return window.localStorage.getItem(KEEP_OFFERED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Remembers on this phone that the account step has been offered. */
export function markKeepOffered(): void {
  try {
    window.localStorage.setItem(KEEP_OFFERED_KEY, "1");
  } catch {
    // A phone that keeps nothing offers it again next time; nothing else changes.
  }
}
