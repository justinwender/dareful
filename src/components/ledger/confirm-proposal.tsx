"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUserWallets } from "@dynamic-labs/sdk-react-core";
import { isEthereumWallet } from "@dynamic-labs/ethereum";
import type { TypedDataDomain } from "viem";
import { Button } from "@/components/ui/button";
import { ledgerTypes } from "@/lib/chain/typed-data";
import { confirmProposalAction, declineProposalAction } from "@/lib/actions/proposals";

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
export function ConfirmProposal({ payload }: { payload: ConfirmPayload }) {
  const router = useRouter();
  const wallets = useUserWallets();
  const [state, setState] = useState<"idle" | "signing" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    const wallet = wallets.find((w) => w.address.toLowerCase() === payload.ledgerWallet.toLowerCase());
    if (!wallet || !isEthereumWallet(wallet)) {
      setError("Your account is still setting up. Give it a second and try again.");
      return;
    }
    try {
      setState("signing");
      const client = await wallet.getWalletClient();
      const signature = await client.signTypedData({
        account: wallet.address as `0x${string}`,
        domain: payload.domain,
        types: ledgerTypes,
        primaryType: "Confirm",
        message: { ...payload.message, qty: BigInt(payload.message.qty) },
      });
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
      setError(err instanceof Error && /reject|denied|cancel/i.test(err.message) ? "No problem, nothing was sent." : "That didn't go through. Try again.");
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
      {error ? (
        <p role="alert" className="text-body-sm text-ink-2">
          {error}
        </p>
      ) : null}
      <Button variant="primary" onClick={confirm} loading={state !== "idle"} disabled={state === "done"}>
        {state === "signing" ? "…" : "Yep, that's right"}
      </Button>
      <Button variant="tertiary" onClick={decline} disabled={state !== "idle"}>
        Not this one
      </Button>
    </div>
  );
}
