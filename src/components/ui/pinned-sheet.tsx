"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The sheet (docs/design.md 3.24): every market screen and every task screen keeps its one move pinned to the
 * bottom, where the tab bar sits on a root. It never scrolls away and never goes empty while the market runs.
 * The content behind it scrolls, with bottom padding equal to the sheet's resting height plus 20px, so nothing
 * is trapped underneath: the spacer this renders in flow is that padding.
 *
 * Two heights, only when there is more to show. `low` holds the move; `high` adds what the move needs. A swipe
 * up on the handle raises it, a swipe down lowers it so the market behind can be read, snapping by direction:
 * more than 24px raises or lowers, anything less stays. Tapping the grabber toggles. A sheet with no `high` has
 * no grabber and does not move. The grabber and the header row under it are the drag handle, and only they: the
 * move itself (a slider, a field, a button) keeps its own gestures.
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
}: {
  label: string;
  header?: ReactNode;
  low: ReactNode;
  high?: ReactNode;
  foot?: ReactNode;
  raised?: boolean;
  onRaise?: (raised: boolean) => void;
  className?: string;
}) {
  const [own, setOwn] = useState(false);
  const isRaised = high ? (raised ?? own) : false;
  const setRaised = (r: boolean) => {
    if (!high) return;
    setOwn(r);
    onRaise?.(r);
  };
  const panel = useRef<HTMLDivElement>(null);
  const raisedRef = useRef(isRaised);
  useEffect(() => {
    raisedRef.current = isRaised;
  }, [isRaised]);
  // The resting height, measured, becomes the screen's bottom padding (`--sheet-room`, read by `Screen`), so the
  // content behind always scrolls clear of the sheet wherever in the tree the sheet happens to be rendered.
  useEffect(() => {
    const el = panel.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const measure = () => {
      if (!raisedRef.current)
        root.style.setProperty("--sheet-room", `${el.offsetHeight + 20}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--sheet-room");
    };
  }, []);

  const startY = useRef<number | null>(null);
  const pulled = useRef(0);
  const tapped = useRef(false);
  const onGrabber = useRef(false);
  const [dy, setDy] = useState(0);
  const handleProps = high
    ? {
        onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
          startY.current = e.clientY;
          pulled.current = 0;
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
          // Lowering follows the finger; raising lifts a little, and the height change does the rest on release.
          setDy(
            pulled.current > 0
              ? isRaised
                ? Math.min(pulled.current, 160)
                : Math.min(pulled.current, 24)
              : Math.max(pulled.current, -8),
          );
        },
        onPointerUp: () => {
          const moved = pulled.current;
          const wasDrag = startY.current !== null;
          startY.current = null;
          pulled.current = 0;
          setDy(0);
          if (moved < -24) setRaised(true);
          else if (moved > 24) setRaised(false);
          // A tap on the grabber toggles. With the pointer captured by this row the click never reaches the
          // button, so the tap is read here; the button's own click still serves the keyboard.
          else if (wasDrag && Math.abs(moved) < 4 && onGrabber.current) {
            tapped.current = true;
            setRaised(!isRaised);
          }
          onGrabber.current = false;
        },
        onPointerCancel: () => {
          startY.current = null;
          pulled.current = 0;
          setDy(0);
        },
      }
    : {};

  return (
    <>
      <section
        aria-label={label}
        className="fixed inset-x-0 bottom-0 z-30 flex justify-center"
      >
        <div
          ref={panel}
          style={dy !== 0 ? { transform: `translateY(${dy}px)` } : undefined}
          className={cn(
            "w-full max-w-[430px] rounded-t-card border-t border-line bg-surface px-4 pb-[calc(24px+env(safe-area-inset-bottom))] duration-200 ease-out motion-safe:transition-transform",
            className,
          )}
        >
          {high ? (
            <div
              className="-mx-4 flex select-none touch-none flex-col px-4"
              {...handleProps}
            >
              <button
                type="button"
                aria-expanded={isRaised}
                aria-label={isRaised ? "Lower the sheet" : "Raise the sheet"}
                onClick={() => {
                  if (tapped.current) {
                    tapped.current = false;
                    return;
                  }
                  setRaised(!isRaised);
                }}
                className="flex h-6 w-full items-start justify-center pt-2"
              >
                <span
                  aria-hidden="true"
                  className="h-[5px] w-9 rounded-[3px] bg-line-strong"
                />
              </button>
              {header ? <div className="pt-1">{header}</div> : null}
            </div>
          ) : (
            <div className="pt-4">{header}</div>
          )}
          <div
            className={cn("flex flex-col gap-[10px]", header && "pt-[10px]")}
          >
            {low}
          </div>
          {high ? (
            <div
              aria-hidden={!isRaised}
              className="grid duration-300 ease-out motion-safe:transition-[grid-template-rows]"
              style={{ gridTemplateRows: isRaised ? "1fr" : "0fr" }}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="flex flex-col gap-[10px] pt-[10px]">{high}</div>
              </div>
            </div>
          ) : null}
          {foot ? (
            <div className="flex flex-col gap-[10px] pt-[10px]">{foot}</div>
          ) : null}
        </div>
      </section>
    </>
  );
}
