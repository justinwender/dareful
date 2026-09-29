"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { NOTHING_CAME_BACK, ProblemSummary } from "@/components/ledger/problem";
import { useWaitStage } from "@/components/ui/button";
import { TopRunner } from "@/components/ui/refresh";
import { MOTION } from "@/lib/ui/motion";
import { nowCookie, type NowState } from "@/lib/ui/now-shell";

const ARRIVING = "data-arriving";

/**
 * Now's shell while its content is on its way (docs/design.md 9.4, 11.5). Nothing stands in for the content: no
 * bars, no hatching, no spinner, and the ground shows where it will be. If it is slow, the one set of stages
 * (5.2): the 2px runner under the status band at 300ms, "Still going." at three seconds, and at ten the block
 * with "Try again". It also marks the document as one whose content is arriving, so the content fades in over
 * base when it lands rather than appearing, which a root drawn from what the router holds never does (9.6).
 */
export function NowWaiting() {
  const router = useRouter();
  const stage = useWaitStage(true);
  useEffect(() => {
    document.documentElement.setAttribute(ARRIVING, "");
  }, []);
  return (
    <div data-now-waiting={stage} className="flex flex-col gap-7 py-4">
      {stage !== "none" ? <TopRunner state="running" /> : null}
      {stage === "still" ? <p className="text-caption text-ink-3">Still going.</p> : null}
      {stage === "block" ? <ProblemSummary messages={[NOTHING_CAME_BACK]} retry={() => router.refresh()} /> : null}
    </div>
  );
}

/**
 * Now's content has arrived: the phone remembers whether it was empty, for the next cold start's shell, and once
 * the fade is over the document stops being one whose content is arriving.
 */
export function NowKnown({ state }: { state: NowState }) {
  useEffect(() => {
    document.cookie = nowCookie(state);
    const t = setTimeout(() => document.documentElement.removeAttribute(ARRIVING), MOTION.base);
    return () => clearTimeout(t);
  }, [state]);
  return null;
}
