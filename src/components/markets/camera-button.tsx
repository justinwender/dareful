"use client";

import { usePhotoAdding } from "./photo-adding";

/**
 * The camera beside "Send it to the chat" (docs/design.md 3.39): a 56px square secondary button, radius 10, a
 * 1px line-strong border and no fill, the 24px camera glyph in ink, named "Take a photo". It exists only for
 * someone who is in, only while the market is open, and it opens the camera itself, not the library. While a
 * photo is going up the 2px runner of 5.2 runs along its bottom edge.
 */
export function CameraButton() {
  const { pick, pending } = usePhotoAdding();
  return (
    <button type="button" aria-label="Take a photo" data-take-photo="" onClick={pick} aria-busy={pending > 0 || undefined} className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-button border border-line-strong bg-transparent text-ink transition-opacity duration-[120ms] active:opacity-[0.88] aria-busy:opacity-[0.88]">
      <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.2-2h6.2l1.2 2h2.2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" />
        <circle cx="12" cy="13" r="3.4" />
      </svg>
      {pending > 0 ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] overflow-hidden bg-surface-2">
          <span className="absolute inset-y-0 w-1/3 animate-[button-runner_1.2s_linear_infinite] bg-ink" />
        </span>
      ) : null}
    </button>
  );
}
