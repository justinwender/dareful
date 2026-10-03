"use client";

import { attempt } from "@/lib/ui/attempt";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertGlyph } from "@/components/ledger/problem";
import { Button } from "@/components/ui/button";
import { refreshWhatsOnAction } from "@/lib/actions/games";

/**
 * The feed failing (docs/design.md 3.32, C and D): the 5.1 form-level block at the top of the list, "Couldn't get
 * the latest games." over "These were right as of 2:10pm." and a 44px "Try again", which re-reads the schedule;
 * with nothing saved, the block alone, reading "Couldn't load what's on."
 */
export function FeedFailed({ lastOk, nothingSaved }: { lastOk: string | null; nothingSaved: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div role="alert" data-feed-failed="" className="flex flex-col gap-2 rounded-button border border-line-strong bg-surface-2 px-[14px] py-3">
      <p className="flex gap-2 text-body-sm text-ink">
        <AlertGlyph />
        <span className="flex flex-col">
          <span>{nothingSaved ? "Couldn’t load what’s on." : "Couldn’t get the latest games."}</span>
          {!nothingSaved && lastOk ? <span className="text-ink-2">These were right as of {lastOk}.</span> : null}
          {problem ? <span className="text-ink-2">{problem}</span> : null}
        </span>
      </p>
      <Button
        variant="tertiary"
        className="self-start"
        loading={busy}
        onClick={() =>
          start(async () => {
            setProblem(null);
            const r = await attempt(() => refreshWhatsOnAction());
            if ("error" in r) return setProblem(r.error);
            router.refresh();
          })
        }
      >
        Try again
      </Button>
    </div>
  );
}
