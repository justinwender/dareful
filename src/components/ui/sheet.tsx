"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A bottom sheet for a moment that deserves a pause (an act that binds other people) and for Start.
 *
 * It never locks the page's scroll. The freeze it replaces was exactly that: a third-party sheet set
 * `overflow: clip` on the body, a second sheet failed to appear on iOS, and the lock stayed with nothing on
 * screen to dismiss (docs/decisions.md 2026-09-20). Here the scrim takes the touches, the sheet contains its
 * own overscroll, and if this component ever fails to render, nothing about the page underneath has changed.
 *
 * A modal sheet closes with a 48px close at its top right and by dragging down (docs/design.md 6.4). The drag
 * is read from the handle row only, so the sheet's own content still scrolls. A sheet never opens another sheet.
 */
export function Sheet({ open, onClose, labelledBy, children }: { open: boolean; onClose: () => void; labelledBy: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const [dy, setDy] = useState(0);
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

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button type="button" aria-label="Never mind" tabIndex={-1} onClick={onClose} className="absolute inset-0 touch-none bg-[rgba(23,20,15,0.78)]" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        style={dy > 0 ? { transform: `translateY(${dy}px)` } : undefined}
        className="relative mx-auto flex max-h-[85%] w-full max-w-[430px] flex-col gap-5 overflow-y-auto overscroll-contain rounded-t-[18px] border border-b-0 border-line bg-surface px-5 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] motion-safe:animate-[sheet-up_200ms_ease-out]"
      >
        <div
          className="relative -mb-2 flex h-10 shrink-0 touch-none select-none items-center justify-center"
          onPointerDown={(e) => {
            startY.current = e.clientY;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (startY.current !== null) setDy(Math.max(0, e.clientY - startY.current));
          }}
          onPointerUp={() => {
            const far = dy > 80;
            startY.current = null;
            setDy(0);
            if (far) onClose();
          }}
          onPointerCancel={() => {
            startY.current = null;
            setDy(0);
          }}
        >
          <span aria-hidden="true" className="h-[5px] w-9 rounded-[3px] bg-line-strong" />
          <button type="button" aria-label="Close" onClick={onClose} className="absolute top-0 -right-2 inline-flex h-12 w-12 items-center justify-center rounded-pill text-ink">
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
