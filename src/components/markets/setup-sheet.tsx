"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

/** "How this was set up": the terms, the rule for a stalemate, the app's starting number, and the exact figure behind the whole tenth. */
export function SetupSheet({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="tertiary" onClick={() => setOpen(true)}>
        How this was set up
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} labelledBy="setup-title">
        <h2 id="setup-title" className="text-card-question text-ink">
          How this was set up
        </h2>
        <div className="flex flex-col gap-4">{children}</div>
        <Button variant="secondary" data-autofocus onClick={() => setOpen(false)}>
          Done
        </Button>
      </Sheet>
    </>
  );
}
