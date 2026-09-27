"use client";

import { useCallback } from "react";
import { getAuthToken, useWalletDelegation } from "@dynamic-labs/sdk-react-core";
import { walletIdFromToken } from "@/lib/auth/token-wallets";

/**
 * Marks the governance wallet denied for delegation at Dynamic's end (docs/decisions.md 2026-09-27). Dynamic's
 * sign-in prompt would offer every undelegated embedded wallet, the governance wallet included; the console keeps
 * that prompt off for good, and this is the second belt: a wallet marked denied is one that prompt skips even if
 * it were ever turned on. It is a preference Dynamic stores on the wallet, not a rule it enforces, so the refusals
 * in the door, the database and the signer stay the enforcement; nothing here is relied on for the split.
 *
 * The wallet's id is read from the login token Dynamic signed, the same place the server counts wallets from
 * (src/lib/auth/login.ts): the SDK's own lists fill in slowly after a login and cannot be waited on here.
 */
export function useDenyGovernanceDelegation(): (governanceAddress: string) => Promise<"denied" | "no-credential"> {
  const { denyWalletDelegation } = useWalletDelegation();
  return useCallback(
    async (governanceAddress: string) => {
      const id = walletIdFromToken(getAuthToken() ?? null, governanceAddress);
      if (!id) return "no-credential";
      await denyWalletDelegation(id);
      return "denied";
    },
    [denyWalletDelegation],
  );
}
