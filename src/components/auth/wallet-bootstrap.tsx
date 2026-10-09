"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChainEnum, getAuthToken, useDynamicContext, useDynamicWaas, useIsLoggedIn, useRefreshUser } from "@dynamic-labs/sdk-react-core";
import { Button } from "@/components/ui/button";
import { TallyLoader } from "@/components/ui/tally-loader";
import { mark } from "@/lib/ui/timing";
import { FIELD_PROBLEM_CLASS, Problem, ProblemSummary } from "@/components/ledger/problem";
import { useDenyGovernanceDelegation } from "@/components/auth/governance-denied";
import { isIdentifier } from "@/lib/auth/login";
import { readJoinHandoff, readStay } from "@/lib/ui/join-handoff";

type Answer = { user: { id: string; governanceWallet: string }; bound: number; created?: boolean } | { need: "wallets"; have: number } | { need: "name"; suggested: string; /** What was typed is an identifier, not a name: the step stays up with the refusal at the field. */ refused?: true } | { error: string };
type Phase = { at: "idle" } | { at: "working"; line: string } | { at: "name"; suggested: string; ready: boolean } | { at: "done" } | { at: "error"; message: string };

/** A sentence written for the person. Anything else that fails here (the SDK, the network) is logged and said in one plain line, never quoted (5.4). */
class Said extends Error {}
const GENERIC = "Could not finish setting up your account. Try again.";
/** The field's one refusal, the same sentence the link page's "Your name" gives (5.1): an address, a tag, a number or a handle is not what friends call anyone. */
const NOT_A_NAME = "Say what your friends call you.";
const sayOf = (err: unknown): string => {
  if (err instanceof Said) return err.message;
  console.error("sign-in failed", err instanceof Error ? err.message : err);
  return GENERIC;
};

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
  const denyGovernance = useDenyGovernanceDelegation();
  const [phase, setPhase] = useState<Phase>({ at: "idle" });
  const [name, setName] = useState("");
  const [nameProblem, setNameProblem] = useState<string | null>(null);
  const started = useRef(false);
  const walletsReady = useRef<Promise<void> | null>(null);
  const nameSent = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  const ask = useCallback(async (displayName?: string): Promise<Answer> => {
    const token = getAuthToken();
    if (!token) return { error: "Your sign-in didn't come through. Try again." };
    const done = mark("session: server round trip");
    const res = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, displayName }) });
    done();
    return (await res.json().catch(() => ({ error: "Could not sign you in." }))) as Answer;
  }, []);

  const finish = useCallback(
    async (a: Extract<Answer, { user: unknown }>) => {
      // A new account's governance wallet is marked denied for delegation at Dynamic's end, here and once
      // (docs/decisions.md 2026-09-27): the second belt behind the console's sign-in prompt staying off. It can
      // fail without costing the person their account; the refusals in the door and the signer do not rest on it.
      if (a.created) {
        const r = await denyGovernance(a.user.governanceWallet).catch((err: unknown) => (console.warn("the governance wallet could not be marked denied", err instanceof Error ? err.message : err), "failed" as const));
        if (r !== "denied") console.warn("the governance wallet was not marked denied", r);
      }
      setPhase({ at: "done" });
      // Things a friend logged before this person had an account became theirs at this login. That screen
      // comes before anything else, once; after that it is a strip on the home screen. A sign-in from a link's
      // join flow stays on its question instead (3.17 as amended 2026-10-04), where the entry is sent or kept.
      if (a.bound > 0 && !readJoinHandoff(Date.now()) && !readStay(Date.now())) router.push("/welcome");
      router.refresh();
    },
    [router, denyGovernance],
  );

  /** Makes however many wallets the server said were missing, one at a time, then refreshes the token. */
  const makeWallets = useCallback(
    async (have: number) => {
      if (!dynamicWaasIsEnabled) throw new Said("Sign-in isn’t fully set up here yet. Try again in a minute.");
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
        // A new person. Ask their name now and make the wallets behind the question; someone who typed it at a link's "Who's joining?" is not asked again.
        const have = a.have;
        const known = readJoinHandoff(Date.now())?.name;
        if (known && !isIdentifier(known)) setPhase({ at: "working", line: "Signing you in…" });
        else setPhase({ at: "name", suggested: "", ready: false });
        walletsReady.current = makeWallets(have);
        await walletsReady.current;
        if (nameSent.current) return; // they answered before the wallets were ready; submitName finishes it
        a = await ask();
      }
      // Someone who said their name at a link's "Who's joining?" moments ago is not asked it again (3.17 as amended 2026-10-04).
      const typed = readJoinHandoff(Date.now())?.name;
      if ("need" in a && a.need === "name" && typed && !isIdentifier(typed) && !nameSent.current) {
        nameSent.current = true;
        a = await ask(typed);
        nameSent.current = false;
      }
      if ("need" in a && a.need === "name") {
        setName((n) => n || typed || ("suggested" in a ? a.suggested : ""));
        setPhase({ at: "name", suggested: a.suggested, ready: true });
        return;
      }
      if ("need" in a) throw new Said("Setting up your account didn’t finish. Try signing in again.");
      if ("error" in a) throw new Said(a.error);
      await finish(a);
    };
    run().catch((err: unknown) => setPhase({ at: "error", message: sayOf(err) }));
  }, [skip, sdkHasLoaded, isLoggedIn, ask, makeWallets, finish]);

  async function submitName() {
    const displayName = name.trim();
    if (!displayName) return;
    // An address, a tag, a number or a handle is refused here before anything is sent, and by the server with
    // the same rule: the step stays up, what was typed stays, the refusal sits at the field and focus goes back
    // to it (5.1). The server's refusal remounts the form, so its autoFocus does the same there.
    if (isIdentifier(displayName)) {
      setNameProblem(NOT_A_NAME);
      input.current?.focus();
      return;
    }
    nameSent.current = true;
    setNameProblem(null);
    setPhase({ at: "working", line: "Almost there…" });
    try {
      await walletsReady.current;
      const a = await ask(displayName);
      if ("user" in a) return finish(a);
      if ("need" in a && a.need === "name" && a.refused) {
        nameSent.current = false;
        setNameProblem(NOT_A_NAME);
        setPhase({ at: "name", suggested: a.suggested, ready: true });
        return;
      }
      throw new Said("error" in a ? a.error : "Setting up your account didn’t finish. Try signing in again.");
    } catch (err) {
      setPhase({ at: "error", message: sayOf(err) });
    }
  }

  // Signing out re-arms the flow for the next sign-in.
  useEffect(() => {
    if (!isLoggedIn) started.current = false;
  }, [isLoggedIn]);

  if (skip || !isLoggedIn || phase.at === "idle" || phase.at === "done") return null;

  return (
    <div role="dialog" aria-modal="true" aria-live="polite" data-fixed="top" className="fixed inset-0 z-50 flex flex-col justify-center bg-ground px-5 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex w-full max-w-[420px] flex-col gap-6">
        {phase.at === "working" ? (
          // The one loader in place of the words (the touch-ups round, section 3): the words are what a screen reader hears.
          <div className="flex justify-center text-ink" data-signing-in="">
            <TallyLoader size={48} label={phase.line} />
          </div>
        ) : phase.at === "error" ? (
          <>
            <p className="text-serif-l text-ink">That didn’t work.</p>
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
            <label htmlFor="display-name" className="text-serif-l text-ink">
              What do your friends call you?
            </label>
            <input
              id="display-name"
              ref={input}
              autoFocus
              autoComplete="given-name"
              enterKeyHint="done"
              maxLength={40}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameProblem(null);
              }}
              aria-invalid={nameProblem ? true : undefined}
              aria-describedby={nameProblem ? "display-name-problem" : undefined}
              className={`h-14 rounded-button border border-line bg-surface px-4 text-body text-ink${nameProblem ? ` ${FIELD_PROBLEM_CLASS}` : ""}`}
            />
            <Problem id="display-name-problem" message={nameProblem} />
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
