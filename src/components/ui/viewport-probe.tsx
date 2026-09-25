"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Reading = Array<[string, string]>;

/**
 * An instrument, not a feature (docs/testing.md, session 9): the numbers that decide why the tab bar sits high in
 * the installed app and nowhere else. Nothing here can run iOS, so the phone has to say what its viewport is:
 * the window's height against the screen's, the visual viewport, both safe-area insets as the browser resolves
 * them, whether the page is standalone, and where the tab bar's box actually ends. Behind a tertiary button on
 * You; to be removed once the cause is written down.
 */
export function ViewportProbe() {
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState<Reading>([]);
  useEffect(() => {
    if (!open) return;
    const read = () => {
      const probe = document.createElement("div");
      probe.style.cssText = "position:fixed;left:0;bottom:0;width:1px;height:0;padding-bottom:env(safe-area-inset-bottom);padding-top:env(safe-area-inset-top);visibility:hidden;pointer-events:none";
      document.body.appendChild(probe);
      const insetBottom = parseFloat(getComputedStyle(probe).paddingBottom);
      const insetTop = parseFloat(getComputedStyle(probe).paddingTop);
      const probeBottom = probe.getBoundingClientRect().bottom;
      probe.remove();
      const nav = document.querySelector('nav[aria-label="Main"]');
      const rect = nav?.getBoundingClientRect();
      const vv = window.visualViewport;
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      const ios = (navigator as Navigator & { standalone?: boolean }).standalone;
      setReading([
        ["window inner", `${window.innerWidth} × ${window.innerHeight}`],
        ["window outer height", `${window.outerHeight}`],
        ["screen", `${screen.width} × ${screen.height} at ${window.devicePixelRatio}x`],
        ["document client height", `${document.documentElement.clientHeight}`],
        ["visual viewport", vv ? `${Math.round(vv.width)} × ${Math.round(vv.height)}, top ${vv.offsetTop}, scale ${vv.scale}` : "none"],
        ["inset top / bottom", `${insetTop} / ${insetBottom}`],
        ["fixed bottom:0 lands at", `${Math.round(probeBottom)} of ${window.innerHeight}`],
        ["tab bar box", rect ? `top ${Math.round(rect.top)}, bottom ${Math.round(rect.bottom)}, height ${Math.round(rect.height)}` : "no bar"],
        ["display mode", `${standalone ? "standalone" : "browser"}${ios === undefined ? "" : `, navigator.standalone ${ios}`}`],
        ["viewport meta", document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "none"],
      ]);
    };
    read();
    window.addEventListener("resize", read);
    window.visualViewport?.addEventListener("resize", read);
    return () => {
      window.removeEventListener("resize", read);
      window.visualViewport?.removeEventListener("resize", read);
    };
  }, [open]);
  return (
    <div className="flex flex-col gap-3">
      <Button variant="tertiary" onClick={() => setOpen((o) => !o)}>
        {open ? "Hide the measurements" : "Measure the screen"}
      </Button>
      {open ? (
        <dl data-probe="" className="flex flex-col gap-1 rounded-card border border-line bg-surface px-4 py-3 text-caption text-ink-2">
          {reading.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-ink-3">{k}</dt>
              <dd className="text-right text-ink tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
