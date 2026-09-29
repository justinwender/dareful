"use client";

import { useEffect } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { COLD_MARKS } from "@/lib/ui/cold-start";

function markOnce(name: string): void {
  try {
    if (performance.getEntriesByName(name).length === 0) performance.mark(name);
  } catch {
    // An engine without the timeline: the instrument reads "not seen".
  }
}

/**
 * The instrument's two marks that only the running app can make (src/lib/ui/cold-start.ts): when the scripts
 * had loaded and the screen began answering to a touch, and when the sign-in's own code had finished starting.
 * Each is made once per load and draws nothing.
 */
export function ColdMarks() {
  const { sdkHasLoaded } = useDynamicContext();
  useEffect(() => markOnce(COLD_MARKS.live), []);
  useEffect(() => {
    if (sdkHasLoaded) markOnce(COLD_MARKS.sdk);
  }, [sdkHasLoaded]);
  return null;
}
