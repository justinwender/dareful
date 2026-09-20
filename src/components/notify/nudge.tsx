"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { InviteShare } from "@/components/ledger/invite-share";
import { ProblemSummary } from "@/components/ledger/problem";
import { nudgeAction } from "@/lib/actions/markets";

/**
 * "We're waiting on you", one tap, from someone who is in to whoever is not. It is a person acting, which is why
 * it may exist at all (Principle 1), and it says honestly what it reached: a nudge that only landed in the
 * in-app strip is not reported as delivered, and the person's own composer is offered for the rest.
 */
export function Nudge({ dareId, names, relay, url }: { dareId: string; names: string[]; relay: string; url: string }) {
  const [said, setSaid] = useState<string | null>(null);
  const [offerRelay, setOfferRelay] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (names.length === 0) return null;
  const who = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

  function nudge() {
    setProblem(null);
    start(async () => {
      const r = await nudgeAction(dareId);
      if ("error" in r) return setProblem(r.error);
      if (r.waitingOn === 0) return setSaid("Nobody left to wait on.");
      if (r.told === 0) {
        setOfferRelay(true);
        return setSaid("They’ve been told in the last few hours. It’s under Needs you for them.");
      }
      setOfferRelay(r.reached < r.told);
      setSaid(r.reached === r.told ? "Told them." : r.reached === 0 ? "It’s under Needs you for them, but none of their devices take messages from here yet." : "Told the ones whose devices take messages. It’s under Needs you for the rest.");
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface px-4 py-[14px]">
      <p className="text-body-sm text-ink-2">Waiting on {who}.</p>
      <ProblemSummary messages={[problem]} />
      {said ? (
        <p role="status" className="text-body-sm text-ink">
          {said}
        </p>
      ) : (
        <Button variant="secondary" onClick={nudge} loading={pending}>
          {names.length === 1 ? `Nudge ${names[0]}` : "Nudge them"}
        </Button>
      )}
      {offerRelay ? (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <p className="text-body-sm text-ink-2">Or say it yourself, from you, into whatever chat you pick.</p>
          <InviteShare url={url} text={relay} />
        </div>
      ) : null}
    </div>
  );
}
