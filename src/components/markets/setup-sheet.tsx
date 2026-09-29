"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

/**
 * More (docs/design.md 3.25, 4.9): everything the product needs to say about how a question works beyond the
 * lines that earn a place on the screen, where someone can go looking for it. The exact group's number, the
 * reveal rule, the stake unit, and the creator's ink pick.
 */
export function SetupSheet({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* More is the 48px icon beside the information icon in the header (3.25, 10.3): three dots, named. */}
      <Button variant="icon" aria-label="More" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} data-more="">
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} labelledBy="setup-title">
        <h2 id="setup-title" className="text-body-strong text-ink">
          How this one works
        </h2>
        <div className="flex flex-col gap-4">{children}</div>
        <Button variant="secondary" data-autofocus onClick={() => setOpen(false)}>
          Done
        </Button>
      </Sheet>
    </>
  );
}
