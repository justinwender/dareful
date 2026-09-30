"use client";

import { useEffect } from "react";

/**
 * One mark on the performance timeline, made once per load and drawing nothing: when the app's scripts had
 * loaded and the screen began answering to a touch. The http suite's watch over the opening reads it
 * (`scripts/dev/opening-check.ts`): that the app started after the opening had left is what proves the opening
 * stays gone (docs/decisions.md 2026-09-29).
 */
export function ColdMarks() {
  useEffect(() => {
    try {
      if (performance.getEntriesByName("dareful:live").length === 0) performance.mark("dareful:live");
    } catch {
      // An engine without the timeline: the watch reads "not seen".
    }
  }, []);
  return null;
}
