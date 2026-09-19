"use client";

import { useState, useTransition } from "react";
import { Avatar } from "@/components/ledger/avatar";
import { Chip } from "@/components/ledger/chip";
import { MarkStamp } from "@/components/ledger/mark-stamp";
import { ProblemSummary } from "@/components/ledger/problem";
import { Button } from "@/components/ui/button";
import { joinMarketAction } from "@/lib/actions/join";
import type { Hue } from "@/lib/ui/hue";

export type InvitePreviewData = {
  dareId: string;
  inviter: { name: string; hue: Hue };
  groupLabel: string | null;
  question: string;
  mark: string | null;
  /** "Four friends are in". Words, never who: someone outside never sees who is in. */
  countLine: string | null;
  decidesLine: string | null;
  finished: boolean;
};

/**
 * docs/design.md 3.17: what someone sees before they commit to anything. What it is and who asked, never what it
 * could cost: no stakes, no figures, no leaderboard, no obligations, and no names beyond the inviter.
 */
export function InvitePreview({ data, viewerName }: { data: InvitePreviewData; viewerName: string }) {
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <Avatar name={data.inviter.name} hue={data.inviter.hue} size={32} />
            <span className="truncate text-body-sm text-ink-2">{data.inviter.name} invited you</span>
          </span>
          {data.groupLabel ? <Chip>{data.groupLabel}</Chip> : null}
        </div>
        <h1 className="flex items-start gap-3 text-question text-ink">
          {data.mark ? <MarkStamp kind="emoji" value={data.mark} size={44} /> : null}
          <span>{data.question}</span>
        </h1>
        {data.countLine ? <p className="text-body-sm text-ink-2">{data.countLine}</p> : null}
        <div className="flex flex-col gap-2 border-t border-line pt-3 text-[15px] leading-5 text-ink-2">
          {data.finished ? <p>This one’s finished. Numbers are locked, so you can watch but not enter.</p> : data.decidesLine ? <p>{data.decidesLine}</p> : null}
          <p>Everyone puts in a number. Closest one does best.</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <ProblemSummary messages={[problem]} />
        <Button
          variant="primary"
          loading={pending}
          onClick={() =>
            start(async () => {
              const r = await joinMarketAction(data.dareId);
              if (r && "error" in r) setProblem(r.error);
            })
          }
        >
          {data.finished ? "Join and watch" : `Join as ${viewerName}`}
        </Button>
        <p className="text-center text-caption text-ink-3">Nobody sees anything between you and anyone until you’re in.</p>
      </div>
    </div>
  );
}
