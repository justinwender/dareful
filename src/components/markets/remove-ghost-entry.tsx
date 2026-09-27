"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ledger/avatar";
import { ProblemSummary } from "@/components/ledger/problem";
import { Button } from "@/components/ui/button";
import { removeGhostEntryAction } from "@/lib/actions/markets";
import type { Hue } from "@/lib/ui/hue";

/**
 * The asker's list of who is in without an account, while the question is open, each with Remove (docs/decisions.md
 * 2026-09-27): a typed name counts at once, and this is the asker's say over it. Plainly placed; the design session
 * may draw it elsewhere.
 */
export function RemoveGhostEntries({ dareId, ghosts }: { dareId: string; ghosts: Array<{ claimId: string; name: string; hue: Hue }> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  if (ghosts.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" data-ghost-entries="">
      <h2 className="text-label text-ink-3">In without an account</h2>
      <ProblemSummary messages={[problem]} />
      <ul className="flex flex-col">
        {ghosts.map((g) => (
          <li key={g.claimId} className="flex min-h-11 items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <Avatar name={g.name} hue={g.hue} size={28} ghost />
              <span className="truncate text-body text-ink">{g.name}</span>
            </span>
            <Button
              variant="tertiary"
              loading={pending && busy === g.claimId}
              disabled={pending}
              onClick={() => {
                setProblem(null);
                setBusy(g.claimId);
                start(async () => {
                  const r = await removeGhostEntryAction(dareId, g.claimId);
                  if ("error" in r) setProblem(r.error);
                  else router.refresh();
                  setBusy(null);
                });
              }}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
