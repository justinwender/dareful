"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChainEnum,
  getAuthToken,
  useDynamicContext,
  useDynamicWaas,
  useIsLoggedIn,
  useRefreshUser,
  useUserWallets,
} from "@dynamic-labs/sdk-react-core";

type Phase = "idle" | "creating" | "syncing" | "done" | "error";

/**
 * After a Dynamic login, make sure the user has two embedded wallets on Monad (the first is created by
 * Dynamic at signup; the second, the governance wallet, is created here) and bind the login to a Dareful
 * user through the session route. Runs silently; the user sees an email or phone step and nothing else.
 */
export function WalletBootstrap() {
  const router = useRouter();
  const isLoggedIn = useIsLoggedIn();
  const { sdkHasLoaded, primaryWallet } = useDynamicContext();
  const wallets = useUserWallets();
  const { createWalletAccount, dynamicWaasIsEnabled } = useDynamicWaas();
  const refreshUser = useRefreshUser();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!sdkHasLoaded || !isLoggedIn || busy.current || phase === "done") return;
    const embedded = wallets.filter((w) => w.chain === "EVM" && w.connector.isEmbeddedWallet);
    const addresses = Array.from(new Set(embedded.map((w) => w.address.toLowerCase())));

    busy.current = true;
    const run = async () => {
      if (addresses.length < 2) {
        if (!dynamicWaasIsEnabled) throw new Error("Embedded wallets are not enabled for this environment.");
        setPhase("creating");
        await createWalletAccount([ChainEnum.Evm], undefined, undefined, { skipCloseAuthFlow: true });
        await refreshUser();
        setPhase("idle"); // the wallets list updates and this effect runs again
        return;
      }
      const primary = primaryWallet?.address.toLowerCase();
      const first = addresses.find((a) => a === primary) ?? addresses[0];
      const other = addresses.find((a) => a !== first);
      const token = getAuthToken();
      if (!first || !other || !token) return;
      setPhase("syncing");
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, primary: first, other }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not sign you in.");
      }
      // Things a friend logged before this person had an account became theirs at this login. That screen
      // comes before anything else, once; after that it is a strip on the home screen.
      const body = (await res.json().catch(() => ({}))) as { bound?: number };
      setPhase("done");
      if (typeof body.bound === "number" && body.bound > 0) router.push("/welcome");
      router.refresh();
    };
    run()
      .catch((err: unknown) => {
        setPhase("error");
        setMessage(err instanceof Error ? err.message : "Could not finish setting up your account.");
      })
      .finally(() => {
        busy.current = false;
      });
  }, [sdkHasLoaded, isLoggedIn, wallets, primaryWallet, phase, dynamicWaasIsEnabled, createWalletAccount, refreshUser, router]);

  // Signing out resets the flow; derived rather than set in an effect.
  const visiblePhase: Phase = isLoggedIn ? phase : "idle";

  if (visiblePhase === "error" && message) {
    return (
      <div role="alert" className="mx-5 mt-4 rounded-card border border-line bg-surface px-4 py-3 text-body-sm text-ink-2">
        {message}
      </div>
    );
  }
  return null;
}
