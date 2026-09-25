"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signingProblem, useSigner } from "@/components/ledger/use-signer";
import type { TypedDataDomain } from "viem";
import { Button } from "@/components/ui/button";
import { PinnedSheet } from "@/components/ui/pinned-sheet";
import { confirmManyAction } from "@/lib/actions/proposals";
import { ledgerTypes } from "@/lib/chain/typed-data";
import { ProblemSummary } from "@/components/ledger/problem";

type Hex = `0x${string}`;

export type ConfirmAllPayload = {
  /** In the order they are signed in. The server rebuilds the same batch from these ids and checks it. */
  proposalIds: string[];
  ledgerWallet: string;
  domain: TypedDataDomain;
  message: { groupIds: Hex[]; denomIds: Hex[]; creditors: Hex[]; qtys: string[]; obligationIds: Hex[]; uniques: boolean[] };
};

/**
 * Confirm-all: one prompt for everything listed. The claim moment is the one time a person confirms many
 * things at once, so it is a single approval over the whole batch, and the whole batch lands or none of it
 * does. A failure keeps the screen and says so.
 */
export function ConfirmAll({ payload }: { payload: ConfirmAllPayload }) {
  const router = useRouter();
  const sign = useSigner();
  const [state, setState] = useState<"idle" | "signing" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const n = payload.proposalIds.length;

  async function confirmAll() {
    setError(null);
    try {
      setState("signing");
      const signature = await sign(payload.ledgerWallet, { domain: payload.domain, types: ledgerTypes, primaryType: "ConfirmMany", message: { ...payload.message, qtys: payload.message.qtys.map((q) => BigInt(q)) } }, "confirmmany");
      setState("sending");
      const result = await confirmManyAction(payload.proposalIds, signature);
      if ("error" in result) {
        setError(result.error);
        setState("idle");
        return;
      }
      setState("done");
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(signingProblem(err));
      setState("idle");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <ProblemSummary messages={[error]} />
      ) : null}
      <PinnedSheet
        label="Confirm"
        low={
          <Button variant="primary" onClick={confirmAll} loading={state !== "idle"} disabled={state === "done"}>
            {n === 1 ? "Yep, that’s right" : `Yep, all ${n} are right`}
          </Button>
        }
      />
    </div>
  );
}
