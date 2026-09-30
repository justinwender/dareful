"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * A screen has arrived (9.8): the direction mark a Back left on `html` is cleared, so the next arrival reads
 * forward unless told otherwise. And a document that loaded on any screen but Now stops being one whose content
 * is arriving (11.5): the handoff marks every first load that way, only Now's content ever answered it, and
 * left standing it made Now fade in on a later visit from what the router already held.
 */
export function Arrived() {
  const path = usePathname();
  useEffect(() => {
    const t = setTimeout(() => {
      document.documentElement.classList.remove("back");
      if (!document.querySelector("[data-now-hint]")) document.documentElement.removeAttribute("data-arriving");
    }, 0);
    return () => clearTimeout(t);
  }, [path]);
  return null;
}
