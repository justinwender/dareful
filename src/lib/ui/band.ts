import { CALLS_ARE_IN, closesClock, closesLabel, endedClock, FIRST_CALL_CLOSE, IT_HAPPENED } from "./copy";

/**
 * The band's clock (docs/design.md 3.25, 3.37, 3.38): "Closes …" while open, "Calls are in" once closed and "It's
 * happened" once the vote opens with nobody having said, "Voting ends …" once someone has, and after the end when it settled, voided, was called off
 * or closed for good. One function for the market's own screen and for the shell a row draws before the screen
 * arrives (9.4), so the two say the same words. Pure.
 */
export function bandClock(input: { state: string; resolvesBy: Date | null; resolvedAt: Date | null; resolvedBy: string | null; votes: number; now: Date; zone: string; /** Closed and the vote open: it has happened (the games-and-the-reveal round). */ votingOpen?: boolean; /** A game's question started while the game is on, before its first call (section 5). */ firstCall?: boolean }): string | null {
  const { state, resolvesBy, resolvedAt, resolvedBy, votes, now, zone } = input;
  if (state === "open" && resolvesBy) return closesClock(resolvesBy, now, zone);
  if (state === "open" && input.firstCall) return FIRST_CALL_CLOSE;
  // The stretch after the close (3.23, the fifteenth session): "Calls are in" until it has happened, then "It's happened" until someone says what did.
  if (state === "locked" && votes === 0) return input.votingOpen ? IT_HAPPENED : CALLS_ARE_IN;
  if (state === "locked" && resolvesBy) return `Voting ends ${closesLabel(resolvesBy, now, zone)}`;
  if ((state === "resolved" || state === "voided" || state === "expired") && (resolvedAt ?? resolvesBy)) return endedClock(state, resolvedBy, (resolvedAt ?? resolvesBy) as Date, now, zone);
  return null;
}
