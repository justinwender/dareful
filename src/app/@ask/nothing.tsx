/**
 * The ask slot's way out (docs/design.md 9.5; docs/decisions.md 2026-09-29): every address asking leaves for holds
 * nothing here. Without it the slot kept what it held when the address moved on, so a question just sent opened at
 * its own address with the steps of asking still over it, and every later re-read of that screen rendered the ask
 * screen again behind it. The addresses are named one by one rather than caught all at once: a catch-all in the
 * slot makes every address a matched one, and an address with no screen then gets Next's own fallback page instead
 * of the code screen (5.4), so the ones asking can reach are listed here: the four roots it rises from, the question
 * it sends, "Got a code?", and the market whose photo offered a sticker.
 */
export default function AskNothing() {
  return null;
}
