"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ledger/avatar";
import { Button } from "@/components/ui/button";
import { acceptSuggestionAction } from "@/lib/actions/claims";

/**
 * Claimant suggestion (PLANNING.md section 4): a friend added someone under this person's name in a group
 * they share. Offered, never assumed. Nothing moves unless they tap, and ignoring it costs nothing.
 */
export function SuggestedGhost({ claimId, name, creatorName }: { claimId: string; name: string; creatorName: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3 rounded-card border border-dashed border-line-strong p-4">
      <div className="flex items-center gap-3">
        <Avatar name={name} hue="stone" size={32} ghost />
        <p className="text-body text-ink-2">
          {creatorName} has things with a <span className="text-body-strong text-ink">{name}</span>. Is that you?
        </p>
      </div>
      <div>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await acceptSuggestionAction(claimId);
              if ("error" in r) {
                setError(r.error);
                return;
              }
              router.push("/welcome");
              router.refresh();
            })
          }
        >
          That’s me
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-body-sm text-ink-2">
          {error}
        </p>
      ) : null}
    </div>
  );
}
