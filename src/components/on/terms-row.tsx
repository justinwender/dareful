"use client";

import { useId, useState, type ReactNode } from "react";
import { Sheet } from "@/components/ui/sheet";

/** "The terms" (docs/design.md 3.33): in a game page's open card, a 44px row that opens the question's details as a modal sheet. */
export function TermsRow({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" data-press="row" data-terms-row="" className="press-row flex h-11 items-center justify-between gap-3 rounded-button border border-line px-3 text-left">
        <span className="text-body-sm font-semibold text-ink">The terms</span>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-3">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} labelledBy={titleId}>
        <h2 id={titleId} className="text-body-strong text-ink">
          The terms
        </h2>
        {children}
      </Sheet>
    </>
  );
}
