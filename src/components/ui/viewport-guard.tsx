"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { VIEWPORT_ATTR, takesKeyboard, viewportShift, viewportStuck } from "@/lib/ui/viewport";

/**
 * The guard for a viewport out of step (`viewport.ts`). It renders nothing and acts only on a reading.
 *
 * After a field lets go of the keyboard, after the viewport resizes or pans, on return to the foreground and on
 * every arrival at a screen, it reads where two fixed probes were laid out against the glass. When they are off
 * their places with nothing typing, it first asks the browser to read its viewport again (the page is put back
 * where it was before the keyboard moved it, or scrolled a pixel and back), and while the reading still says
 * the layers are off the glass it writes the two distances on `html`, where each fixed layer's own box reads
 * them and moves by them (`[data-fixed]` in the stylesheet). A layer moves itself and nothing that contains one
 * ever moves (9.3). When the reading is right again the distances go.
 *
 * It also puts the page back after a keyboard: a field inside a fixed layer (the sheet, the ask layer) makes the
 * phone scroll the page behind it to bring the field into view, and the page used to stay there once the
 * keyboard had gone, with the question and the entry line scrolled away.
 */
export function ViewportGuard() {
  const path = usePathname();
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    /** Where the page was when a field in a fixed layer took the keyboard. */
    let before: number | null = null;
    const typing = () => takesKeyboard(document.activeElement);
    const read = () => {
      const top = document.querySelector("[data-viewport-probe='top']");
      const bottom = document.querySelector("[data-viewport-probe='bottom']");
      if (!top || !bottom) return null;
      return viewportShift({ scale: vv.scale, typing: typing() }, { topProbeTop: top.getBoundingClientRect().top, bottomProbeBottom: bottom.getBoundingClientRect().bottom, glassHeight: vv.height });
    };
    const write = () => {
      const shift = read();
      if (!shift) {
        if (root.hasAttribute(VIEWPORT_ATTR)) {
          root.removeAttribute(VIEWPORT_ATTR);
          root.style.removeProperty("--vv-top");
          root.style.removeProperty("--vv-bottom");
        }
        return false;
      }
      root.style.setProperty("--vv-top", `${shift.top}px`);
      root.style.setProperty("--vv-bottom", `${shift.bottom}px`);
      root.setAttribute(VIEWPORT_ATTR, "");
      return true;
    };
    const nudge = () => {
      const y = window.scrollY;
      window.scrollTo(0, y + (y > 0 ? -1 : 1));
      window.scrollTo(0, y);
    };
    const stuck = () => viewportStuck({ scale: vv.scale, offsetTop: vv.offsetTop, height: vv.height, innerHeight: window.innerHeight, typing: typing() });
    const repair = (tries: number) => {
      if ((read() || stuck()) && !root.hasAttribute(VIEWPORT_ATTR)) nudge();
      const off = write();
      // The keyboard's own leaving takes a moment, so the reading is taken again a few times.
      if (off && tries > 0) timer = setTimeout(() => repair(tries - 1), 250);
    };
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(() => repair(4), 100);
    };
    // While the layers are being held on the glass, they follow it as it pans.
    const follow = () => {
      if (!root.hasAttribute(VIEWPORT_ATTR)) return later();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => write());
    };
    const focusIn = (e: FocusEvent) => {
      const t = e.target;
      if (!(t instanceof HTMLElement) || !takesKeyboard(t)) return;
      // Something is being typed into: whatever the layers were given, the keyboard's own pan is left alone.
      write();
      const layer = t.closest("[data-layer]")?.getAttribute("data-layer");
      if (before === null && layer && layer !== "app") before = window.scrollY;
    };
    const focusOut = () => {
      setTimeout(() => {
        if (typing()) return;
        if (before !== null) {
          const y = before;
          before = null;
          if (Math.abs(window.scrollY - y) >= 1) window.scrollTo({ top: y, behavior: "instant" });
        }
        later();
      }, 50);
    };
    const visible = () => {
      if (document.visibilityState === "visible") later();
    };
    document.addEventListener("focusin", focusIn);
    document.addEventListener("focusout", focusOut);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("pageshow", later);
    vv.addEventListener("resize", follow);
    vv.addEventListener("scroll", follow);
    later();
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      document.removeEventListener("focusin", focusIn);
      document.removeEventListener("focusout", focusOut);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("pageshow", later);
      vv.removeEventListener("resize", follow);
      vv.removeEventListener("scroll", follow);
    };
    // The path is a dependency on purpose: the state outlives the screen that made it, so every arrival reads again.
  }, [path]);
  return null;
}
