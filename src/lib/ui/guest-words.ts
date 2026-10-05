import type { GuestLine } from "@/lib/ledger/guest";

/** The guest line's words (docs/design.md 3.46): the one thing an account gets, and the stronger line where a guest's win stands. */
export function guestLineWords(line: GuestLine): string {
  if (line === "called") return "You called it. Sign up so it counts.";
  if (line === "closest") return "You were closest. Sign up so it counts.";
  return "Sign up and Dareful will remind you when it’s time to vote.";
}

/** Its height: the first line takes two lines at 390px, the win's one (3.46). */
export const GUEST_LINE_HEIGHT: Record<GuestLine, number> = { first: 64, called: 44, closest: 44 };
