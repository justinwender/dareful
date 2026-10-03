/**
 * The one thing that scrolls (the field round, 1.1; docs/design.md 9.3 as amended 2026-10-02). The document never
 * does: `html` and `body` are the screen's height with their overflow hidden, and the app root is a box the size
 * of the screen whose own overflow scrolls the page. The tab bar, the Start button, the sheets and the band are
 * fixed to the screen as before, and nothing of theirs depends on where iOS has left the layout viewport, because
 * the layout viewport can no longer be scrolled: on iOS 26 the keyboard scrolled the document to reveal a field
 * and, dismissed, left `visualViewport.offsetTop` above zero, so every box pinned to the bottom drew a keyboard's
 * height up the screen (the owner's phone; Apple's forum threads 800125, 800154 and 799216). Everything that used
 * to read or set the window's scroll reads or sets this box's.
 */
export const SCROLLER_ID = "app";

export function scroller(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.getElementById(SCROLLER_ID);
}

export function scrollTopOf(): number {
  return scroller()?.scrollTop ?? 0;
}

export function scrollPageTo(top: number, behavior: ScrollBehavior = "instant"): void {
  scroller()?.scrollTo({ top, behavior });
}
