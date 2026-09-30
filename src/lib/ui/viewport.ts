/**
 * The phone's viewport out of step (docs/testing.md sessions 7 and 30; docs/decisions.md 2026-09-29). A
 * browser lays `position: fixed` boxes against its layout viewport and shows the visual viewport, and on an
 * iPhone the two can be left apart once a keyboard has been up and gone: the visual viewport offset from the
 * top, or shorter than the window. Every fixed box is then drawn off its place by the same distance (the tab
 * bar and the sheet mid-screen with the page showing under them, the status band gone from behind the clock),
 * and rides with the page over that distance as it scrolls. The state belongs to the document, so moving to
 * another screen inside the app carries it along. Nothing in the page causes it: the grain and the status
 * band, which no page ancestor contains, move with the rest.
 *
 * The rules here are deliberately narrow. While something is being typed into, the short viewport is real (the
 * keyboard is up); under pinch zoom the visual viewport is meant to be smaller than the window. Only a viewport
 * that is short or offset with nothing typing and no zoom is out of step. Pure, so a test can hold them.
 */
export type ViewportReading = {
  scale: number;
  offsetTop: number;
  height: number;
  innerHeight: number;
  typing: boolean;
};

export function viewportStuck(r: ViewportReading): boolean {
  if (r.typing) return false;
  if (r.scale !== 1) return false;
  return r.offsetTop !== 0 || r.innerHeight - r.height >= 1;
}

/**
 * Where fixed boxes were laid out against where the glass is, read from two probes that are themselves fixed,
 * one at `top: 0` and one at `bottom: 0`: the top one's top edge and the bottom one's bottom edge, in the
 * coordinates of what is on the glass, and the height of the glass.
 */
export type EdgeReading = { topProbeTop: number; bottomProbeBottom: number; glassHeight: number };

/**
 * How far a box pinned to the top and a box pinned to the bottom must move, on themselves, to sit on the glass:
 * null when nothing is out of step, when something is being typed into, or under pinch zoom.
 */
export function viewportShift(r: Pick<ViewportReading, "scale" | "typing">, e: EdgeReading): { top: number; bottom: number } | null {
  if (r.typing) return null;
  if (r.scale !== 1) return null;
  const top = Math.round(-e.topProbeTop);
  const bottom = Math.round(e.glassHeight - e.bottomProbeBottom);
  if (Math.abs(top) < 1 && Math.abs(bottom) < 1) return null;
  return { top, bottom };
}

/** Whether an element takes the keyboard. */
export function takesKeyboard(el: { tagName?: string; isContentEditable?: boolean; getAttribute?: (name: string) => string | null } | null | undefined): boolean {
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if (tag === "input") {
    const type = (el.getAttribute?.("type") ?? "text").toLowerCase();
    return !["button", "checkbox", "radio", "range", "submit", "reset", "file", "image", "color", "hidden"].includes(type);
  }
  return el.isContentEditable === true;
}

/**
 * The keyboard leaves by a blur, before the field it belongs to is taken off the page: a step changing under a
 * transition, an entry landing, a sheet closing. A field removed while it still holds the keyboard is the
 * condition the out-of-step viewport is reported under, so nothing here tears a focused field down.
 */
export function dropKeyboard(): void {
  if (typeof document === "undefined") return;
  const el = document.activeElement;
  if (el instanceof HTMLElement && takesKeyboard(el)) el.blur();
}

export const VIEWPORT_ATTR = "data-viewport-shift";
