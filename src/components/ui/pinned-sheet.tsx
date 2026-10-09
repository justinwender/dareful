"use client";

import { useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { FixedLayer, InFlowSheets, useLayersHost } from "./layers";
import { HANDLE_ROW } from "./handle";
import { MOTION, overscroll, settleDuration } from "@/lib/ui/motion";
import { cn } from "@/lib/utils";
import { useTapGuard } from "./tap-guard";

/**
 * The sheet (docs/design.md 3.24 as amended 2026-10-02, 9.9): every market screen and every task screen keeps its
 * one move pinned to the bottom, where the tab bar sits on a root. It never scrolls away and never goes empty
 * while the market runs. The content behind it scrolls, with bottom padding equal to the sheet's resting height
 * plus 20px, so nothing is trapped underneath (`--sheet-room`, read by `Screen`).
 *
 * One component, four positions (the field round, 2.1): tucked (the handle row alone), resting (`low`: the
 * state's next move whole, its line and its control), raised (`high` and `foot` added: what the move needs, up
 * to about three quarters of the screen) and full (up to the status bar, the only position at which the sheet's
 * own content scrolls, under a handle row that stays). Every sheet keeps its handle in every state, so the sheet
 * looks the same from one state to the next: dragged down it tucks, and where a state has nothing more to show a
 * drag up follows a third of the finger's travel and settles back. The sheet is laid out at its tallest and sits
 * lower by a `translateY` on itself (9.9): nothing inside it is fixed, nothing that contains it moves, and it is
 * portalled to the app root (9.3) so no page ancestor can capture it. A swipe moves it one position by direction,
 * more than 24px up or down, anything less stays; tapping the grabber toggles resting and raised; a touch on the
 * header row raises a lowered sheet. The grabber and the header row under it are the drag handle, and only they:
 * the move itself (a slider, a field, a button) keeps its own gestures. While a finger drags, the sheet follows
 * it with no transition; past either end it moves a third of the finger's travel, 16px at most; on release it
 * settles over base if less than half the distance is left and over travel otherwise, on the move curve, from
 * wherever it is. When the screen raises or lowers it (a touch on the move, Change, Never mind), it travels the
 * same way, over travel. A drag that starts on the handle row is the sheet's alone (`HANDLE_ROW`): the page never
 * moves under it and a pull to re-read never starts there. The box the sheet is laid out in takes no touches of
 * its own, so the page above a lowered sheet is still the page's.
 *
 * It is not modal: nothing behind it is dimmed, the page still scrolls, and it never locks anything. A moment
 * that binds other people still gets the modal `Sheet` on top of it. It never counts down: clocks live in the
 * question band, and citron appears only on a vote with a deadline that this person has not cast.
 */
export type SheetPosition = "tucked" | "resting" | "raised" | "full";

/** The sheet's measurements: the handle row, the resting part, everything laid out, the two caps the screen allows, and the padding under the content (24px and the home indicator's inset), which the strip at the foot covers. */
export type SheetMeasure = { handle: number; rest: number; natural: number; raisedCap: number; fullCap: number; pad: number };

/** The raised position shows at most this share of the screen; full reaches the status band less this much. */
export const RAISED_SHARE = 0.72;
export const FULL_GAP = 60;
/** The snap: more than this many pixels of travel moves the sheet one position by direction (3.24). */
export const SNAP_PX = 24;

/** How much of the sheet shows at a position. Pure. */
export function visibleAt(position: SheetPosition, m: SheetMeasure): number {
  switch (position) {
    case "tucked":
      // The handle row stands above the strip at the foot, clear of the home indicator and the browser's toolbar, so a tucked sheet can always be brought back (the first-contact round: it sat under the strip, out of reach).
      return Math.min(m.handle + m.pad, m.natural);
    case "resting":
      return Math.min(m.rest, m.natural);
    case "raised":
      return Math.min(m.natural, Math.max(m.rest, m.raisedCap));
    case "full":
      return Math.min(m.natural, m.fullCap);
  }
}

/**
 * The room the page leaves under its last element: whatever of the sheet stands at its position now, and 20px, so
 * the last element scrolls clear of the sheet at every height and not only at rest (the first-contact round: a raised
 * sheet covered "Stakes, for all 3"). Full stands as high as raised for this, since nothing scrolls clear of a sheet
 * that reaches the top.
 */
export function roomFor(position: SheetPosition, m: SheetMeasure): number {
  return visibleAt(position === "full" ? "raised" : position, m) + 20;
}

/** The positions a sheet has, lowest first: tucked and resting always; raised when there is more than the move; full when raised cannot show it all. Pure. */
export function positionsOf(m: SheetMeasure): SheetPosition[] {
  const out: SheetPosition[] = ["tucked", "resting"];
  if (m.natural > m.rest + 1) out.push("raised");
  if (out.includes("raised") && m.natural > visibleAt("raised", m) + 1) out.push("full");
  return out;
}

/**
 * Where a drag that moved `moved` px (down positive) sends the sheet from `current`: past the snap, one position in
 * its direction at least, and as far as the finger took it, the position nearest where it let go (the first-contact
 * round: a sheet that opens raised took two drags to tuck, and one long drag read as "it doesn't tuck"); else where it
 * was. `yOf` is each position's offset; without it, one position. Pure.
 */
export function nextPosition(current: SheetPosition, moved: number, available: SheetPosition[], yOf?: (p: SheetPosition) => number): SheetPosition {
  const at = Math.max(0, available.indexOf(current));
  if (Math.abs(moved) <= SNAP_PX) return available[at] ?? current;
  const step = moved < 0 ? 1 : -1;
  let to = Math.min(Math.max(at + step, 0), available.length - 1);
  if (yOf) {
    const released = yOf(available[at] ?? current) + moved;
    const near = (i: number) => Math.abs(yOf(available[i] as SheetPosition) - released);
    for (let i = to + step; i >= 0 && i < available.length && near(i) < near(to); i += step) to = i;
  }
  return available[to] ?? current;
}

const EMPTY: SheetMeasure = { handle: 0, rest: 0, natural: 0, raisedCap: 0, fullCap: 0, pad: 0 };

export function PinnedSheet({
  label,
  header,
  low,
  high,
  foot,
  raised,
  onRaise,
  className,
  arrive = false,
  leaving = false,
}: {
  label: string;
  header?: ReactNode;
  low: ReactNode;
  high?: ReactNode;
  foot?: ReactNode;
  raised?: boolean;
  onRaise?: (raised: boolean) => void;
  className?: string;
  /** The sheet arriving because a state gained a move (9.9): from below its own height over travel on the move curve. */
  arrive?: boolean;
  /** The sheet leaving because a state lost its move (9.9): downward over base on the leave curve; the parent removes it after. */
  leaving?: boolean;
}) {
  const [own, setOwn] = useState<SheetPosition>(raised ? "raised" : "resting");
  // The screen's word (`raised`) moves the sheet when it changes, and only between up and down: the sheet's own
  // position otherwise, so a sheet the screen holds lowered can still be tucked by a thumb, and one the screen
  // raised can still be taken to full.
  const [seenRaised, setSeenRaised] = useState(raised);
  if (raised !== seenRaised) {
    setSeenRaised(raised);
    if (raised !== undefined && (own === "raised" || own === "full") !== raised) setOwn(raised ? "raised" : "resting");
  }
  /** In the ask layer the sheet is the action bar at the layer's foot, in flow (9.5). */
  const inFlow = useContext(InFlowSheets);
  const panel = useRef<HTMLDivElement>(null);
  const handleRow = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLDivElement>(null);
  /** The layers host: null until hydration has moved the sheet into it, at which point its nodes are new ones. */
  const host = useLayersHost();
  const [m, setM] = useState<SheetMeasure>(EMPTY);
  const available = positionsOf(m);
  const position: SheetPosition = available.includes(own) ? own : own === "full" || own === "raised" ? (available[available.length - 1] ?? "resting") : "resting";
  const isRaised = position === "raised" || position === "full";
  const setPosition = (to: SheetPosition) => {
    setOwn(to);
    const up = to === "raised" || to === "full";
    if (up !== isRaised) onRaise?.(up);
  };
  const positionRef = useRef(position);
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  // Everything measured at once, whenever any part changes size: the handle row, the resting part, what is laid
  // out in all, and the screen's two caps. The resting height becomes the screen's bottom padding
  // (`--sheet-room`), changed when the sheet settles and never frame by frame.
  useEffect(() => {
    const el = panel.current;
    const row = handleRow.current;
    const box = body.current;
    const all = content.current;
    if (!el || !row || !box || !all || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const measure = () => {
      const padB = Math.max(0, el.offsetHeight - row.offsetHeight - box.offsetHeight);
      const moreH = more.current?.offsetHeight ?? 0;
      const natural = row.offsetHeight + all.offsetHeight + padB;
      const next: SheetMeasure = {
        pad: padB,
        handle: row.offsetHeight,
        rest: natural - moreH,
        natural,
        // The screen is the app root's box: on iOS 26 an installed app's document element reads 62 points short of it (measured 2026-10-03).
        raisedCap: Math.round((document.getElementById("app") ?? root).clientHeight * RAISED_SHARE),
        fullCap: Math.max(0, el.offsetHeight),
      };
      setM((was) => (was.handle === next.handle && was.rest === next.rest && was.natural === next.natural && was.raisedCap === next.raisedCap && was.fullCap === next.fullCap && was.pad === next.pad ? was : next));
      if (!leaving && !inFlow) root.style.setProperty("--sheet-room", `${roomFor(positionRef.current, next)}px`);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(row);
    ro.observe(all);
    if (more.current) ro.observe(more.current);
    measure();
    return () => {
      ro.disconnect();
      root.style.removeProperty("--sheet-room");
    };
    // The host is a dependency: after a hard load the sheet moves into the layers host, and the nodes measured before that are gone.
  }, [leaving, inFlow, host, high, foot]);

  // The room follows the sheet's settled position (the first-contact round): raised, the page's last element still scrolls clear of it.
  useEffect(() => {
    if (leaving || inFlow || m.natural === 0) return;
    document.documentElement.style.setProperty("--sheet-room", `${roomFor(position, m)}px`);
  }, [position, m, leaving, inFlow]);

  // A tap counts only on the control it began on (`taps.ts`): the sheet moves under a finger, and a control that
  // rises into the spot where the finger went down must not take its click.
  const onClickCapture = useTapGuard();

  const startY = useRef<number | null>(null);
  const pulled = useRef(0);
  const tapped = useRef(false);
  const onGrabber = useRef(false);
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [settle, setSettle] = useState<number | null>(null);
  // A raise or a lower the screen asked for travels like one the finger made (9.9): the change of height and its
  // transition have to land in the same render, so the duration is set while rendering, before anything is drawn.
  const [wasPosition, setWasPosition] = useState(position);
  if (wasPosition !== position) {
    setWasPosition(position);
    if (settle === null && !dragging) setSettle(MOTION.travel);
  }
  /** The translate that leaves `visibleAt(p)` of the sheet above the viewport's foot. */
  const yOf = (p: SheetPosition) => Math.max(0, m.fullCap - visibleAt(p, m));
  const top = available[available.length - 1] ?? "resting";
  const travel = Math.max(1, yOf("tucked") - yOf(top));
  const handleProps = inFlow && !high
    ? {}
    : {
        onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
          startY.current = e.clientY;
          pulled.current = 0;
          tapped.current = false;
          setSettle(null);
          setDragging(true);
          // Once the pointer is captured, later events report this row as their target, so where the touch
          // began is remembered here.
          onGrabber.current = e.target instanceof HTMLElement && e.target.closest("button[aria-expanded]") !== null;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // No active pointer to capture (a synthetic event): the drag still reads from this row.
          }
        },
        onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
          if (startY.current === null) return;
          pulled.current = e.clientY - startY.current;
          const p = pulled.current;
          // Between its ends the sheet follows the finger; past either, a third of the travel, 16px at most.
          const here = yOf(positionRef.current);
          const lowest = yOf("tucked");
          const highest = yOf(top);
          const want = here + p;
          const next = want < highest ? highest + overscroll(want - highest) : want > lowest ? lowest + overscroll(want - lowest) : want;
          setDy(next - here);
        },
        onPointerUp: () => {
          const moved = pulled.current;
          const wasDrag = startY.current !== null;
          startY.current = null;
          pulled.current = 0;
          setDragging(false);
          const current = positionRef.current;
          let to = nextPosition(current, moved, available, yOf);
          // A tap on the grabber toggles resting and raised. With the pointer captured by this row the click never
          // reaches the button, so the tap is read here; the button's own click still serves the keyboard.
          if (wasDrag && Math.abs(moved) < 4 && onGrabber.current) {
            tapped.current = true;
            to = isRaised ? "resting" : available.includes("raised") ? "raised" : "resting";
          }
          // A touch on the header row raises a lowered sheet (3.30: the pick-one bar); lowering is the grabber's or a swipe's.
          else if (wasDrag && Math.abs(moved) < 4 && !isRaised) to = available.includes("raised") ? "raised" : "resting";
          onGrabber.current = false;
          // Settle from wherever it is: base if less than half the distance is left, travel otherwise (9.9).
          const from = yOf(current) + dy;
          setSettle(settleDuration(yOf(to) - from, travel));
          setDy(0);
          if (to !== current) setPosition(to);
        },
        onPointerCancel: () => {
          startY.current = null;
          pulled.current = 0;
          setDragging(false);
          setDy(0);
        },
      };

  const y = yOf(position) + dy;
  const style: CSSProperties = {
    transform: leaving ? "translateY(100%)" : y !== 0 ? `translateY(${y}px)` : undefined,
    transition: leaving ? `transform ${MOTION.base}ms var(--ease-leave)` : !dragging && settle !== null ? `transform ${settle}ms var(--ease-move)` : undefined,
    // Full reaches the status band less a gap; the sheet is laid out no taller, and only at full does its content scroll.
    maxHeight: inFlow ? undefined : `calc(100lvh - env(safe-area-inset-top) - ${FULL_GAP}px)`,
  };
  const hidden = !isRaised && (Boolean(high) || Boolean(foot));
  const state = position === "resting" ? "low" : position;

  const section = (
      <section aria-label={label} data-pinned-sheet={state} data-fixed={inFlow ? undefined : "bottom"} onClickCapture={onClickCapture} className={inFlow ? "pointer-events-none sticky bottom-0 z-30 -mx-5 mt-auto flex justify-center" : "pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center"}>
        <div
          ref={panel}
          style={style}
          onTransitionEnd={(e) => {
            // Only the sheet's own travel ending: a press fading out inside it bubbles here too.
            if (e.target === e.currentTarget && e.propertyName === "transform") setSettle(null);
          }}
          className={cn("pointer-events-auto flex w-full max-w-[430px] flex-col rounded-t-card border-t border-line bg-surface px-4 pb-[calc(24px+env(safe-area-inset-bottom))]", arrive && "motion-rise", className)}
        >
          {/* Every sheet keeps its handle in every state (3.24 as amended): the grabber, 48 by 6 for a thumb (the owner's finding), and the header row under it. */}
          <div ref={handleRow} className="shrink-0">
            <div {...HANDLE_ROW} className="-mx-4 flex select-none touch-none flex-col px-4" {...handleProps}>
              <button
                type="button"
                aria-expanded={isRaised}
                aria-label={isRaised ? "Lower the sheet" : "Raise the sheet"}
                onClick={() => {
                  if (tapped.current) {
                    tapped.current = false;
                    return;
                  }
                  setSettle(MOTION.travel);
                  setPosition(isRaised ? "resting" : available.includes("raised") ? "raised" : "resting");
                }}
                className="flex h-7 w-full items-start justify-center pt-2"
              >
                <span aria-hidden="true" className="h-[6px] w-12 rounded-[3px] bg-line-strong" />
              </button>
              {header ? <div className="pt-1">{header}</div> : null}
            </div>
          </div>
          <div ref={body} className={cn("flex min-h-0 flex-col", position === "full" ? "overflow-y-auto overscroll-y-contain" : "overflow-hidden")} data-sheet-body={position === "full" ? "scrolls" : undefined}>
            <div ref={content} className="flex flex-col">
              <div className={cn("flex flex-col gap-[10px]", header && "pt-[10px]")}>{low}</div>
              {high || foot ? (
                // What the resting height hides: below the resting part, so the sheet's own translate is what lowers it (9.9). Kept out of the tab order while hidden.
                <div ref={more} aria-hidden={hidden} inert={hidden ? true : undefined} className="flex flex-col gap-[10px] pt-[10px]" data-sheet-more="">
                  {high}
                  {foot}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {/* The strip at the viewport's foot in the sheet's surface: it hides the lowered part's top edge under the sheet's own bottom padding, so lowering never shows what it is meant to hide. */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto h-[calc(24px+env(safe-area-inset-bottom))] w-full max-w-[430px] bg-surface" />
      </section>
  );
  return inFlow ? section : <FixedLayer name="sheet">{section}</FixedLayer>;
}
