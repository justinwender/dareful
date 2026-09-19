"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChainEnum, getAuthToken, useDynamicContext, useDynamicWaas, useIsLoggedIn, useRefreshUser } from "@dynamic-labs/sdk-react-core";
import { Button } from "@/components/ui/button";
import { mark } from "@/lib/ui/timing";
import { ProblemSummary } from "@/components/ledger/problem";

type Answer = { user: { id: string }; bound: number } | { need: "wallets"; have: number } | { need: "name"; suggested: string } | { error: string };
type Phase = { at: "idle" } | { at: "working"; line: string } | { at: "name"; suggested: string; ready: boolean } | { at: "done" } | { at: "error"; message: string };

/**
 * After a Dynamic login: get a session, and for a new person, make their two embedded wallets and ask what
 * their friends call them. The user sees an email or phone step, then one question, and nothing else.
 *
 * The server decides whether wallets are needed, from the login token Dynamic signed. This component never
 * counts wallets itself: the SDK's own list fills in slowly after a login, and counting it made two extra
 * wallets on every new device.
 *
 * Making two wallets takes a few seconds and cannot be made faster from here, so it never happens behind a
 * blank screen: the name question is on screen while it runs, and a sign-in with nothing to ask says what it
 * is doing.
 */
export function WalletBootstrap({ settled, sessionDynamicUserId }: { settled: boolean; sessionDynamicUserId: string | null }) {
  const router = useRouter();
  const isLoggedIn = useIsLoggedIn();
  const { sdkHasLoaded, user } = useDynamicContext();
  // Someone settled has nothing to set up, unless the Dynamic login in this browser is a different person from
  // the one the session cookie names. The login is the stronger fact (a code was typed for it), so the session
  // follows it, through the same server check as any other login.
  const sdkUserId = user?.userId ?? null;
  const skip = settled && (sdkUserId === null || sdkUserId === sessionDynamicUserId);
  const { createWalletAccount, dynamicWaasIsEnabled } = useDynamicWaas();
  const refreshUser = useRefreshUser();
  const [phase, setPhase] = useState<Phase>({ at: "idle" });
  const [name, setName] = useState("");
  const started = useRef(false);
  const walletsReady = useRef<Promise<void> | null>(null);
  const nameSent = useRef(false);

  const ask = useCallback(async (displayName?: string): Promise<Answer> => {
    const token = getAuthToken();
    if (!token) return { error: "Your sign-in didn't come through. Try again." };
    const done = mark("session: server round trip");
    const res = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, displayName }) });
    done();
    return (await res.json().catch(() => ({ error: "Could not sign you in." }))) as Answer;
  }, []);

  const finish = useCallback(
    (a: Extract<Answer, { user: unknown }>) => {
      setPhase({ at: "done" });
      // Things a friend logged before this person had an account became theirs at this login. That screen
      // comes before anything else, once; after that it is a strip on the home screen.
      if (a.bound > 0) router.push("/welcome");
      router.refresh();
    },
    [router],
  );

  /** Makes however many wallets the server said were missing, one at a time, then refreshes the token. */
  const makeWallets = useCallback(
    async (have: number) => {
      if (!dynamicWaasIsEnabled) throw new Error("Sign-in isn't fully set up here yet. Try again in a minute.");
      for (let i = have; i < 2; i += 1) {
        const done = mark(`session: create wallet ${i + 1} of 2`);
        await createWalletAccount([ChainEnum.Evm], undefined, undefined, { skipCloseAuthFlow: true });
        done();
      }
      const done = mark("session: refresh login after wallets");
      await refreshUser();
      done();
    },
    [createWalletAccount, dynamicWaasIsEnabled, refreshUser],
  );

  useEffect(() => {
    if (skip || !sdkHasLoaded || !isLoggedIn || started.current) return;
    started.current = true;
    const run = async () => {
      setPhase({ at: "working", line: "Signing you in…" });
      let a = await ask();
      if ("need" in a && a.need === "wallets") {
        // A new person. Ask their name now and make the wallets behind the question.
        const have = a.have;
        setPhase({ at: "name", suggested: "", ready: false });
        walletsReady.current = makeWallets(have);
        await walletsReady.current;
        if (nameSent.current) return; // they answered before the wallets were ready; submitName finishes it
        a = await ask();
      }
      if ("need" in a && a.need === "name") {
        setName((n) => n || ("suggested" in a ? a.suggested : ""));
        setPhase({ at: "name", suggested: a.suggested, ready: true });
        return;
      }
      if ("need" in a) throw new Error("Setting up your account didn't finish. Try signing in again.");
      if ("error" in a) throw new Error(a.error);
      finish(a);
    };
    run().catch((err: unknown) => setPhase({ at: "error", message: err instanceof Error ? err.message : "Could not finish setting up your account." }));
  }, [skip, sdkHasLoaded, isLoggedIn, ask, makeWallets, finish]);

  async function submitName() {
    const displayName = name.trim();
    if (!displayName) return;
    nameSent.current = true;
    setPhase({ at: "working", line: "Almost there…" });
    try {
      await walletsReady.current;
      const a = await ask(displayName);
      if ("user" in a) return finish(a);
      throw new Error("error" in a ? a.error : "Setting up your account didn't finish. Try signing in again.");
    } catch (err) {
      setPhase({ at: "error", message: err instanceof Error ? err.message : "Could not finish setting up your account." });
    }
  }

  // Signing out re-arms the flow for the next sign-in.
  useEffect(() => {
    if (!isLoggedIn) started.current = false;
  }, [isLoggedIn]);

  if (skip || !isLoggedIn || phase.at === "idle" || phase.at === "done") return null;

  return (
    <div role="dialog" aria-modal="true" aria-live="polite" className="fixed inset-0 z-50 flex flex-col justify-center bg-ground px-5">
      <div className="mx-auto flex w-full max-w-[420px] flex-col gap-6">
        {phase.at === "working" ? (
          <p className="text-question text-ink">{phase.line}</p>
        ) : phase.at === "error" ? (
          <>
            <p className="text-question text-ink">That didn’t work.</p>
            <ProblemSummary messages={[phase.message]} />
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Try again
            </Button>
          </>
        ) : (
          <form
            className="flex flex-col gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              void submitName();
            }}
          >
            <label htmlFor="display-name" className="text-question text-ink">
              What do your friends call you?
            </label>
            <input
              id="display-name"
              autoFocus
              autoComplete="given-name"
              enterKeyHint="done"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="First name"
              className="h-14 rounded-button border border-line bg-surface px-4 text-[17px] text-ink placeholder:text-ink-3 focus:border-line-strong focus:outline-none"
            />
            <p className="text-body-sm text-ink-2">It goes on anything you send a friend. A first name is plenty.</p>
            <Button type="submit" variant="primary" disabled={!name.trim()}>
              That’s me
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
