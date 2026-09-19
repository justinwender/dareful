"use client";

import { useCallback, useEffect, useRef } from "react";
import { useUserWallets } from "@dynamic-labs/sdk-react-core";
import { isEthereumWallet } from "@dynamic-labs/ethereum";
import type { Hex, TypedDataDomain } from "viem";
import { useDevice } from "@/components/auth/device";
import type { DeviceState } from "@/lib/auth/device";
import { mark } from "@/lib/ui/timing";

export class SignerError extends Error {}

/** A refusal in the person's own words: what happened, and that nothing was sent. */
export function signingProblem(err: unknown): string {
  if (err instanceof SignerError) return err.message;
  return err instanceof Error && /reject|denied|cancel/i.test(err.message) ? "No problem, nothing was sent." : "That didn't go through. Try again.";
}

type Typed = { domain: TypedDataDomain; types: Record<string, ReadonlyArray<{ name: string; type: string }>>; primaryType: string; message: Record<string, unknown> };

/** How long someone gets to type a code before the tap that asked for it gives up. */
const SIGN_IN_WAIT_MS = 180_000;

/**
 * Signs typed data with one of the person's two embedded keys, chosen by its recorded address: the ledger one
 * for anything that binds only them (a position, a yep), the governance one for a vote. The server holds
 * neither in this phase, so every one of these is a prompt.
 *
 * Every signature in the app goes through here, and what this device can do is decided in one place
 * (`useDevice`). A device that has not checked who it is holding is normal, not broken: the tap opens the
 * code step and carries on when it is done. Only a confirmed login whose keys never arrive is a failure, and it
 * is reported as one, never as something to wait for (Principle 9; docs/decisions.md 2026-09-19).
 */
export function useSigner() {
  const wallets = useUserWallets();
  const { state, signIn } = useDevice();
  const live = useRef<{ wallets: typeof wallets; state: DeviceState }>({ wallets, state });
  useEffect(() => {
    live.current = { wallets, state };
  }, [wallets, state]);

  return useCallback(
    async (address: string, typed: Typed, label: string): Promise<Hex> => {
      const find = () => live.current.wallets.find((w) => w.address.toLowerCase() === address.toLowerCase());
      if (live.current.state === "signed-out" || live.current.state === "other-account") await signIn();
      const deadline = Date.now() + SIGN_IN_WAIT_MS;
      while (!find() && live.current.state !== "keys-missing" && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250));
      const wallet = find();
      if (!wallet || !isEthereumWallet(wallet)) {
        throw new SignerError(
          live.current.state === "keys-missing"
            ? "Something's wrong with your sign-in on this device, and waiting won't fix it. Sign in again from the top of the screen. Nothing was sent."
            : "This device still needs a code to check it's you. Nothing was sent.",
        );
      }
      const done = mark(`sign: ${label}`);
      try {
        const client = await wallet.getWalletClient();
        return await client.signTypedData({ account: wallet.address as Hex, ...typed } as Parameters<typeof client.signTypedData>[0]);
      } finally {
        done();
      }
    },
    [signIn],
  );
}
