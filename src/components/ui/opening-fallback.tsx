"use client";

import { useEffect } from "react";

/**
 * The opening's handoff for a page the scripts drew (the touch-ups round, section 1). A page that calls `notFound()`
 * (the owner's numbers, for anyone not on the owner's list) is answered with the framework's own error shell, and the
 * root layout and the code screen are drawn by the scripts; a script inside a component never runs when it is drawn
 * there, so the opening the layout drew was counted and then stood over the page for good, which was "the loader, and
 * then it stops". Once the app has painted, an opening still standing undressed is handed off here, as the page's own
 * script would have: the document dressed, and the opening faded and gone. On every other load the page's script has
 * already done it two frames earlier, and this does nothing.
 */
export function OpeningFallback() {
  useEffect(() => {
    const d = document.documentElement;
    if (d.hasAttribute("data-dressed")) return;
    let frame = 0;
    // Three frames: the page's own handoff runs two frames after its script, so it always goes first when it can.
    const after = (n: number) => {
      frame = requestAnimationFrame(() => {
        if (n > 1) return after(n - 1);
        if (d.hasAttribute("data-dressed")) return;
        d.setAttribute("data-dressed", "");
        handOffOpening();
      });
    };
    after(3);
    return () => cancelAnimationFrame(frame);
  }, []);
  return null;
}

/** The design's `handOffOpening` (11.5, `HANDOFF_JS`), the same steps: the fades, then the element gone at their end or a little after. */
function handOffOpening(): void {
  const el = document.getElementById("opening");
  if (!el || el.classList.contains("handoff")) return;
  el.classList.add("handoff");
  const done = () => el.remove();
  el.addEventListener("animationend", (e) => {
    if (e.target === el) done();
  });
  setTimeout(done, 260);
}
