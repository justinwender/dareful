"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { acceptSuggestionAction } from "@/lib/actions/claims";
import { ProblemSummary } from "@/components/ledger/problem";

/**
 * Claimant suggestion (PLANNING.md section 4): a friend added someone under this person's name in a set they
 * share. Offered, never assumed. This is the one tap, as the row action of a Needs you row (docs/design.md 3.15,
 * 4.7); nothing moves unless they tap, and ignoring it costs nothing.
 */
export function ThatsMe({ claimId, label }: { claimId: string; label: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-col items-end gap-2">
      <Button
        variant="row"
        loading={pending}
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
        {label}
      </Button>
      {error ? <ProblemSummary messages={[error]} /> : null}
    </span>
  );
}
