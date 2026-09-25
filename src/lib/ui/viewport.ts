/**
 * When the visual viewport is stuck (docs/testing.md, session 7). iOS 26.0 has a regression: once the keyboard
 * has been up and gone, Safari can leave the visual viewport a little shorter than the window and offset from
 * the top, and everything `position: fixed` then tracks that stale viewport rather than the screen. A bar pinned
 * to the bottom sits above the home indicator with the page showing under it, and drifts when the page is
 * scrolled up. The state lasts for the life of the document, so a client-side navigation carries it to every
 * screen after the one where something was typed.
 *
 * The rule is deliberately narrow. While something is focused the short viewport is real (the keyboard is up);
 * under pinch zoom the visual viewport is meant to be smaller than the window. Only a viewport that is short or
 * offset with nothing typing and no zoom is stuck.
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
