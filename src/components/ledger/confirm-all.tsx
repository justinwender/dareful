"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUserWallets } from "@dynamic-labs/sdk-react-core";
import { isEthereumWallet } from "@dynamic-labs/ethereum";
import type { TypedDataDomain } from "viem";
import { Button } from "@/components/ui/button";
import { confirmManyAction } from "@/lib/actions/proposals";
import { ledgerTypes } from "@/lib/chain/typed-data";

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
  const wallets = useUserWallets();
  const [state, setState] = useState<"idle" | "signing" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const n = payload.proposalIds.length;

  async function confirmAll() {
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
        account: wallet.address as Hex,
        domain: payload.domain,
        types: ledgerTypes,
        primaryType: "ConfirmMany",
        message: { ...payload.message, qtys: payload.message.qtys.map((q) => BigInt(q)) },
      });
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
      setError(err instanceof Error && /reject|denied|cancel/i.test(err.message) ? "No problem, nothing was sent." : "That didn't go through. Try again.");
      setState("idle");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="text-body-sm text-ink-2">
          {error}
        </p>
      ) : null}
      <Button variant="primary" onClick={confirmAll} loading={state !== "idle"} disabled={state === "done"}>
        {state === "signing" ? "…" : n === 1 ? "Yep, that's right" : `Yep, all ${n} are right`}
      </Button>
    </div>
  );
}
