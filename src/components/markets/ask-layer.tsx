"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FixedLayer, InFlowSheets } from "@/components/ui/layers";
import { MOTION } from "@/lib/ui/motion";

/** Inside the ask layer: how to close it. Null on a hard load of the question step, where Close goes to the root. */
export const AskLayerContext = createContext<{ close: () => void } | null>(null);
export const useAskLayer = () => useContext(AskLayerContext);

/**
 * The ask layer (docs/design.md 9.5): the + opens the steps of asking as a fixed, full-screen layer, a sibling of
 * the tab bar, over the root that holds still under it. Reached from inside the app, `/m/new` renders here
 * through the intercepting route (`src/app/@ask/(.)m/new`), so the place it was tapped from stays mounted, scroll
 * and all, and is made inert while the layer is up. The layer is mounted at `translateY(100%)` with the
 * question step drawn whole and rises to its place over travel on the move curve; closing sinks it over base on
 * the leave curve and the root is live again as it was. Its header, band, step content and action bar are one
 * column, and the action bar sits in flow at the layer's foot rather than being fixed (`InFlowSheets`), so the
 * layer moves as one piece. Nothing inside it is `position: fixed` (9.3). With Reduce Motion it fades.
 */
export function AskLayer({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"rising" | "up" | "closing">("rising");
  const closingRef = useRef(false);
  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setPhase("closing");
    setTimeout(() => router.back(), MOTION.base);
  }, [router]);
  useEffect(() => {
    // The root and the tab bar are covered and made inert while the layer is up (9.5); they keep their scroll.
    const under = Array.from(document.querySelectorAll<HTMLElement>('main[data-page=""], [data-layer="tab-bar"], [data-layer="start"]'));
    for (const el of under) el.setAttribute("inert", "");
    return () => {
      for (const el of under) el.removeAttribute("inert");
    };
  }, []);
  return (
    <AskLayerContext.Provider value={{ close }}>
      <InFlowSheets.Provider value={true}>
        <FixedLayer name="ask">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Ask something"
            data-ask-layer={phase}
            onAnimationEnd={() => phase === "rising" && setPhase("up")}
            className={`fixed inset-0 z-40 flex flex-col overflow-y-auto overscroll-contain bg-ground ${phase === "rising" ? "motion-rise" : phase === "closing" ? "motion-sink" : ""}`}
          >
            {/* The band behind the status bar, inside the layer as a sticky strip rather than anything fixed (9.3). */}
            <div aria-hidden="true" className="grain sticky top-0 z-20 h-[env(safe-area-inset-top)] shrink-0" />
            <div className="flex min-h-0 flex-1 flex-col pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">{children}</div>
          </div>
        </FixedLayer>
      </InFlowSheets.Provider>
    </AskLayerContext.Provider>
  );
}
