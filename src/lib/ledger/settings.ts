/**
 * The settings on You (the touch-ups round, section 11, in their smallest versions): a name to change, stake units of
 * your own, and a sticker saved to your marks. The rules here are pure, so they have tests; the actions call them.
 */
import { isIdentifier } from "@/lib/auth/login";

export const NAME_MAX = 40;
/** The same words the sign-up step says, at the same field (3.17). */
export const NOT_A_NAME = "Say what your friends call you.";

/** What a name typed on You is wrong with, or null: what the sign-up step and the link page refuse, refused here too. Pure. */
export function nameProblem(raw: string): string | null {
  const name = raw.trim();
  if (name.length === 0 || isIdentifier(name)) return NOT_A_NAME;
  if (name.length > NAME_MAX) return "That’s longer than a name.";
  return null;
}

export const OWN_UNITS_MAX = 6;
export const OWN_UNIT_MAX = 24;
/** The units every question already offers (Dollars, beers, rounds, a next time) and coffee, which a set's units carry. */
const ALREADY = new Set(["dollar", "dollars", "$", "beer", "beers", "round", "rounds", "next time", "a next time", "next times", "coffee", "coffees"]);

/**
 * A stake unit of your own from what was typed: a word or two, lower case, letters only, never one every question
 * already offers, never one you have, and six at most. Offered as a quoted word beside the others when you ask, as
 * any invented unit is (the second rationale). Pure.
 */
export function ownUnitOf(raw: string, have: readonly string[]): { label: string } | { error: string } {
  const label = raw.trim().replace(/\s+/g, " ").toLowerCase();
  if (label.length === 0) return { error: "Say what it is, like pizza." };
  if (label.length > OWN_UNIT_MAX) return { error: "A unit is a word or two." };
  if (!/^[\p{L}][\p{L}' -]*$/u.test(label)) return { error: "Letters only, like pizza." };
  if (ALREADY.has(label)) return { error: "That one’s offered already." };
  if (have.some((h) => h.toLowerCase() === label)) return { error: "You have that one." };
  if (have.length >= OWN_UNITS_MAX) return { error: "That’s six. Take one off first." };
  return { label };
}
