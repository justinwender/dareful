"use client";

import { useEffect } from "react";
import { MOTION } from "@/lib/ui/motion";

/**
 * Presses (docs/design.md 9.4): set from `pointerdown` in the same frame, with no transition in, and released
 * over quick on the fade curve. One listener on the document serves every control, server-rendered rows
 * included: an element marked `data-press="fill"`, `"line"` or `"row"` gets `data-pressed` while a pointer is
 * down on it, and `globals.css` draws the state (0.88 on a fill, 0.5 on lines and words, the ground on a row).
 * A row in a scrolling list waits 60ms before showing its press and cancels it if the finger travels 8px, so a
 * scroll never flashes rows; a tap quicker than 60ms shows the press at release. A press that turns into a drag
 * lets go at once. Pure rules first, so they have tests.
 */
export const ROW_PRESS_DELAY_MS = 60;
export const PRESS_CANCEL_PX = 8;

export type PressKind = "fill" | "line" | "row";

/** Whether a press should show now, given how long the pointer has been down and how far it has moved. */
export function pressShows(kind: PressKind, heldMs: number, movedPx: number): boolean {
  if (movedPx >= PRESS_CANCEL_PX) return false;
  return kind === "row" ? heldMs >= ROW_PRESS_DELAY_MS : true;
}

export function Presses() {
  useEffect(() => {
    let el: HTMLElement | null = null;
    let kind: PressKind = "fill";
    let timer: ReturnType<typeof setTimeout> | null = null;
    let release: ReturnType<typeof setTimeout> | null = null;
    let start = { x: 0, y: 0 };
    let shown = false;
    const show = () => {
      if (!el) return;
      el.setAttribute("data-pressed", "");
      shown = true;
    };
    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      const was = el;
      el = null;
      if (was) {
        // Released over quick (the CSS transition); the attribute goes once the fade has run.
        if (release) clearTimeout(release);
        release = setTimeout(() => was.removeAttribute("data-pressed"), MOTION.quick);
      }
      shown = false;
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const target = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-press]") : null;
      if (!target) return;
      if (target.matches(":disabled, [aria-disabled='true'], [aria-busy='true']")) return;
      if (release) clearTimeout(release);
      el = target;
      kind = (target.getAttribute("data-press") as PressKind) || "fill";
      start = { x: e.clientX, y: e.clientY };
      shown = false;
      if (pressShows(kind, 0, 0)) show();
      else timer = setTimeout(show, ROW_PRESS_DELAY_MS);
    };
    const onMove = (e: PointerEvent) => {
      if (!el) return;
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (!pressShows(kind, ROW_PRESS_DELAY_MS, moved)) {
        // A press that turns into a drag lets go at once.
        if (timer) clearTimeout(timer);
        timer = null;
        el.removeAttribute("data-pressed");
        el = null;
        shown = false;
      }
    };
    const onUp = () => {
      if (!el) return;
      // A tap quicker than the row's delay shows the press at release, the frame the next screen opens out of.
      if (!shown) show();
      clear();
    };
    document.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointercancel", onUp, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, []);
  return null;
}
