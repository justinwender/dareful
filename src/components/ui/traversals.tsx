"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { LANDING_MS, TRAVERSAL_ATTR, landed, touchBegan, touchReleased, traversed } from "@/lib/ui/traversal";
import { skipCurrentTransition } from "@/lib/ui/transitions";

/**
 * The listener for traversals (docs/design.md 9.7): it hears the history move before the screen it lands on has
 * mounted, records it where every motion asks (`traversal.ts`), finishes whatever transition was running, and
 * marks `html` so the stylesheet holds the arrival still. The mark goes once the screen has landed, so the next
 * tap arrives as itself.
 */
export function Traversals() {
  const path = usePathname();
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (e.pointerType === "touch") touchBegan(e.clientX, window.innerWidth);
    };
    const up = () => touchReleased();
    let clear: ReturnType<typeof setTimeout> | null = null;
    const pop = (e: PopStateEvent) => {
      skipCurrentTransition();
      traversed((e as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition, location.pathname);
      document.documentElement.setAttribute(TRAVERSAL_ATTR, "");
      if (clear) clearTimeout(clear);
      // A landing that never comes (the router restored nothing new) still lets go of the mark.
      clear = setTimeout(() => {
        document.documentElement.removeAttribute(TRAVERSAL_ATTR);
        landed();
      }, LANDING_MS);
    };
    document.addEventListener("pointerdown", down, { capture: true, passive: true });
    document.addEventListener("pointerup", up, { capture: true, passive: true });
    window.addEventListener("popstate", pop);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", up, true);
      window.removeEventListener("popstate", pop);
      if (clear) clearTimeout(clear);
    };
  }, []);
  // The screen at the new path has mounted and drawn: two frames on, the traversal is over.
  useEffect(() => {
    if (!document.documentElement.hasAttribute(TRAVERSAL_ATTR)) return;
    const t = setTimeout(() => {
      document.documentElement.removeAttribute(TRAVERSAL_ATTR);
      landed();
    }, 400);
    return () => clearTimeout(t);
  }, [path]);
  return null;
}
