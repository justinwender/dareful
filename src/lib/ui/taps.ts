/**
 * A tap counts only on the control it began on. On a phone the click is dispatched to whatever is under the
 * finger when it lifts, and the pinned sheet moves under a finger: a touch on the odds line raises it, and
 * its primary rose into the same spot, so one 60ms tap on the line entered a person at 77% and $5 without
 * a second thought (production, the QA round, 2026-09-29). Here the sheet keeps the target the pointer went
 * down on and refuses a click on a control that does not contain it. A keyboard, a screen reader or a script
 * clicks with no pointer and always counts; a press on something that has since left the page cannot be
 * judged and counts too.
 */
export type Pressed = { isConnected: boolean } | null;
export type Control = { contains(other: unknown): boolean } | null;

export const CONTROLS = "button, a[href], input, select, textarea, label, [role='button']";

export function tapCounts(pressed: Pressed, click: { control: Control; byPointer: boolean }): boolean {
  if (!click.byPointer) return true;
  if (!click.control) return true;
  if (!pressed || !pressed.isConnected) return true;
  return click.control.contains(pressed);
}
