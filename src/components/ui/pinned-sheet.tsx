"use client";

import { useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { FixedLayer, InFlowSheets } from "./layers";
import { MOTION, overscroll, settleDuration } from "@/lib/ui/motion";
import { cn } from "@/lib/utils";

/**
 * The sheet (docs/design.md 3.24, 9.9): every market screen and every task screen keeps its one move pinned to the
 * bottom, where the tab bar sits on a root. It never scrolls away and never goes empty while the market runs.
 * The content behind it scrolls, with bottom padding equal to the sheet's resting height plus 20px, so nothing
 * is trapped underneath (`--sheet-room`, read by `Screen`).
 *
 * Two heights, only when there is more to show. `low` holds the move; `high` and `foot` add what the move
 * needs. The sheet is laid out at its raised height and sits at its low height by a `translateY` on itself
 * equal to the difference (9.9): nothing inside it is fixed, nothing that contains it moves, and it is
 * portalled to the app root (9.3) so no page ancestor can capture it. A swipe up on the handle raises it, a swipe
 * down lowers it so the market behind can be read, snapping by direction: more than 24px raises or lowers,
 * anything less stays. Tapping the grabber toggles. A sheet with no `high` has no grabber and does not move.
 * The grabber and the header row under it are the drag handle, and only they: the move itself (a slider, a
 * field, a button) keeps its own gestures. While a finger drags, the sheet follows it with no transition; past
 * either height it moves a third of the finger's travel, 16px at most; on release it settles over base if less
 * than half the distance is left and over travel otherwise, on the move curve, from wherever it is.
 *
 * It is not modal: nothing behind it is dimmed, the page still scrolls, and it never locks anything. A moment
 * that binds other people still gets the modal `Sheet` on top of it. It never counts down: clocks live in the
 * question band, and citron appears only on a vote with a deadline that this person has not cast.
 */
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
  const [own, setOwn] = useState(false);
  const isRaised = high ? (raised ?? own) : false;
  /** In the ask layer the sheet is the action bar at the layer's foot, in flow (9.5). */
  const inFlow = useContext(InFlowSheets);
  const setRaised = (r: boolean) => {
    if (!high) return;
    setOwn(r);
    onRaise?.(r);
  };
  const panel = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLDivElement>(null);
  const raisedRef = useRef(isRaised);
  useEffect(() => {
    raisedRef.current = isRaised;
  }, [isRaised]);
  /** The difference between the two heights: what sits below the low part, measured. */
  const [hidden, setHidden] = useState(0);
  useEffect(() => {
    const el = more.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setHidden(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [high, foot]);
  // The resting height, measured, becomes the screen's bottom padding (`--sheet-room`), changed when the sheet
  // settles and never frame by frame, so the content behind always scrolls clear of the sheet.
  useEffect(() => {
    const el = panel.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const measure = () => {
      if (leaving || inFlow) return;
      const rest = Math.max(0, el.offsetHeight - (more.current?.offsetHeight ?? 0));
      root.style.setProperty("--sheet-room", `${rest + 20}px`);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (more.current) ro.observe(more.current);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--sheet-room");
    };
  }, [leaving, inFlow]);

  const startY = useRef<number | null>(null);
  const pulled = useRef(0);
  const tapped = useRef(false);
  const onGrabber = useRef(false);
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [settle, setSettle] = useState<number | null>(null);
  const handleProps = high
    ? {
        onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
          startY.current = e.clientY;
          pulled.current = 0;
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
          // Between the two heights the sheet follows the finger; past either, a third of the travel, 16px at most.
          const next = isRaised ? (p < 0 ? overscroll(p) : p > hidden ? hidden + overscroll(p - hidden) : p) : p > 0 ? overscroll(p) : p < -hidden ? -hidden + overscroll(p + hidden) : p;
          setDy(next);
        },
        onPointerUp: () => {
          const moved = pulled.current;
          const wasDrag = startY.current !== null;
          startY.current = null;
          pulled.current = 0;
          setDragging(false);
          let to = isRaised;
          if (moved < -24) to = true;
          else if (moved > 24) to = false;
          // A tap on the grabber toggles. With the pointer captured by this row the click never reaches the
          // button, so the tap is read here; the button's own click still serves the keyboard.
          else if (wasDrag && Math.abs(moved) < 4 && onGrabber.current) {
            tapped.current = true;
            to = !isRaised;
          }
          // A touch on the header row raises a lowered sheet (3.30: the pick-one bar); lowering is the grabber's or a swipe's.
          else if (wasDrag && Math.abs(moved) < 4 && !isRaised) to = true;
          onGrabber.current = false;
          // Settle from wherever it is: base if less than half the distance is left, travel otherwise (9.9).
          const from = (isRaised ? 0 : hidden) + dy;
          const target = to ? 0 : hidden;
          setSettle(settleDuration(target - from, hidden));
          setDy(0);
          if (to !== isRaised) setRaised(to);
        },
        onPointerCancel: () => {
          startY.current = null;
          pulled.current = 0;
          setDragging(false);
          setDy(0);
        },
      }
    : {};

  const rest = isRaised ? 0 : hidden;
  const y = rest + dy;
  const style: CSSProperties = {
    transform: leaving ? "translateY(100%)" : y !== 0 ? `translateY(${y}px)` : undefined,
    transition: leaving ? `transform ${MOTION.base}ms var(--ease-leave)` : !dragging && settle !== null ? `transform ${settle}ms var(--ease-move)` : undefined,
  };

  const section = (
      <section aria-label={label} data-pinned-sheet={isRaised ? "raised" : "low"} className={inFlow ? "sticky bottom-0 z-30 mt-auto flex justify-center" : "fixed inset-x-0 bottom-0 z-30 flex justify-center"} style={inFlow ? ({ viewTransitionName: "ask-action" } as CSSProperties) : undefined}>
        <div
          ref={panel}
          style={style}
          onTransitionEnd={() => setSettle(null)}
          className={cn("w-full max-w-[430px] rounded-t-card border-t border-line bg-surface px-4 pb-[calc(24px+env(safe-area-inset-bottom))]", arrive && "motion-rise", className)}
        >
          {high ? (
            <div className="-mx-4 flex select-none touch-none flex-col px-4" {...handleProps}>
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
                  setRaised(!isRaised);
                }}
                className="flex h-6 w-full items-start justify-center pt-2"
              >
                <span aria-hidden="true" className="h-[5px] w-9 rounded-[3px] bg-line-strong" />
              </button>
              {header ? <div className="pt-1">{header}</div> : null}
            </div>
          ) : (
            <div className="pt-4">{header}</div>
          )}
          <div className={cn("flex flex-col gap-[10px]", header && "pt-[10px]")}>{low}</div>
          {high || foot ? (
            // What the low height hides: below the low part, so the sheet's own translate is what lowers it (9.9). Kept out of the tab order while hidden.
            <div ref={more} aria-hidden={!isRaised && Boolean(high)} inert={!isRaised && Boolean(high) ? true : undefined} className="flex flex-col gap-[10px] pt-[10px]" data-sheet-more="">
              {high}
              {foot}
            </div>
          ) : null}
        </div>
        {/* The strip at the viewport's foot in the sheet's surface: it hides the lowered part's top edge under the sheet's own bottom padding, so lowering never shows what it is meant to hide. */}
        {high ? <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto h-[calc(24px+env(safe-area-inset-bottom))] w-full max-w-[430px] bg-surface" /> : null}
      </section>
  );
  return inFlow ? section : <FixedLayer name="sheet">{section}</FixedLayer>;
}
