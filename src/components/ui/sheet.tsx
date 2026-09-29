"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FixedLayer } from "./layers";
import { MOTION } from "@/lib/ui/motion";

/** A drag on the handle closes the sheet past a third of its height, or on a downward flick (9.9). Pure, so it has a test. */
export const FLICK_PX_PER_MS = 0.6;
export function dragCloses(pulledPx: number, heightPx: number, velocityPxPerMs: number): boolean {
  if (pulledPx <= 0) return false;
  return pulledPx > heightPx / 3 || velocityPxPerMs >= FLICK_PX_PER_MS;
}

/**
 * A modal sheet, for a moment that deserves a pause (an act that binds other people) and for the one-time asks.
 *
 * It never locks the page's scroll. The freeze it replaces was exactly that: a third-party sheet set
 * `overflow: clip` on the body, a second sheet failed to appear on iOS, and the lock stayed with nothing on
 * screen to dismiss (docs/decisions.md 2026-09-20). Here a backdrop takes the touches without dimming anything
 * (1.5, 9.2: the page behind a sheet holds still), the sheet contains its own overscroll, and if this component
 * ever fails to render, nothing about the page underneath has changed.
 *
 * It opens from below over travel on the move curve and closes over base on the leave curve (9.9), moving by a
 * `translateY` on itself in the modal layer (9.3). A modal sheet closes with a 48px close at its top right and by
 * dragging its handle down past a third of its height or with a flick (6.4); the drag is read from the handle row
 * only, so the sheet's own content still scrolls. A sheet never opens another sheet.
 */
export function Sheet({ open, onClose, labelledBy, children, closeLabel, tall = false, clear = false }: { open: boolean; onClose: () => void; labelledBy: string; children: ReactNode; /** A word in the close position instead of the cross ("Done" on the mark picker, 3.29). */ closeLabel?: string; /** A fixed 560px sheet (the mark picker), instead of one that fits its content. */ tall?: boolean; /** No backdrop, and what is behind the sheet stays touchable: the sticker sheet over a photo (3.28), where the person holds the photo itself while the sheet says how. Closes only by its close and its handle. */ clear?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const startAt = useRef(0);
  // The distance so far lives in a ref as well as in state: a flick can end before the last move has rendered,
  // and the decision to close must read what the finger did, not what the screen has caught up to.
  const pulled = useRef(0);
  const [dy, setDy] = useState(0);
  /** Kept mounted over base after `open` goes false, so it can leave downward (9.9). */
  const [leaving, setLeaving] = useState(false);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) {
      queueMicrotask(() => setLeaving(true));
      const t = setTimeout(() => setLeaving(false), MOTION.base);
      wasOpen.current = open;
      return () => clearTimeout(t);
    }
    wasOpen.current = open;
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      before?.focus();
    };
  }, [open, onClose]);

  if (!open && !leaving) return null;
  const closing = !open && leaving;
  return (
    <FixedLayer name="modal">
      <div className={`fixed inset-0 z-50 flex flex-col justify-end ${clear || closing ? "pointer-events-none" : ""}`} data-sheet={clear ? "clear" : closing ? "closing" : "open"}>
        {/* The backdrop takes the touches and dims nothing: no scrim, no shrinking the page (1.5). */}
        {clear ? null : <button type="button" aria-label="Never mind" tabIndex={-1} onClick={onClose} className="absolute inset-0 touch-none bg-transparent" data-sheet-backdrop="" />}
        <div
          ref={panel}
          role="dialog"
          aria-modal={clear ? undefined : "true"}
          aria-labelledby={labelledBy}
          style={dy > 0 ? { transform: `translateY(${dy}px)` } : undefined}
          className={`relative mx-auto flex w-full max-w-[430px] flex-col gap-5 overflow-y-auto overscroll-contain rounded-t-card border border-b-0 border-line bg-surface px-4 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] ${closing ? "motion-sink" : "motion-rise"} ${tall ? "h-[min(560px,85%)]" : "max-h-[85%]"} ${clear ? "pointer-events-auto" : ""}`}
        >
          <div
            className="relative -mb-2 flex h-10 shrink-0 touch-none select-none items-center justify-center"
            onPointerDown={(e) => {
              startY.current = e.clientY;
              startAt.current = performance.now();
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                // No active pointer to capture (a synthetic event): the drag still reads from this row.
              }
            }}
            onPointerMove={(e) => {
              if (startY.current === null) return;
              pulled.current = Math.max(0, e.clientY - startY.current);
              setDy(pulled.current);
            }}
            onPointerUp={() => {
              const height = panel.current?.offsetHeight ?? 0;
              const elapsed = Math.max(1, performance.now() - startAt.current);
              const far = dragCloses(pulled.current, height, pulled.current / elapsed);
              startY.current = null;
              pulled.current = 0;
              setDy(0);
              if (far) onClose();
            }}
            onPointerCancel={() => {
              startY.current = null;
              pulled.current = 0;
              setDy(0);
            }}
          >
            <span aria-hidden="true" className="h-[5px] w-9 rounded-[3px] bg-line-strong" />
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
          {children}
        </div>
      </div>
    </FixedLayer>
  );
}
