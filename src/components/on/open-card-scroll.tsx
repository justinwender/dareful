"use client";

import { useEffect } from "react";
import { scrollPageTo, scrollTopOf } from "@/lib/ui/scroller";

/**
 * Opening a card scrolls it to the top of the scroller over base; with Reduce Motion it is there at once (docs/design.md
 * 3.33, "One question open at a time"). Once per card opened, after the page has landed.
 */
export function OpenCardScroll({ id }: { id: string }) {
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const head = document.querySelector<HTMLElement>(`[data-open-card-head="${id}"]`);
      if (!head) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      scrollPageTo(Math.max(0, head.getBoundingClientRect().top + scrollTopOf() - 12), reduce ? "instant" : "smooth");
    });
    return () => cancelAnimationFrame(frame);
  }, [id]);
  return null;
}
