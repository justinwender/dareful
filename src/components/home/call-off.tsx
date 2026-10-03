"use client";

import { attempt } from "@/lib/ui/attempt";
import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { ProblemSummary } from "@/components/ledger/problem";
import { archiveMarketAction, removeMarketAction } from "@/lib/actions/markets";

/** How far the row slides, and the square it uncovers (docs/design.md 3.15). */
const REVEAL = 76;

/**
 * The swipe actions on Now (docs/design.md 3.15, `CallOff`): a Running row for a market you asked that nobody
 * else is in slides 76px left over a square holding the trash glyph, named "Remove"; a Just happened row for a
 * finished market slides over the archive square. A tap on either opens a modal sheet that asks once, then the
 * row collapses over 200ms and nothing announces it (a section it empties goes with it on the re-read). No hint
 * teaches the swipe: it is the platform's gesture, and nothing depends on finding it, so the square is a real
 * button, reachable by keyboard too. Every other row stays put: it is not wrapped in this. A game's questions in
 * one set are one row and swipe as one (ruled 2026-09-27): archived together when the game is finished, removed
 * together only when nobody else is in any of them.
 */
export function CallOff({ kind, dareId, ids, game = false, children }: { kind: "remove" | "archive"; /** The one question, or the first of a game's. */ dareId: string; /** A game's questions in this set, which swipe as one (ruled 2026-09-27); the one question when absent. */ ids?: string[]; /** A game row: the ask names the game and its questions. */ game?: boolean; children: ReactNode }) {
  const router = useRouter();
  const titleId = useId();
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const drag = useRef<{ x: number; y: number; from: number; dragging: boolean | null } | null>(null);
  /** A mouse drag ends with a click on the same element (touch does not): that click is the end of the swipe, not a tap. */
  const endedDrag = useRef(false);

  function down(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // A mouse would start a text selection and autoscroll at the edge; a finger keeps its scroll (touch-action: pan-y).
    if (e.pointerType === "mouse") e.preventDefault();
    drag.current = { x: e.clientX, y: e.clientY, from: dx, dragging: null };
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (d.dragging === null) {
      if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
      d.dragging = Math.abs(mx) > Math.abs(my);
      if (d.dragging) e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (!d.dragging) return;
    setDx(Math.max(-REVEAL, Math.min(0, d.from + mx)));
  }
  function up() {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.dragging) return;
    endedDrag.current = true;
    setDx(dx < -REVEAL / 2 ? -REVEAL : 0);
  }
  function act() {
    setProblem(null);
    start(async () => {
      const all = ids && ids.length > 0 ? ids : [dareId];
      const r = kind === "remove" ? await attempt(() => removeMarketAction(all)) : await attempt(() => archiveMarketAction(all));
      if ("error" in r) return setProblem(r.error);
      setOpen(false);
      setGone(true);
      setTimeout(() => router.refresh(), 220);
    });
  }
  const name = kind === "remove" ? "Remove" : "Archive";
  return (
    <div className="relative overflow-hidden motion-safe:transition-[max-height,opacity] duration-(--motion-base) ease-move" style={gone ? { maxHeight: 0, opacity: 0 } : { maxHeight: 200 }} data-call-off={kind} data-call-off-game={game ? "" : undefined} data-call-off-open={dx < 0 ? "" : undefined}>
      <button type="button" aria-label={name} onClick={() => setOpen(true)} data-press="fill" className={`absolute inset-y-0 right-0 flex items-center justify-center press-fill ${kind === "remove" ? "bg-remove text-chalk" : "bg-archive text-on-chalk"}`} style={{ width: REVEAL }} data-call-off-square="" tabIndex={dx < 0 ? 0 : -1}>
        {kind === "remove" ? (
          <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
          </svg>
        ) : (
          <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="5" rx="1" />
            <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" />
          </svg>
        )}
      </button>
      <div
        className="relative select-none bg-surface motion-safe:transition-transform motion-safe:duration-(--motion-base) ease-move"
        style={{ transform: `translateX(${dx}px)`, touchAction: "pan-y" }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        // A mouse dragging a link starts the browser's own drag of its address, which would cancel the swipe.
        onDragStart={(e) => e.preventDefault()}
        onClickCapture={(e) => {
          if (endedDrag.current) {
            endedDrag.current = false;
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          // A swipe is not a tap: the row's link opens only when nothing slid.
          if (dx < 0) {
            e.preventDefault();
            e.stopPropagation();
            setDx(0);
          }
        }}
      >
        {children}
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} labelledBy={titleId}>
        <h2 id={titleId} className="text-body-strong text-ink">
          {kind === "remove" ? (game ? "Remove this game?" : "Remove this market?") : "Archive this?"}
        </h2>
        <div className="flex flex-col gap-4" data-call-off-ask={kind}>
          <p className="text-body-sm text-ink-2">{kind === "remove" ? (game ? "Its questions leave Now, and they count against nobody." : "It leaves Now, and it counts against nobody.") : "It leaves Now. You can still find it from the people in it."}</p>
          <ProblemSummary messages={[problem]} />
          <Button variant="primary" loading={pending} onClick={act}>
            {kind === "remove" ? "Remove it" : "Archive it"}
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
            Keep it
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
