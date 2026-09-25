"use client";

import { useEffect } from "react";
import { platformOf } from "@/lib/auth/device";
import { viewportStuck } from "@/lib/ui/viewport";

/**
 * Puts the visual viewport back after the keyboard on iOS 26.0 (`viewportStuck`, docs/testing.md session 7).
 * A one pixel scroll and back makes Safari re-read the viewport, which is what settles fixed elements onto the
 * screen again; it is invisible and it only ever happens on an iPhone, after a field has lost focus or the
 * viewport has resized, and only while the reading says the viewport is stuck. It renders nothing.
 */
export function ViewportRepair() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || platformOf(navigator.userAgent) !== "ios") return;
    let timer: number | undefined;
    const typing = () => {
      const el = document.activeElement;
      return (
        el instanceof HTMLElement &&
        (el.matches("input, textarea, select") || el.isContentEditable)
      );
    };
    const stuck = () =>
      viewportStuck({
        scale: vv.scale,
        offsetTop: vv.offsetTop,
        height: vv.height,
        innerHeight: window.innerHeight,
        typing: typing(),
      });
    const repair = (tries: number) => {
      if (!stuck()) return;
      const y = window.scrollY;
      window.scrollTo(0, y + (y > 0 ? -1 : 1));
      window.scrollTo(0, y);
      // The keyboard's own animation takes a moment to finish, so the reading is taken again a few times.
      if (tries > 0) timer = window.setTimeout(() => repair(tries - 1), 250);
    };
    const later = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => repair(3), 100);
    };
    document.addEventListener("focusout", later);
    vv.addEventListener("resize", later);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("focusout", later);
      vv.removeEventListener("resize", later);
    };
  }, []);
  return null;
}
