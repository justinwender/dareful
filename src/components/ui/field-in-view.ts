"use client";

import { useEffect, useEffectEvent, type RefObject } from "react";
import { FIELD_MARGIN, revealBy, takesKeyboard } from "@/lib/ui/viewport";

/** How long after the last change a field is looked at again: the screen settles first (a keyboard rising, a sheet travelling). */
const SETTLE_MS = 120;

/**
 * Keeps the field being typed into in view inside a sheet (the final round, section 1). The phone brings a field into
 * view as it takes the focus, and Brave and Chrome on an iPhone host the page in their own apps, where Brave then shrinks
 * the page to the space above the keyboard: what was in view at the focus ends up under the sheet's foot, and nothing
 * looks again until a letter is typed. So whenever the screen, the sheet or the field changes while a field in `panel`
 * holds the keyboard, the field is measured against what shows (`revealBy`), and `act` decides: "wait" when the sheet
 * moved and the field is looked at again once it has travelled, "scroll" to move `box` so the field sits in the middle of
 * what shows, "none" to leave it. Scrolling moves the field, which is also what makes the phone draw its caret there
 * again. `done` runs when the keyboard leaves the sheet.
 */
export function useFieldInView(
  panel: RefObject<HTMLElement | null>,
  box: RefObject<HTMLElement | null>,
  opts: { on: boolean; version?: unknown; travelMs: number; act: (by: number | null) => "wait" | "scroll" | "none"; done?: () => void },
) {
  const act = useEffectEvent(opts.act);
  const done = useEffectEvent(() => opts.done?.());
  const { on, version, travelMs } = opts;
  useEffect(() => {
    const el = panel.current;
    const scroller = box.current;
    if (!on || !el || !scroller) return;
    const vv = window.visualViewport;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const look = () => {
      timer = null;
      const field = document.activeElement;
      if (!(field instanceof HTMLElement) || !takesKeyboard(field) || !scroller.contains(field)) return;
      const f = field.getBoundingClientRect();
      const b = scroller.getBoundingClientRect();
      const shows = vv ? { top: vv.offsetTop, bottom: vv.offsetTop + vv.height } : { top: 0, bottom: window.innerHeight };
      const by = revealBy({ field: { top: f.top, bottom: f.bottom }, box: { top: b.top, bottom: b.bottom }, visible: shows, margin: FIELD_MARGIN });
      const what = act(by);
      if (what === "wait") later(travelMs + 60);
      else if (what === "scroll" && by !== null) scroller.scrollTop = Math.max(0, scroller.scrollTop + by);
    };
    const later = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(look, ms);
    };
    const soon = () => later(SETTLE_MS);
    const onOut = (e: FocusEvent) => {
      const next = e.relatedTarget instanceof Element ? e.relatedTarget : null;
      if (next && takesKeyboard(next) && scroller.contains(next)) return;
      done();
    };
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(soon);
    ro?.observe(scroller);
    el.addEventListener("focusin", soon);
    el.addEventListener("focusout", onOut);
    el.addEventListener("input", soon);
    vv?.addEventListener("resize", soon);
    vv?.addEventListener("scroll", soon);
    window.addEventListener("resize", soon);
    return () => {
      if (timer) clearTimeout(timer);
      ro?.disconnect();
      el.removeEventListener("focusin", soon);
      el.removeEventListener("focusout", onOut);
      el.removeEventListener("input", soon);
      vv?.removeEventListener("resize", soon);
      vv?.removeEventListener("scroll", soon);
      window.removeEventListener("resize", soon);
    };
  }, [on, version, travelMs, panel, box]);
}
