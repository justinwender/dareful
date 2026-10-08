"use client";

import { createContext, use, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useDynamicContext, useUserWallets } from "@dynamic-labs/sdk-react-core";
import { Button } from "@/components/ui/button";
import { deviceState, type DeviceState, type Me } from "@/lib/auth/device";
import type { SessionFacts } from "@/lib/auth/session-facts";

/**
 * Two logins have to be true before someone can approve anything: the Dareful session (a cookie, thirty days,
 * and it is there on every surface they ever signed in on) and the Dynamic login (browser storage, per runtime,
 * and the only thing that puts their two keys in reach). The first without the second is the ordinary state of
 * a phone someone taps a link on, and until 2B nothing looked for it: the person read as signed in, the key
 * list was empty, and the app said their account was "still setting up", forever (docs/decisions.md 2026-09-19).
 *
 * This is the one place that reads the SDK's in-browser state to decide what a person can do. Everything else
 * asks here. The state is worked out when a screen loads, so nobody finds out in the middle of a vote.
 *
 * The session's facts arrive as a promise (docs/design.md 11.5): the root layout starts the read and sends the
 * first screen's shell without waiting for it, and whatever asks here waits for the answer where it stands. On
 * every screen but Now that is the screen itself, as before; on Now it is the content behind the shell.
 */
const NO_SESSION: SessionFacts = { settled: false, me: null, tipsSeen: [] };
const FactsContext = createContext<Promise<SessionFacts> | null>(null);

export function MeProvider({ facts, children }: { facts: Promise<SessionFacts>; children: ReactNode }) {
  return <FactsContext.Provider value={facts}>{children}</FactsContext.Provider>;
}

/** The session's facts, waited for here. Outside the provider (a misconfigured deployment) there is no session. */
export function useSessionFacts(): SessionFacts {
  const facts = useContext(FactsContext);
  return facts ? use(facts) : NO_SESSION;
}

/** How long a confirmed login gets to produce its keys before the app says they are not coming. */
const KEYS_GRACE_MS = 8_000;

export function useDevice(): { state: DeviceState; me: Me | null; signIn: () => Promise<void>; /** Whether Dynamic's sign-in step is on screen now. */ authOpen: boolean } {
  const { me } = useSessionFacts();
  const { sdkHasLoaded, user, setShowAuthFlow, showAuthFlow, handleLogOut } = useDynamicContext();
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
  return { state, me, signIn, authOpen: Boolean(showAuthFlow) };
}

/**
 * Says so at the top of every screen, from the moment it loads, in one line with the one thing to do about it. Reports
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
  // One quiet line at the top (the games-and-the-reveal round: it was a card 154 points tall on a game's question,
  // which pushed the share row under the sheet), drawn as the guest line is (3.46): the words on the left, the one
  // thing to do about it on the right, a 1px line under it. One line at every width an iPhone has.
  return (
    <div role="status" className="mx-auto flex min-h-11 w-full max-w-[430px] items-center justify-between gap-3 border-b border-line pr-2 pl-5" data-device-notice={state}>
      <p className="min-w-0 truncate text-body-sm text-ink-2">{state === "signed-out" ? "This device hasn’t checked it’s you." : "Your sign-in here isn’t working."}</p>
      <Button variant="tertiary" size="tertiary" className="shrink-0 text-ink" onClick={() => void signIn()}>
        {state === "signed-out" ? "Get a code" : "Sign in again"}
      </Button>
    </div>
  );
}
