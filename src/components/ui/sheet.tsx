"use client";

import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { FixedLayer } from "./layers";
import { HANDLE_ROW } from "./handle";
import { nextPosition, RAISED_SHARE, type SheetPosition } from "./pinned-sheet";
import { MOTION, overscroll, settleDuration } from "@/lib/ui/motion";
import { dropKeyboard } from "@/lib/ui/viewport";

/** A drag on the handle closes the sheet past a third of its height, or on a downward flick (9.9). Pure, so it has a test. */
export const FLICK_PX_PER_MS = 0.6;
/**
 * Whether a sheet's content fits in it (9.2, 9.9: the page behind a sheet holds still). A box with nothing to
 * scroll does not keep a pan, whatever it says about its overscroll: the pan goes to the page behind. So a sheet
 * that fits takes no pan at all, and one that overflows scrolls itself and contains it. Pure.
 */
export function contentFits(scrollHeight: number, clientHeight: number): boolean {
  return scrollHeight <= clientHeight + 1;
}

export function dragCloses(pulledPx: number, heightPx: number, velocityPxPerMs: number): boolean {
  if (pulledPx <= 0) return false;
  return pulledPx > heightPx / 3 || velocityPxPerMs >= FLICK_PX_PER_MS;
}

/**
 * Where a modal sheet can stand (the touch-ups round, section 5): the pinned sheet's positions and its handle's rules
 * (`nextPosition`, `SNAP_PX`), with closed where the pinned sheet tucks. It opens raised, at most `RAISED_SHARE` of the
 * screen and no taller than it is; drags up to full, as tall as it is up to the status bar, when raised cannot show
 * it all; and closes when dragged below raised. `panel` is how tall it is laid out (its content, up to the status
 * bar), `screen` the app's box. Pure.
 */
export type ModalMeasure = { panel: number; screen: number };
export function modalPositions(m: ModalMeasure): SheetPosition[] {
  const raised = Math.min(m.panel, Math.round(m.screen * RAISED_SHARE));
  return m.panel > raised + 1 ? ["tucked", "raised", "full"] : ["tucked", "raised"];
}
/** How far below its full height the sheet sits at a position: all of it when closed, what raised hides, nothing at full. Pure. */
export function modalOffset(position: SheetPosition, m: ModalMeasure): number {
  if (position === "tucked") return m.panel;
  if (position === "raised") return Math.max(0, m.panel - Math.min(m.panel, Math.round(m.screen * RAISED_SHARE)));
  return 0;
}
/** Where a drag of `moved` px (down positive) on the handle sends the sheet: one position by direction past the snap, the nearest to where it let go, and a flick down from raised closes it. Pure. */
export function modalNext(current: SheetPosition, moved: number, velocityPxPerMs: number, m: ModalMeasure): SheetPosition {
  const available = modalPositions(m);
  if (current === "raised" && moved > 0 && velocityPxPerMs >= FLICK_PX_PER_MS) return "tucked";
  return nextPosition(current, moved, available, (p) => modalOffset(p, m));
}

/**
 * A modal sheet, for a moment that deserves a pause (an act that binds other people), for the one-time asks, and for
 * a task that covers the screen (the mark picker, the information sheet, signing in, the code).
 *
 * It never locks the page's scroll. The freeze it replaces was exactly that: a third-party sheet set
 * `overflow: clip` on the body, a second sheet failed to appear on iOS, and the lock stayed with nothing on
 * screen to dismiss (docs/decisions.md 2026-09-20). Here a backdrop takes the touches without dimming anything
 * (1.5, 9.2: the page behind a sheet holds still), the sheet contains its own overscroll, and if this component
 * ever fails to render, nothing about the page underneath has changed.
 *
 * Its positions and its handle are the pinned sheet's (the touch-ups round, section 5; `modalNext`): it opens raised,
 * at most three quarters of the screen and no taller than its content; it drags up to full, up to the status bar,
 * when raised cannot show it all; and it closes when dragged below raised, or with a flick. A tap on the handle moves
 * it between raised and full. It is laid out at its full height and sits lower by a `translateY` on itself, and while
 * raised its content scrolls with room under it, so everything in it can be reached at either height. It opens from
 * below over travel on the move curve and closes over base on the leave curve (9.9). The drag is read from the handle
 * row only, so the sheet's own content still scrolls; the handle row is the panel's and stays where it is, so the
 * close is always there and nothing scrolled ever shows above it. A sheet never opens another sheet.
 */
export function Sheet({ open, onClose, labelledBy, children, closeLabel, clear = false }: { open: boolean; onClose: () => void; labelledBy: string; children: ReactNode; /** A word in the close position instead of the cross ("Done" on the mark picker, 3.29). */ closeLabel?: string; /** No backdrop, and what is behind the sheet stays touchable: the sticker sheet over a photo (3.28), where the person holds the photo itself while the sheet says how. Closes only by its close and its handle. */ clear?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  /** Whether the sheet's content fits with nothing to scroll: then a pan that starts in it has nowhere to go but the page behind, so it goes nowhere. */
  const [fits, setFits] = useState(true);
  const [position, setPosition] = useState<SheetPosition>("raised");
  const [m, setM] = useState<ModalMeasure>({ panel: 0, screen: 0 });
  const startY = useRef<number | null>(null);
  const startAt = useRef(0);
  // The distance so far lives in a ref as well as in state: a flick can end before the last move has rendered,
  // and the decision must read what the finger did, not what the screen has caught up to.
  const pulled = useRef(0);
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [settle, setSettle] = useState<number | null>(null);
  /** Kept mounted over base after `open` goes false, so it can leave downward (9.9). */
  const [leaving, setLeaving] = useState(false);
  /** True once the rise has run, from which frame the sheet's own transform is what moves it. */
  const [risen, setRisen] = useState(false);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) {
      // A sheet closing takes its fields with it: the keyboard leaves first, by a blur (viewport.ts).
      if (panel.current?.contains(document.activeElement)) dropKeyboard();
      setRisen(false);
      queueMicrotask(() => setLeaving(true));
      const t = setTimeout(() => {
        setLeaving(false);
        setPosition("raised");
      }, MOTION.base);
      wasOpen.current = open;
      return () => clearTimeout(t);
    }
    wasOpen.current = open;
  }, [open]);
  // Escape closes it, through the latest close the parent gave. The focus moves in when it opens and back when it
  // closes, and at no other time: this effect once listed `onClose`, which a parent passing a new function on every
  // render (pass the phone, whose PIN is its state) re-ran on every digit, and its cleanup's `focus()` on the field
  // already focused restarted the iPhone's keyboard session and put the caret back (the touch-ups round, section 8).
  const escape = useEffectEvent(() => onClose());
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") escape();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      before?.focus();
    };
  }, [open]);

  useEffect(() => {
    const el = scroller.current;
    const box = panel.current;
    if (!open || !el || !box || typeof ResizeObserver === "undefined") return;
    const read = () => {
      setFits(contentFits(el.scrollHeight, el.clientHeight));
      const screen = (document.getElementById("app") ?? document.documentElement).clientHeight;
      const next = { panel: box.offsetHeight, screen };
      setM((was) => (was.panel === next.panel && was.screen === next.screen ? was : next));
    };
    const ro = new ResizeObserver(read);
    ro.observe(el);
    ro.observe(box);
    for (const child of Array.from(el.children)) ro.observe(child);
    read();
    return () => ro.disconnect();
  }, [open, children]);

  if (!open && !leaving) return null;
  const closing = !open && leaving;
  const available = modalPositions(m);
  const at = available.includes(position) ? position : "raised";
  const rest = modalOffset(at, m);
  const highest = modalOffset(available[available.length - 1] ?? "raised", m);
  // The finger's travel, with the pinned sheet's give past the top (a third, 16px at most); down is the way out, so it follows the finger.
  const want = rest + dy;
  const y = want < highest ? highest + overscroll(want - highest) : want;
  /** While raised, room under the content equal to what raised hides, so the end of it scrolls into view. */
  const room = at === "raised" ? rest : 0;
  const settleTo = (to: SheetPosition) => {
    const travel = Math.abs(modalOffset(to, m) - modalOffset(at, m)) || 1;
    setSettle(settleDuration(modalOffset(to, m) - y, travel));
    if (to === "tucked") {
      onClose();
      return;
    }
    setPosition(to);
  };
  return (
    <FixedLayer name="modal">
      <div className={`fixed inset-0 z-50 flex flex-col justify-end ${clear || closing ? "pointer-events-none" : ""}`} data-sheet={clear ? "clear" : closing ? "closing" : "open"} data-sheet-position={at} data-fixed="bottom">
        {/* The backdrop takes the touches and dims nothing: no scrim, no shrinking the page (1.5). */}
        {clear ? null : <button type="button" aria-label="Never mind" tabIndex={-1} onClick={onClose} className="absolute inset-0 touch-none bg-transparent" data-sheet-backdrop="" />}
        {/* The rise and the leave are the wrapper's; the position is the panel's own transform, so the two never fight over one property. */}
        <div
          className={`relative mx-auto flex max-h-[calc(100%_-_env(safe-area-inset-top))] w-full max-w-[430px] flex-col ${closing ? "motion-sink" : risen ? "" : "motion-rise"} ${clear ? "pointer-events-none" : ""}`}
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget && !closing) setRisen(true);
          }}
        >
          <div
            ref={panel}
            role="dialog"
            aria-modal={clear ? undefined : "true"}
            aria-labelledby={labelledBy}
            data-sheet-panel=""
            style={{ transform: y > 0 || y < 0 ? `translateY(${y}px)` : undefined, transition: !dragging && settle !== null ? `transform ${settle}ms var(--ease-move)` : undefined }}
            onTransitionEnd={(e) => {
              if (e.target === e.currentTarget && e.propertyName === "transform") setSettle(null);
            }}
            className={`relative flex max-h-full min-h-0 w-full flex-col overflow-hidden rounded-t-card border border-b-0 border-line bg-surface ${clear ? "pointer-events-auto" : ""}`}
          >
            <div className="relative mx-4 mt-2 shrink-0">
              <div
              {...HANDLE_ROW}
              className="flex h-10 touch-none select-none items-center justify-center"
              onPointerDown={(e) => {
                startY.current = e.clientY;
                startAt.current = performance.now();
                pulled.current = 0;
                setDragging(true);
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {
                  // No active pointer to capture (a synthetic event): the drag still reads from this row.
                }
              }}
              onPointerMove={(e) => {
                if (startY.current === null) return;
                pulled.current = e.clientY - startY.current;
                setDy(pulled.current);
              }}
              onPointerUp={() => {
                const moved = pulled.current;
                const elapsed = Math.max(1, performance.now() - startAt.current);
                startY.current = null;
                pulled.current = 0;
                setDragging(false);
                setDy(0);
                // A tap moves it between raised and full, as a tap on the pinned sheet's grabber moves it (3.24).
                if (Math.abs(moved) < 4) {
                  if (available.includes("full")) settleTo(at === "full" ? "raised" : "full");
                  return;
                }
                settleTo(modalNext(at, moved, moved / elapsed, m));
              }}
              onPointerCancel={() => {
                startY.current = null;
                pulled.current = 0;
                setDragging(false);
                setDy(0);
              }}
            >
              <span aria-hidden="true" className="h-[5px] w-9 rounded-[3px] bg-line-strong" />
            </div>
              {/* The close sits beside the row, not in it: the row captures the pointer and cancels the touch's moves, and a tap on Close must reach Close. */}
              {closeLabel ? (
                <button type="button" onClick={onClose} data-press="line" className="absolute top-0 -right-2 inline-flex h-12 items-center justify-center rounded-button px-3 text-body-sm font-semibold text-ink press-line">
                  {closeLabel}
                </button>
              ) : (
                <button type="button" aria-label="Close" onClick={onClose} data-press="line" className="absolute top-0 -right-2 inline-flex h-12 w-12 items-center justify-center rounded-pill text-ink press-line">
                  <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              )}
            </div>
            <div ref={scroller} style={room > 0 ? { paddingBottom: `calc(max(1.5rem, env(safe-area-inset-bottom)) + ${room}px)` } : undefined} className={`flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] ${fits && !clear ? "touch-none" : ""}`} data-sheet-scroll={fits ? "fits" : "scrolls"}>
              {children}
            </div>
          </div>
        </div>
      </div>
    </FixedLayer>
  );
}
