"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSessionFacts } from "@/components/auth/device";
import { FixedLayer } from "@/components/ui/layers";
import { tipsShownAction } from "@/lib/actions/tips";
import { INFO_ICON_ON } from "@/lib/ui/info";
import { infoSheet } from "@/lib/ui/info-sheets";
import { scrollPageTo, scrollTopOf } from "@/lib/ui/scroller";
import { tipPlacement, tipsFor, TIP_MAX_WIDTH, type Box, type Tip } from "@/lib/ui/tips";

/** A guest's shown tips, on the phone. The touch-ups round's key held tips marked seen on a frame where none showed, so it is left behind. */
const GUEST_KEY = "dareful_tips_shown";
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
  // What is at the control's middle, looking through the tips' own layer: once a tip shows, that layer covers the whole
  // screen, and asking what is on top said every control was hidden, so every tip was taken down on its first frame
  // (the final round, section 3).
  const hit = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).find((h) => !h.closest("[data-first-tips]"));
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
/** Whether a control is drawn on the page, on the screen or not: a tip for one off the screen brings it into view as it shows (`measure`). */
function drawn(selector: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find((x) => x.getBoundingClientRect().width > 0 && getComputedStyle(x).visibility !== "hidden") ?? null;
}
const onPage = (selector: string): boolean => drawn(selector) !== null;

/**
 * The part of the screen no fixed layer covers: under the header rows pinned at the top and above the sheet pinned at
 * the bottom, which a control is brought into the middle of before its tip shows.
 */
function clearBand(): { top: number; bottom: number } {
  let top = 0;
  let bottom = window.innerHeight;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-fixed="top"]'))) {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.top <= 0 && r.bottom < window.innerHeight / 2) top = Math.max(top, r.bottom);
  }
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-fixed="bottom"] > *'))) {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.top < window.innerHeight) bottom = Math.min(bottom, r.top);
  }
  return { top, bottom };
}

/**
 * First-visit tips (docs/design.md 10.9 as amended 2026-10-08): the owner's set (`tipsFor`), one at a time, beside the
 * control each describes, the rest of the screen blurred and dimmed around a cut-out and the control ringed. A tap
 * anywhere moves on; after the last the screen is as it was. Each tip is remembered once it has shown, on the account
 * for anyone signed in and on the phone for a guest, and never before: the touch-ups round's build remembered tips on
 * the frame it chose them, and took them down on the next. Nothing under it takes a touch while it shows.
 */
export function FirstTips() {
  const pathname = usePathname();
  const { me, tipsSeen } = useSessionFacts();
  const [tips, setTips] = useState<Tip[] | null>(null);
  const [at, setAt] = useState(0);
  /** Where the tip at `for` stands: the next one's place is set on the frame after it becomes current, and until then the last one's is drawn. */
  const [place, setPlace] = useState<(ReturnType<typeof tipPlacement> & { for: number }) | null>(null);
  const tipBox = useRef<HTMLDivElement>(null);
  /** The tips that have shown in this visit, before the account says so. */
  const shownHere = useRef<string[]>([]);
  /** The tips whose control was brought into view, once each. */
  const broughtIn = useRef(new Set<string>());
  const remember = useEffectEvent((key: string) => {
    if (me) void tipsShownAction(key).catch(() => undefined);
    else rememberGuest(key);
  });
  // A tip counts as seen once it stands on the screen beside its control, and not before.
  useEffect(() => {
    const key = place?.for === at ? tips?.[at]?.key : undefined;
    if (!key || shownHere.current.includes(key)) return;
    shownHere.current.push(key);
    remember(key);
  }, [place, tips, at]);

  // Looked for once the screen and its first content have painted, and again whenever the screen changes state under
  // the same address (a guest joining a market brings its share row, and that is when its tips can show).
  const showing = useRef(false);
  useEffect(() => {
    showing.current = tips !== null;
  }, [tips]);
  useEffect(() => {
    if (!INFO_ICON_ON) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const look = () => {
      timer = null;
      if (showing.current) return;
      // The opening still covers the screen until its handoff has run, and a control under it reads as hidden (a slow
      // first load in development measured every control under it and dropped every tip).
      if (document.getElementById("opening")) return later(SETTLE_MS);
      // Now's content arrives into its shell; until it has, what Now will show is not on the screen yet.
      if (document.querySelector("[data-now-hint]") && !document.querySelector("[data-now]")) return later(SETTLE_MS);
      // Never over a sheet that is open (9.5), nor over the account step a guest is offered once in (the final round, on
      // the iOS 27 simulator: the share tip blurred "Keep your calls in an account"); the tips wait for either to go.
      if (document.querySelector('[data-sheet="open"], [data-account-step]')) return later(SETTLE_MS);
      // The icon that is showing, the topmost: Now carries two, one for each of its states, and hides the other; the ask layer's is above its root's.
      const key = Array.from(document.querySelectorAll<HTMLElement>("[data-info-icon]")).filter((el) => el.getBoundingClientRect().width > 0).pop()?.dataset.infoIcon;
      const sheet = key ? infoSheet(key) : null;
      if (!sheet || !key) return;
      const seen = [...(me ? tipsSeen : guestSeen()), ...shownHere.current];
      const chosen = tipsFor(sheet, onPage, { key, seen });
      if (chosen.length === 0) return;
      setPlace(null);
      broughtIn.current = new Set();
      setAt(0);
      setTips(chosen);
    };
    const later = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(look, ms);
    };
    later(SETTLE_MS);
    const watch = new MutationObserver(() => later(SETTLE_MS));
    watch.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-info-icon"] });
    return () => {
      if (timer) clearTimeout(timer);
      watch.disconnect();
    };
  }, [pathname, me, tipsSeen]);

  // Measures the control and the tip, and places both (the cut-out, the ring, the tip, its caret); again whenever the
  // page moves under it, since a line arriving at the top after the tip showed (this device's notice, a guest's line)
  // would otherwise leave the ring where the control used to be (the games-and-the-reveal round, on the simulator).
  useLayoutEffect(() => {
    if (!tips) return;
    const measure = () => {
      const tip = tips[at];
      const el = tip ? shown(tip.target) : null;
      // A control that is drawn but off the screen, or under the sheet, is brought into the middle of what no layer covers
      // once, and measured where it lands (the final round: an open card scrolled into place took the share row off the
      // screen under the second tip, and the raised sheet on a game page's open question covered the code button).
      if (tip && !el && !broughtIn.current.has(tip.key)) {
        const there = drawn(tip.target);
        if (there) {
          broughtIn.current.add(tip.key);
          const r = there.getBoundingClientRect();
          const band = clearBand();
          scrollPageTo(Math.max(0, scrollTopOf() + (r.top + r.bottom) / 2 - (band.top + band.bottom) / 2));
          frame = requestAnimationFrame(measure);
          return;
        }
      }
      if (!tip) return setTips(null);
      // One that still cannot be pointed at is left for another visit, and the rest still show: it is not remembered,
      // since only a tip that stood beside its control is.
      if (!el) {
        const rest = tips.filter((_, i) => i !== at);
        return setTips(rest.length > 0 ? rest : null);
      }
      const r = el.getBoundingClientRect();
      const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
      const box: Box = { x: r.left, y: r.top, width: r.width, height: r.height };
      const size = tipBox.current ? { width: tipBox.current.offsetWidth, height: tipBox.current.offsetHeight } : { width: TIP_MAX_WIDTH, height: 96 };
      setPlace({ ...tipPlacement(box, Math.min(radius, Math.min(r.width, r.height) / 2), { width: window.innerWidth, height: window.innerHeight }, size), for: at });
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
    // And whenever the page scrolls under it: an open card scrolling into place moves the control after it was measured.
    app?.addEventListener("scroll", again, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      watch?.disconnect();
      window.removeEventListener("resize", again);
      app?.removeEventListener("scroll", again);
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
