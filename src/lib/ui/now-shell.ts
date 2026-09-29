/**
 * Now's shell at a cold start (docs/design.md 11.5): the header row, the tab bar and the + for someone signed in,
 * drawn before the account's row or anything on Now has been read, with the content fading in as it arrives.
 * Whether someone is signed in is in their cookie. Whether their Now is empty is not, and an empty Now has no +
 * and no "Got a code?" (3.14: asking is already the chalk, and the six boxes are on the screen), so the phone
 * remembers which it was the last time in a cookie beside the zone's: a display convenience and nothing else,
 * never stored, and corrected by the content the moment it arrives. Pure.
 */
export const NOW_COOKIE = "dareful_now";
export type NowState = "full" | "empty";

/** What the shell draws before the content says: full unless the phone remembers an empty Now. */
export function nowHintOf(raw: string | null | undefined): NowState {
  return raw === "empty" ? "empty" : "full";
}

/** The cookie's text for a state, a year like the zone's. */
export function nowCookie(state: NowState): string {
  return `${NOW_COOKIE}=${state}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * What of the shell shows, from what the content says and, until it has, from the hint. The stylesheet applies
 * the same rule with `:has()` so it holds before any script runs; this is the rule as a function, for its test.
 */
export function shellShows(hint: NowState, content: NowState | "out" | null): { start: boolean; gotCode: boolean; sheet: "now" | "now-first-run"; bar: boolean } {
  const state = content ?? hint;
  if (state === "out") return { start: false, gotCode: false, sheet: "now", bar: false };
  return { start: state === "full", gotCode: state === "full", sheet: state === "full" ? "now" : "now-first-run", bar: true };
}
