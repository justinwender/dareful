/**
 * A sheet's handle row claims its drag twice over (docs/design.md 3.24, 6.4, 9.9; 5.5 as amended 2026-09-29): by
 * `touch-action: none` on the row, which tells the browser the pan is not the page's, and by cancelling the
 * touch's moves, for a browser that takes the pan anyway. React's own touch props are passive and cannot
 * cancel, so the listener is attached to the node itself. It is a ref callback with a cleanup, so it follows
 * the row's node when a fixed layer moves into the layers host after hydration, and when a modal mounts.
 */
export function claimDrag(row: Pick<HTMLElement, "addEventListener" | "removeEventListener"> | null): (() => void) | undefined {
  if (!row) return undefined;
  const claim = (e: Event) => {
    if (e.cancelable) e.preventDefault();
  };
  row.addEventListener("touchmove", claim, { passive: false });
  return () => row.removeEventListener("touchmove", claim);
}

/** What a handle row carries: the claim, and the name a test and the pull rule read. */
export const HANDLE_ROW = { ref: claimDrag, "data-sheet-handle": "" } as const;

/** The layers that own the touches that start in them (5.5): a pull to re-read starts on the page, never in one of these. */
const OWN_THEIR_TOUCHES: ReadonlySet<string> = new Set(["sheet", "modal", "ask"]);

/** Whether a touch that started in this layer (null for none), inside a dialog or not, may start a pull to re-read. Pure. */
export function pullStartsHere(layer: string | null, inDialog: boolean): boolean {
  return !inDialog && !(layer !== null && OWN_THEIR_TOUCHES.has(layer));
}
