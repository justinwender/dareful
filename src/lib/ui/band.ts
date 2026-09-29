import { closesLabel, endedClock } from "./copy";

/**
 * The band's clock (docs/design.md 3.25, 3.37, 3.38): "Closes …" while open, "Resolving …" once closed with
 * nobody having said, "Voting ends …" once someone has, and after the end when it settled, voided, was called off
 * or closed for good. One function for the market's own screen and for the shell a row draws before the screen
 * arrives (9.4), so the two say the same words. Pure.
 */
export function bandClock(input: { state: string; resolvesBy: Date | null; resolvedAt: Date | null; resolvedBy: string | null; votes: number; now: Date; zone: string }): string | null {
  const { state, resolvesBy, resolvedAt, resolvedBy, votes, now, zone } = input;
  if (state === "open" && resolvesBy) return `Closes ${closesLabel(resolvesBy, now, zone)}`;
  if (state === "locked" && resolvesBy && votes === 0) return `Resolving ${closesLabel(resolvesBy, now, zone)}`;
  if (state === "locked" && resolvesBy) return `Voting ends ${closesLabel(resolvesBy, now, zone)}`;
  if ((state === "resolved" || state === "voided" || state === "expired") && (resolvedAt ?? resolvesBy)) return endedClock(state, resolvedBy, (resolvedAt ?? resolvesBy) as Date, now, zone);
  return null;
}
