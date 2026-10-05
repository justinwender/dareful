"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSessionFacts } from "@/components/auth/device";
import { FixedLayer } from "@/components/ui/layers";
import { tipsShownAction } from "@/lib/actions/tips";
import { INFO_ICON_ON, type InfoEntry } from "@/lib/ui/info";
import { infoSheet } from "@/lib/ui/info-sheets";
import { seenAlready, tipPlacement, tipsFor, TIP_MAX_WIDTH, type Box } from "@/lib/ui/tips";
import { screenOf } from "@/lib/usage/events";

const GUEST_KEY = "dareful_tips_seen";
/** The first tip comes once the screen and its first content have painted (10.9). */
const SETTLE_MS = 700;

function guestSeen(): string[] {
  try {
    const raw = window.localStorage.getItem(GUEST_KEY);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function rememberGuest(screen: string): void {
  try {
    window.localStorage.setItem(GUEST_KEY, JSON.stringify([...new Set([...guestSeen(), screen])]));
  } catch {
    // A phone that keeps nothing sees the tips again; nothing else changes.
  }
}

/** Whether a control is on the screen to point at: drawn, visible, and inside the viewport. */
function onScreen(selector: string): boolean {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  if (r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth) return false;
  return getComputedStyle(el).visibility !== "hidden";
}

/**
 * First-visit tips (docs/design.md 10.9): the first time a person opens a screen, up to three of its sheet's entries,
 * one at a time, beside the control each describes, the rest of the screen blurred and dimmed around a cut-out. A tap
 * anywhere moves on; after the last the screen is as it was. A screen counts as seen once its first tip has shown, on
 * the account for anyone signed in and on the phone for a guest. Nothing under it takes a touch while it shows.
 */
export function FirstTips() {
  const pathname = usePathname();
  const { me, tipsSeen } = useSessionFacts();
  const [tips, setTips] = useState<Array<{ entry: InfoEntry; target: string }> | null>(null);
  const [at, setAt] = useState(0);
  const [place, setPlace] = useState<ReturnType<typeof tipPlacement> | null>(null);
  const tipBox = useRef<HTMLDivElement>(null);
  const seenHere = useRef(new Set<string>());

  useEffect(() => {
    if (!INFO_ICON_ON) return;
    const screen = screenOf(pathname ?? "/");
    const timer = setTimeout(() => {
      if (seenHere.current.has(screen)) return;
      const seen = me ? tipsSeen : guestSeen();
      if (seenAlready(seen, screen)) return;
      // Never over a sheet that is open, nor over asking (9.5).
      if (document.querySelector('[data-sheet="open"]') || document.querySelector('[data-layer="ask"] [data-page]')) return;
      // The icon that is showing: Now carries two, one for each of its states, and hides the other.
      const key = Array.from(document.querySelectorAll<HTMLElement>("[data-info-icon]")).find((el) => el.getBoundingClientRect().width > 0)?.dataset.infoIcon;
      const sheet = key ? infoSheet(key) : null;
      if (!sheet) return;
      const chosen = tipsFor(sheet, onScreen);
      if (chosen.length === 0) return;
      seenHere.current.add(screen);
      if (me) void tipsShownAction(screen).catch(() => undefined);
      else rememberGuest(screen);
      setAt(0);
      setTips(chosen);
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [pathname, me, tipsSeen]);

  // Measures the control and the tip, and places both (the cut-out, the ring, the tip, its caret).
  useLayoutEffect(() => {
    if (!tips) return;
    // Measured on the next frame, once the tip itself has a size to measure; until then it is drawn hidden.
    const frame = requestAnimationFrame(() => {
      const tip = tips[at];
      const el = tip ? document.querySelector<HTMLElement>(tip.target) : null;
      if (!tip || !el) return setTips(null);
      const r = el.getBoundingClientRect();
      const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
      const box: Box = { x: r.left, y: r.top, width: r.width, height: r.height };
      const size = tipBox.current ? { width: tipBox.current.offsetWidth, height: tipBox.current.offsetHeight } : { width: TIP_MAX_WIDTH, height: 96 };
      setPlace(tipPlacement(box, Math.min(radius, Math.min(r.width, r.height) / 2), { width: window.innerWidth, height: window.innerHeight }, size));
    });
    return () => cancelAnimationFrame(frame);
  }, [tips, at]);

  if (!tips || !tips[at]) return null;
  const { entry } = tips[at];
  const last = at === tips.length - 1;
  const next = () => (last ? setTips(null) : setAt(at + 1));
  const cut = place?.cut;
  const w = typeof window === "undefined" ? 0 : window.innerWidth;
  const h = typeof window === "undefined" ? 0 : window.innerHeight;
  const hole = cut
    ? `M0 0H${w}V${h}H0Z M${cut.x + cut.radius} ${cut.y}H${cut.x + cut.width - cut.radius}A${cut.radius} ${cut.radius} 0 0 1 ${cut.x + cut.width} ${cut.y + cut.radius}V${cut.y + cut.height - cut.radius}A${cut.radius} ${cut.radius} 0 0 1 ${cut.x + cut.width - cut.radius} ${cut.y + cut.height}H${cut.x + cut.radius}A${cut.radius} ${cut.radius} 0 0 1 ${cut.x} ${cut.y + cut.height - cut.radius}V${cut.y + cut.radius}A${cut.radius} ${cut.radius} 0 0 1 ${cut.x + cut.radius} ${cut.y}Z`
    : null;
  return (
    <FixedLayer name="tips">
      <div role="dialog" aria-modal="true" aria-label="A tip" data-first-tips={at + 1} className="fixed inset-0 z-[60] motion-fade-in" onClick={next}>
        {/* The blur (10.9; 1.5's one exception): the screen behind it blurred and dimmed everywhere but the cut-out. */}
        <div aria-hidden="true" className="absolute inset-0 tips-blur" style={hole ? { clipPath: `path(evenodd, "${hole}")` } : undefined} />
        {/* The ring goes with its cut-out, which a clip path cannot carry over time: both move at once and the tip travels (the simulator caught a sliding ring apart from its cut-out). */}
        {cut ? <div aria-hidden="true" className="absolute border-2 border-ink" data-tip-ring="" style={{ left: cut.x - 2, top: cut.y - 2, width: cut.width + 4, height: cut.height + 4, borderRadius: cut.radius + 2 }} /> : null}
        <div ref={tipBox} className="absolute flex flex-col gap-1 rounded-[10px] border border-line-strong bg-surface-2 px-3 py-[10px] tips-move" style={{ left: place?.tip.x ?? 12, top: place?.tip.y ?? 12, width: Math.min(TIP_MAX_WIDTH, w - 24), visibility: place ? "visible" : "hidden" }}>
          <span aria-hidden="true" className="absolute h-2 w-2 rotate-45 border-line-strong bg-surface-2" style={place ? { left: place.caretX - 4, ...(place.below ? { top: -5, borderLeftWidth: 1, borderTopWidth: 1 } : { bottom: -5, borderRightWidth: 1, borderBottomWidth: 1 }) } : undefined} />
          <p className="text-body-sm font-semibold text-ink">{entry.term}</p>
          <p className="text-body-sm text-ink-2">{entry.description}</p>
          <div className="flex items-center justify-between">
            {tips.length > 1 ? <span className="text-caption text-ink-3">{`${at + 1} of ${tips.length}`}</span> : <span />}
            <button type="button" onClick={(e) => (e.stopPropagation(), next())} data-press="line" className="h-11 px-2 text-body-sm font-semibold text-ink-2 press-line">
              {last ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </FixedLayer>
  );
}
