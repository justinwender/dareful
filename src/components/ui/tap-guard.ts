"use client";

import { useCallback, useEffect, useRef, type MouseEvent } from "react";
import { CONTROLS, tapCounts } from "@/lib/ui/taps";

/**
 * A tap counts only on the control it began on (`taps.ts`), for a box whose controls can move under a finger: the
 * pinned sheet, and the Decided chips, where a page that grows as the terms arrive can carry the next chip under a
 * finger that went down on another and send a date nobody picked (the touch-ups round, section 4: a question asked on
 * "This week" stored the month's span). Returns the box's click handler for the capture phase.
 */
export function useTapGuard(): (e: MouseEvent<HTMLElement>) => void {
  const pressed = useRef<EventTarget | null>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      pressed.current = e.target;
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, []);
  return useCallback((e: MouseEvent<HTMLElement>) => {
    const control = e.target instanceof Element ? e.target.closest(CONTROLS) : null;
    const began = pressed.current instanceof Node ? pressed.current : null;
    if (tapCounts(began, { control, byPointer: e.detail > 0 })) return;
    e.stopPropagation();
    e.preventDefault();
  }, []);
}
