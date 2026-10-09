/**
 * The keyboard's rules (docs/testing.md session 7; the field round, 2026-10-02). What takes a keyboard, so a
 * sheet can drop it before it moves; nothing else. The guard that once read the phone's viewport for the fixed
 * boxes is gone with the document's scroll (`src/lib/ui/scroller.ts`): a document that never scrolls cannot be
 * left scrolled by a keyboard, which was the one way the layers came off the screen.
 */
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


/** What the root wears while a field holds the keyboard; `globals.css` drops the root to its plain height under it. */
export const TYPING = "data-typing";

/** Under this share of the layout's height, what a phone shows beside a focused field is a keyboard's leftover. */
export const KEYBOARD_SHARE = 0.8;

/**
 * Whether a field's focus brings the keyboard up, so the root drops to its plain height (the first-contact round,
 * 2026-10-04). A phone raises the keyboard for a field a finger touched, and for a focus made while a tap is still
 * being handled (a sheet that focuses its field as it opens); a field a page focuses by itself on arriving takes
 * the caret and no keyboard. The rule was `:focus`, and the code screen's field, focused on arrival, dropped an
 * installed copy's root to 812 of 874 points with no keyboard under it: a band under its sheet (the iOS 26
 * simulator, the same day).
 */
export function typingStarts(focus: { field: boolean; touched: boolean; inGesture: boolean }): boolean {
  return focus.field && (focus.touched || focus.inGesture);
}

/**
 * Whether a finger going down on a field moves the root to its plain height then, before the field takes the focus
 * (the touch-ups round, section 8): iOS places the caret as the focus lands, and a root that changed height after that
 * left the caret in the heading above the join step's name field. A finger only, on a field that is not already
 * focused, while the root is tall; a mouse brings no keyboard. Pure.
 */
export function typingAtTouch(down: { pointerType: string; field: boolean; focused: boolean; typing: boolean }): boolean {
  return down.pointerType !== "mouse" && down.field && !down.focused && !down.typing;
}
/** How long a root moved at the touch waits for the focus before it goes back: a tap that focused nothing. */
export const TOUCH_FOCUS_MS = 700;

/**
 * What the visible part of the screen says once it has moved: with no field focused the root is never typing; with
 * one focused and the visible part under `KEYBOARD_SHARE` of the layout a keyboard is up, however it came (a phone
 * reopened with its keyboard). Anything else leaves the attribute where it is, since a keyboard on its way in has
 * not shrunk anything yet.
 */
export function typingFromViewport(v: { field: boolean; visible: number; layout: number }): boolean | null {
  if (!v.field) return false;
  if (v.visible < v.layout * KEYBOARD_SHARE) return true;
  return null;
}
