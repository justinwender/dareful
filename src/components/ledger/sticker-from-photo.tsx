"use client";

import { useId } from "react";
import { ProblemSummary } from "@/components/ledger/problem";
import { Button, ButtonLink } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { stickerSrc } from "@/lib/ui/mark";

/**
 * Making a sticker from a photo (docs/design.md 3.28, frames 2 and 3; 3.38, the full-screen photo). The owner
 * confirmed on a real iPhone that the phone's own subject lift works on an image inside the installed app
 * (docs/testing.md item 59), so the guided path is the phone's: the sheet raises over the photo without a scrim,
 * so the photo can still be held; two named steps say what to do; the chalk "Paste" runs the same paste path as
 * the picker; a paste anywhere while the sheet is up is the cutout arriving. The result stands where the photo
 * was: the sticker on the market's field, "In your stickers", the chalk to ask something with it (the question
 * step opens with it as the mark) and a tertiary "Done" back to the photo. Cutting inside the app (frame 5,
 * `CutSheet`, Round C) comes first wherever the model loads; this path stands in wherever it cannot.
 */
export function StickerSheet({ open, pasting, problem, onPaste, onClose }: { open: boolean; pasting: boolean; problem: string | null; onPaste: () => void; onClose: () => void }) {
  const titleId = useId();
  return (
    <Sheet open={open} clear onClose={onClose} labelledBy={titleId}>
      <h2 id={titleId} className="text-body-strong text-ink">
        Make a sticker
      </h2>
      <ol className="flex flex-col gap-3" data-sticker-steps="">
        <li className="flex items-center gap-3 text-body-sm text-ink">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-2">
            <path d="M9 11.5V6a1.5 1.5 0 0 1 3 0v5M12 10.5a1.5 1.5 0 0 1 3 0v1.5M15 11.5a1.5 1.5 0 0 1 3 0V16a5 5 0 0 1-5 5h-1.5a5 5 0 0 1-4.3-2.4l-2.6-4.4a1.4 1.4 0 0 1 2.3-1.6L9 15" />
          </svg>
          Hold what you want, then tap Copy
        </li>
        <li className="flex items-center gap-3 text-body-sm text-ink">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-2">
            <rect x="8" y="8" width="12" height="12" rx="2" />
            <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
          </svg>
          Then paste it here
        </li>
      </ol>
      <ProblemSummary messages={[problem]} />
      <Button variant="primary" onClick={onPaste} loading={pasting} data-paste-cutout="">
        Paste
      </Button>
    </Sheet>
  );
}

/**
 * Cutting inside the app (docs/design.md 3.28, frame 5; Round C, pre-approved): the see-through sheet reads "Tap
 * what to keep"; a tap on the photo asks the model, the subject takes a dashed cream outline (drawn by the
 * viewer), and the chalk "Keep it" sends the cutout down the same path a pasted one takes, with "Start over"
 * clearing the tap. The chalk carries the wait (5.2) while the model loads or a cut runs; nothing else says so.
 * One line reads the model's timings, an instrument for the phone check (docs/testing.md item 94), which leaves
 * once the phone has answered.
 */
export function CutSheet({ open, busy, cut, problem, timing, onKeep, onStartOver, onClose }: { open: boolean; /** The model loading, or a cut or the upload running: the chalk wears the runner. */ busy: boolean; /** Whether a subject has been cut and outlined. */ cut: boolean; problem: string | null; timing: { loadMs: number | null; cutMs: number | null }; onKeep: () => void; onStartOver: () => void; onClose: () => void }) {
  const titleId = useId();
  const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  return (
    <Sheet open={open} clear onClose={onClose} labelledBy={titleId}>
      <h2 id={titleId} className="text-body-strong text-ink">
        Tap what to keep
      </h2>
      {timing.loadMs !== null || timing.cutMs !== null ? (
        <p className="text-caption text-ink-3" data-cut-timing={`${timing.loadMs ?? ""}/${timing.cutMs ?? ""}`}>
          {[timing.loadMs !== null ? `Model loaded in ${seconds(timing.loadMs)}` : null, timing.cutMs !== null ? `cut in ${seconds(timing.cutMs)}` : null].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      <ProblemSummary messages={[problem]} />
      <div className="flex flex-col gap-1">
        <Button variant="primary" onClick={onKeep} loading={busy} disabled={!cut} data-keep-cut="">
          Keep it
        </Button>
        <Button variant="tertiary" onClick={onStartOver} disabled={!cut || busy} data-start-over="">
          Start over
        </Button>
      </div>
    </Sheet>
  );
}

/** The result (3.28, frame 3), in the viewer's place: the sticker on the field, "In your stickers", the chalk to ask with it, and Done. */
export function StickerMade({ id, onDone, onClose }: { id: string; onDone: () => void; onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Your new sticker" data-sticker-made={id} className="fixed inset-0 z-40 flex flex-col bg-ground pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 shrink-0 items-center justify-end px-2">
        <button type="button" aria-label="Close" onClick={onClose} className="inline-flex h-12 w-12 items-center justify-center rounded-pill text-ink">
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-5">
        <div className="flex h-[220px] w-[220px] items-center justify-center rounded-card bg-field">
          {/* eslint-disable-next-line @next/next/no-img-element -- behind the mark's own door, a signed URL that expires */}
          <img src={stickerSrc(id, 256)} alt="" width={176} height={176} className="h-44 w-44 object-contain" />
        </div>
        <p className="text-body-strong text-ink">In your stickers</p>
      </div>
      <div className="mx-auto flex w-full max-w-[430px] shrink-0 flex-col gap-1 px-5 pt-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <ButtonLink href={`/m/new?sticker=${id}`} variant="primary" data-ask-with-sticker="">
          Ask something with it
        </ButtonLink>
        <Button variant="tertiary" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
