"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ProblemSummary } from "@/components/ledger/problem";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { removeMarketAction } from "@/lib/actions/markets";
import { attempt } from "@/lib/ui/attempt";

/**
 * Withdrawing a question nobody else got into (the first-contact round, 2026-10-04), from its own screen: the same
 * act as the Remove swipe on Now (3.15), asked once, since the link stops working for everyone it reached.
 */
export function WithdrawMarket({ dareId }: { dareId: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const id = useId();
  return (
    <>
      <Button variant="tertiary" className="self-start" onClick={() => setAsking(true)} data-withdraw-market="">
        Withdraw it
      </Button>
      <Sheet open={asking} onClose={() => (sending ? undefined : setAsking(false))} labelledBy={`${id}-title`}>
        <h2 id={`${id}-title`} className="text-body-strong text-ink">
          Withdraw it?
        </h2>
        <p className="text-body-sm text-ink-2">Nobody else is in. It’s called off for anyone the link reached.</p>
        <ProblemSummary messages={[problem]} />
        <div className="flex flex-col gap-1">
          <Button
            variant="primary"
            data-autofocus
            loading={sending}
            onClick={async () => {
              setProblem(null);
              setSending(true);
              const r = await attempt(() => removeMarketAction(dareId));
              if ("error" in r) {
                setProblem(r.error);
                setSending(false);
                return;
              }
              router.replace("/");
            }}
          >
            Withdraw it
          </Button>
          <Button variant="tertiary" disabled={sending} onClick={() => setAsking(false)}>
            Keep it
          </Button>
        </div>
      </Sheet>
    </>
  );
}
