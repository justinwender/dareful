"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TypedDataDomain } from "viem";
import { Button } from "@/components/ui/button";
import { ProblemSummary } from "@/components/ledger/problem";
import { lockMarketAction } from "@/lib/actions/markets";

/** Everything a browser needs to build the typed data a person signs. Bigints travel as strings. */
export type Signing = {
  domain: TypedDataDomain;
  dareOnchainId: `0x${string}`;
  stalemate: 0 | 1;
  ledgerWallet: string;
  governanceWallet: string;
  /** Present only for the creator of a draft: the Create message, every field final. */
  create?: { groupId: `0x${string}`; kind: number; pace: number; termsHash: `0x${string}`; denomId: `0x${string}`; range: string; options: number; resolvesBy: string };
};

export type StakeUnit = { monetary: boolean; quantifiable: boolean; singular: string; plural: string };

/** The creator's lock. After this nobody's number moves, and everyone can see everyone's. */
export function LockButton({ dareId, count, primary = true }: { dareId: string; count: number; primary?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <ProblemSummary messages={[problem]} />
      <Button
        variant={primary ? "primary" : "secondary"}
        loading={pending}
        disabled={count < 2}
        onClick={() =>
          start(async () => {
            setProblem(null);
            const r = await lockMarketAction(dareId);
            if ("error" in r) setProblem(r.error);
            else router.refresh();
          })
        }
      >
        {count < 2 ? "It takes two to lock it in" : `Lock it in with ${count}`}
      </Button>
      {pending ? <p className="text-caption text-ink-3">Locking everyone’s numbers. A few seconds.</p> : null}
    </div>
  );
}
