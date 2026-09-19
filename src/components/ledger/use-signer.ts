"use client";

import { useCallback } from "react";
import { useUserWallets } from "@dynamic-labs/sdk-react-core";
import { isEthereumWallet } from "@dynamic-labs/ethereum";
import type { Hex, TypedDataDomain } from "viem";
import { mark } from "@/lib/ui/timing";

export class SignerError extends Error {}

/** A refusal in the person's own words: what happened, and that nothing was sent. */
export function signingProblem(err: unknown): string {
  if (err instanceof SignerError) return err.message;
  return err instanceof Error && /reject|denied|cancel/i.test(err.message) ? "No problem, nothing was sent." : "That didn't go through. Try again.";
}

/**
 * Signs typed data with one of the person's two embedded wallets, chosen by its recorded address: the ledger
 * wallet for anything that binds only them (a position, a confirm), the governance wallet for a vote. The
 * server holds neither key in this phase, so every one of these is a prompt.
 */
export function useSigner() {
  const wallets = useUserWallets();
  return useCallback(
    async (address: string, typed: { domain: TypedDataDomain; types: Record<string, ReadonlyArray<{ name: string; type: string }>>; primaryType: string; message: Record<string, unknown> }, label: string): Promise<Hex> => {
      const wallet = wallets.find((w) => w.address.toLowerCase() === address.toLowerCase());
      if (!wallet || !isEthereumWallet(wallet)) throw new SignerError("Your account is still setting up. Give it a second and try again.");
      const done = mark(`sign: ${label}`);
      try {
        const client = await wallet.getWalletClient();
        return await client.signTypedData({ account: wallet.address as Hex, ...typed } as Parameters<typeof client.signTypedData>[0]);
      } finally {
        done();
      }
    },
    [wallets],
  );
}
