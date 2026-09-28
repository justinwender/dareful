"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signingProblem, useSigner } from "@/components/ledger/use-signer";
import type { TypedDataDomain } from "viem";
import { Button } from "@/components/ui/button";
import { ledgerTypes } from "@/lib/chain/typed-data";
import { confirmProposalAction, declineProposalAction } from "@/lib/actions/proposals";
import { ProblemSummary } from "@/components/ledger/problem";
import { StateMark } from "@/components/ledger/state-mark";

export type ConfirmPayload = {
  proposalId: string;
  ledgerWallet: string;
  domain: TypedDataDomain;
  message: { groupId: `0x${string}`; denomId: `0x${string}`; creditor: `0x${string}`; qty: string; obligationId: `0x${string}`; unique: boolean };
  redirectTo: string;
};

/**
 * The debtor's one tap. Signs the Confirm typed data with their ledger wallet (a prompt until delegation
 * arrives in Phase 3), hands the signature to the server, and the relayer does the rest. A failure keeps
 * the screen and says so; the tap is never silently dropped.
 */
export function ConfirmProposal({ payload, again }: { payload: ConfirmPayload; /** The last try was told it was on its way and never landed (src/lib/ledger/again.ts): said here, beside the button. */ again?: string | null }) {
  const router = useRouter();
  const sign = useSigner();
  const [state, setState] = useState<"idle" | "signing" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    try {
      setState("signing");
      const signature = await sign(payload.ledgerWallet, { domain: payload.domain, types: ledgerTypes, primaryType: "Confirm", message: { ...payload.message, qty: BigInt(payload.message.qty) } }, "confirm", { action: "confirm", proposalId: payload.proposalId });
      setState("sending");
      const result = await confirmProposalAction(payload.proposalId, signature);
      if ("error" in result) {
        setError(result.error);
        setState("idle");
        return;
      }
      setState("done");
      router.push(payload.redirectTo);
      router.refresh();
    } catch (err) {
      setError(signingProblem(err));
      setState("idle");
    }
  }

  async function decline() {
    setError(null);
    const result = await declineProposalAction(payload.proposalId);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    router.push(payload.redirectTo);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {again ? (
        <p className="flex items-center gap-2 text-caption text-ink-3" data-confirm-again="">
          <StateMark state="failed" />
          <span>{again}</span>
        </p>
      ) : null}
      {error ? (
        <ProblemSummary messages={[error]} />
      ) : null}
      <Button variant="primary" onClick={confirm} loading={state !== "idle"} disabled={state === "done"}>
        Yep, that’s right
      </Button>
      <Button variant="tertiary" onClick={decline} disabled={state !== "idle"}>
        Not this one
      </Button>
    </div>
  );
}
