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

