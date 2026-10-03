"use client";

import { attempt } from "@/lib/ui/attempt";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ProblemSummary } from "@/components/ledger/problem";
import { backfillSnapshotsAction, takeSnapshotAction } from "@/lib/actions/stats";

/** The two buttons on the numbers page (the field round, 3.1): today's snapshot, and every day since the first event that has none. */
export function StatsActions() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<"today" | "backfill" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const run = (kind: "today" | "backfill") =>
    start(async () => {
      setWhich(kind);
      setProblem(null);
      setSaid(null);
      const r = kind === "today" ? await attempt(() => takeSnapshotAction()) : await attempt(() => backfillSnapshotsAction());
      setWhich(null);
      if ("error" in r) return setProblem(r.error);
      setSaid(kind === "today" ? "Today's numbers are written." : `${"days" in r ? r.days : 0} days written.`);
      router.refresh();
    });
  return (
    <div className="flex flex-col gap-3" data-stats-actions="">
      <ProblemSummary messages={[problem]} />
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" size="inline" loading={pending && which === "today"} disabled={pending} onClick={() => run("today")} data-snapshot-today="">
          Snapshot today
        </Button>
        <Button variant="secondary" size="inline" loading={pending && which === "backfill"} disabled={pending} onClick={() => run("backfill")} data-snapshot-backfill="">
          Backfill the days
        </Button>
      </div>
      {said ? <p className="text-caption text-ink-3">{said}</p> : null}
    </div>
  );
}
