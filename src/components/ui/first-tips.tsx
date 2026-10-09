"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSessionFacts } from "@/components/auth/device";
import { FixedLayer } from "@/components/ui/layers";
import { tipsShownAction } from "@/lib/actions/tips";
import { INFO_ICON_ON } from "@/lib/ui/info";
import { infoSheet } from "@/lib/ui/info-sheets";
import { CURATED_TIPS, seenAlready, tipPlacement, tipsFor, TIP_MAX_WIDTH, type Box, type Tip } from "@/lib/ui/tips";
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

/** Whether a control is on the screen to point at: drawn, visible, inside the viewport, and not under a layer (the pinned sheet over the foot of a market, which held the who's-in row under it on the simulators). */
function visible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  if (r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth) return false;
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  if (hit && !el.contains(hit) && !hit.contains(el)) return false;
  return getComputedStyle(el).visibility !== "hidden";
}
/**
 * The copy of a control that is on the screen: the first match is not always it (a root the router is holding keeps its
 * own +, off the screen), and the tip once went to that one, its card cut off at the top while the + it meant stayed
 * blurred (the touch-ups round).
 */
function shown(selector: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find(visible) ?? null;
}
const onScreen = (selector: string): boolean => shown(selector) !== null;

/**
 * First-visit tips (docs/design.md 10.9): the first time a person opens a screen, up to three of its sheet's entries,
 * one at a time, beside the control each describes, the rest of the screen blurred and dimmed around a cut-out. A tap
 * anywhere moves on; after the last the screen is as it was. A screen counts as seen once its first tip has shown, on
 * the account for anyone signed in and on the phone for a guest. Nothing under it takes a touch while it shows.
 */
export function FirstTips() {
  const pathname = usePathname();
  const { me, tipsSeen } = useSessionFacts();
  const [tips, setTips] = useState<Tip[] | null>(null);
  const [at, setAt] = useState(0);
  const [place, setPlace] = useState<ReturnType<typeof tipPlacement> | null>(null);
  const tipBox = useRef<HTMLDivElement>(null);
  const seenHere = useRef(new Set<string>());
  /** The tips remembered on their own that have shown in this visit, before the account says so. */
  const shownHere = useRef<string[]>([]);
  const remember = useEffectEvent((key: string) => {
    if (me) void tipsShownAction(key).catch(() => undefined);
    else rememberGuest(key);
  });
  // A tip remembered on its own counts as seen the moment it shows (the touch-ups round): "Ask something" once for every tab, a new tip once.
  useEffect(() => {
    const key = tips?.[at]?.key;
    if (!key || shownHere.current.includes(key)) return;
    shownHere.current.push(key);
    remember(key);
  }, [tips, at]);

  useEffect(() => {
    if (!INFO_ICON_ON) return;
    const screen = screenOf(pathname ?? "/");
    const timer = setTimeout(() => {
      if (seenHere.current.has(screen)) return;
      const seen = [...(me ? tipsSeen : guestSeen()), ...shownHere.current];
      // Never over a sheet that is open (9.5). Asking has tips of its own since the touch-ups round, so the ask layer no longer stops them.
      if (document.querySelector('[data-sheet="open"]')) return;
      // The icon that is showing, the topmost: Now carries two, one for each of its states, and hides the other; the ask layer's is above its root's.
      const key = Array.from(document.querySelectorAll<HTMLElement>("[data-info-icon]")).filter((el) => el.getBoundingClientRect().width > 0).pop()?.dataset.infoIcon;
      const sheet = key ? infoSheet(key) : null;
      if (!sheet || !key) return;
      // A screen with new tips remembers each tip as it shows; any other remembers the screen.
      const curated = CURATED_TIPS[key] !== undefined;
      if (!curated && seenAlready(seen, screen)) return;
      const chosen = tipsFor(sheet, onScreen, { key, seen });
      if (chosen.length === 0) return;
      seenHere.current.add(screen);
      if (!curated) remember(screen);
      setAt(0);
      setTips(chosen);
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [pathname, me, tipsSeen]);

  // Measures the control and the tip, and places both (the cut-out, the ring, the tip, its caret); again whenever the
  // page moves under it, since a line arriving at the top after the tip showed (this device's notice, a guest's line)
  // would otherwise leave the ring where the control used to be (the games-and-the-reveal round, on the simulator).
  useLayoutEffect(() => {
    if (!tips) return;
    const measure = () => {
      const tip = tips[at];
      const el = tip ? shown(tip.target) : null;
      if (!tip || !el) return setTips(null);
      const r = el.getBoundingClientRect();
      const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
      const box: Box = { x: r.left, y: r.top, width: r.width, height: r.height };
      const size = tipBox.current ? { width: tipBox.current.offsetWidth, height: tipBox.current.offsetHeight } : { width: TIP_MAX_WIDTH, height: 96 };
      setPlace(tipPlacement(box, Math.min(radius, Math.min(r.width, r.height) / 2), { width: window.innerWidth, height: window.innerHeight }, size));
    };
    // Measured on the next frame, once the tip itself has a size to measure; until then it is drawn hidden.
    let frame = requestAnimationFrame(measure);
    const again = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const watch = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(again);
    const app = document.getElementById("app");
    if (watch && app) for (const child of Array.from(app.children)) watch.observe(child);
    window.addEventListener("resize", again);
    return () => {
      cancelAnimationFrame(frame);
      watch?.disconnect();
      window.removeEventListener("resize", again);
    };
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
