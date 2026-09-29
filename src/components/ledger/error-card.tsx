"use client";

import { AlertGlyph } from "@/components/ledger/problem";
import { Button } from "@/components/ui/button";

/**
 * The error card (docs/design.md 3.4, 5.1): the card shape with one `body-sm` line, "Couldn't load this one,"
 * and a 44px "Try again" inside it. Never red, never a code, never the failure's own words (5.4): what failed is
 * logged by whoever caught it, and the person sees what happened and what to do.
 */
export function ErrorCard({ onRetry, retrying = false }: { onRetry: () => void; retrying?: boolean }) {
  return (
    <div role="alert" data-error-card="" className="flex flex-col gap-3 rounded-card border border-line-strong bg-surface-2 px-[14px] py-3">
      <p className="flex gap-2 text-body-sm text-ink">
        <AlertGlyph />
        <span>Couldn’t load this one.</span>
      </p>
      <div>
        <Button variant="secondary" onClick={onRetry} loading={retrying}>
          Try again
        </Button>
      </div>
    </div>
  );
}
