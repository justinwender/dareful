"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useDynamicContext, useUserWallets } from "@dynamic-labs/sdk-react-core";
import { Button } from "@/components/ui/button";
import { AlertGlyph } from "@/components/ledger/problem";
import { deviceState, type DeviceState, type Me } from "@/lib/auth/device";

/**
 * Two logins have to be true before someone can approve anything: the Dareful session (a cookie, thirty days,
 * and it is there on every surface they ever signed in on) and the Dynamic login (browser storage, per runtime,
 * and the only thing that puts their two keys in reach). The first without the second is the ordinary state of
 * a phone someone taps a link on, and until 2B nothing looked for it: the person read as signed in, the key
 * list was empty, and the app said their account was "still setting up", forever (docs/decisions.md 2026-09-19).
 *
 * This is the one place that reads the SDK's in-browser state to decide what a person can do. Everything else
 * asks here. The state is worked out when a screen loads, so nobody finds out in the middle of a vote.
 */
const MeContext = createContext<Me | null>(null);

export function MeProvider({ me, children }: { me: Me | null; children: ReactNode }) {
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}

/** How long a confirmed login gets to produce its keys before the app says they are not coming. */
const KEYS_GRACE_MS = 8_000;

export function useDevice(): { state: DeviceState; me: Me | null; signIn: () => Promise<void> } {
  const me = useContext(MeContext);
  const { sdkHasLoaded, user, setShowAuthFlow, handleLogOut } = useDynamicContext();
  const wallets = useUserWallets();
  const [graceOver, setGraceOver] = useState(false);
  const sdkUserId = user?.userId ?? null;

  useEffect(() => {
    if (!sdkUserId) return;
    const t = setTimeout(() => setGraceOver(true), KEYS_GRACE_MS);
    return () => {
      clearTimeout(t);
      setGraceOver(false);
    };
  }, [sdkUserId]);

  const addresses = useMemo(() => wallets.map((w) => w.address), [wallets]);
  const state = deviceState({ me, sdkHasLoaded, sdkUserId, addresses, graceOver });
  // With the wrong or a broken Dynamic login still in place the sign-in sheet has nothing to offer, so that
  // login goes first. The Dareful session is untouched: they stay where they are.
  const signIn = async () => {
    if (state === "keys-missing") await handleLogOut().catch(() => undefined);
    setShowAuthFlow(true);
  };
  return { state, me, signIn };
}

/**
 * Says so at the top of every screen, from the moment it loads, with the one thing to do about it. Reports
 * what it saw to the server once per load, because which of these states real phones land in is exactly what
 * nobody could see from the database.
 */
export function DeviceNotice() {
  const { state, me, signIn } = useDevice();
  const reported = useRef<DeviceState | null>(null);

  useEffect(() => {
    if (!me || state === "checking" || state === "ready" || reported.current === state) return;
    reported.current = state;
    const standalone = typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches;
    void fetch("/api/device-state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ state, standalone }) }).catch(() => undefined);
  }, [me, state]);

  if (!me || state === "checking" || state === "ready" || state === "other-account") return null;
  return (
    <div role="status" className="mx-auto w-full max-w-[430px] px-5 pt-3">
      <div className="flex flex-col gap-3 rounded-button border border-line-strong bg-surface-2 px-[14px] py-3">
        <p className="flex gap-2 text-body-sm text-ink">
          <AlertGlyph />
          <span>
            {state === "signed-out"
              ? "This device hasn’t checked it’s you yet. A quick code lets you vote, enter and say yep from here."
              : "Something’s wrong with your sign-in on this device, and waiting won’t fix it. Signing in again usually does."}
          </span>
        </p>
        <Button variant="secondary" size="inline" onClick={() => void signIn()}>
          {state === "signed-out" ? "Get a code" : "Sign in again"}
        </Button>
      </div>
    </div>
  );
}
