"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A bottom sheet for the one kind of moment that deserves a pause: an act that binds other people.
 *
 * It never locks the page's scroll. The freeze it replaces was exactly that: a third-party sheet set
 * `overflow: clip` on the body, a second sheet failed to appear on iOS, and the lock stayed with nothing on
 * screen to dismiss (docs/decisions.md 2026-09-20). Here the scrim takes the touches, the sheet contains its
 * own overscroll, and if this component ever fails to render, nothing about the page underneath has changed.
 */
export function Sheet({ open, onClose, labelledBy, children }: { open: boolean; onClose: () => void; labelledBy: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
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
        className="relative mx-auto flex max-h-[85%] w-full max-w-[430px] flex-col gap-5 overflow-y-auto overscroll-contain rounded-t-[18px] border border-b-0 border-line bg-surface px-5 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] motion-safe:animate-[sheet-up_200ms_ease-out]"
      >
        {children}
      </div>
    </div>
  );
}
