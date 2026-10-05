"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useDynamicContext, useIsLoggedIn, useSocialAccounts, useStepUpAuthentication, useUserUpdateRequest } from "@dynamic-labs/sdk-react-core";
import type { ProviderEnum, TokenScope } from "@dynamic-labs/sdk-api-core";
import { Button } from "@/components/ui/button";
import { FIELD_PROBLEM_CLASS, Problem } from "@/components/ledger/problem";
import { reachCardShownAction } from "@/lib/actions/reach";
import { codeOf, emailLooksRight, otpProblem } from "@/lib/auth/otp";
import { googleOffered } from "@/lib/auth/google";
import { reachableBy } from "@/lib/auth/reach";
import { installedHere } from "@/lib/usage/client";

const GOOGLE = "google" as ProviderEnum;
const LINK_SCOPE = "credential:link" as TokenScope;

/**
 * The one card for an account the app cannot reach (the first-contact round, 2026-10-04): no push on any device, no
 * email, no Google. Shown once, on the device that holds the login (the only one that knows the credentials), at the
 * top of Now; on screen it is recorded as shown and never comes back. Adding an email is Dynamic's own code to that
 * address; linking Google is Dynamic's redirect, after the re-check Dynamic asks before a credential is added.
 */
export function ReachCard() {
  const loggedIn = useIsLoggedIn();
  const { user, sdkHasLoaded } = useDynamicContext();
  const { updateUser } = useUserUpdateRequest();
  const { linkSocialAccount } = useSocialAccounts();
  const { isStepUpRequired, promptStepUpAuth } = useStepUpAuthentication();
  const [gone, setGone] = useState(false);
  const [stage, setStage] = useState<"ask" | "email" | "code" | "done">("ask");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<"send" | "check" | "google" | null>(null);
  const verify = useRef<((token: string) => Promise<unknown>) | null>(null);
  const shown = useRef(false);
  const id = useId();
  const reach = reachableBy(user as Parameters<typeof reachableBy>[0]);
  const eligible = sdkHasLoaded && loggedIn && !reach.email && !reach.google;
  useEffect(() => {
    if (!eligible || shown.current) return;
    shown.current = true;
    void reachCardShownAction();
  }, [eligible]);
  if (!eligible || gone) return null;

  async function stepUp(): Promise<void> {
    if (await isStepUpRequired({ scope: LINK_SCOPE })) await promptStepUpAuth({ requestedScopes: [LINK_SCOPE] });
  }

  async function sendCode() {
    setProblem(null);
    if (!emailLooksRight(email)) return setProblem("That doesn’t look like an email address.");
    setBusy("send");
    try {
      await stepUp();
      const r = await updateUser({ email: email.trim() });
      if (r.isEmailVerificationRequired && r.verifyOtp) {
        verify.current = r.verifyOtp;
        setStage("code");
      } else setStage("done");
    } catch (err) {
      console.error("adding an email failed", err instanceof Error ? err.message : err);
      setProblem(otpProblem(err, "address"));
    } finally {
      setBusy(null);
    }
  }

  async function checkCode() {
    setProblem(null);
    const digits = codeOf(code);
    if (!digits || !verify.current) return setProblem("The code is six numbers.");
    setBusy("check");
    try {
      await verify.current(digits);
      setStage("done");
    } catch (err) {
      console.error("checking the email's code failed", err instanceof Error ? err.message : err);
      setProblem(otpProblem(err, "code"));
    } finally {
      setBusy(null);
    }
  }

  async function withGoogle() {
    setProblem(null);
    setBusy("google");
    try {
      await stepUp();
      await linkSocialAccount(GOOGLE, { redirectUrl: window.location.href });
    } catch (err) {
      console.error("linking Google failed", err instanceof Error ? err.message : err);
      setProblem("Google didn’t open. Try again, or add an email.");
      setBusy(null);
    }
  }

  const problemId = `${id}-problem`;
  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-surface px-4 py-[14px]" data-reach-card={stage}>
      {stage === "done" ? (
        <>
          <p className="text-body-strong text-ink">Added.</p>
          <Button variant="tertiary" className="self-start" onClick={() => setGone(true)}>
            Done
          </Button>
        </>
      ) : stage === "ask" ? (
        <>
          <p className="text-body-strong text-ink">Add an email or link Google</p>
          <Problem id={problemId} message={problem} />
          <Button variant="secondary" onClick={() => setStage("email")} disabled={busy !== null} data-reach-email="">
            Add an email
          </Button>
          {googleOffered(installedHere()) ? (
            <Button variant="secondary" onClick={() => void withGoogle()} loading={busy === "google"} disabled={busy !== null && busy !== "google"} data-reach-google="">
              Link Google
            </Button>
          ) : null}
          <Button variant="tertiary" className="self-start" onClick={() => setGone(true)} disabled={busy !== null}>
            Not now
          </Button>
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-label text-ink-3">{stage === "email" ? "Email" : `The code sent to ${email.trim()}`}</span>
            <input
              value={stage === "email" ? email : code}
              onChange={(e) => (stage === "email" ? setEmail(e.target.value) : setCode(e.target.value), setProblem(null))}
              type={stage === "email" ? "email" : "text"}
              inputMode={stage === "email" ? "email" : "numeric"}
              autoComplete={stage === "email" ? "email" : "one-time-code"}
              autoCapitalize="none"
              maxLength={80}
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? problemId : undefined}
              className={`h-12 w-full rounded-button border border-line bg-ground px-4 text-body text-ink${problem ? ` ${FIELD_PROBLEM_CLASS}` : ""}`}
            />
          </label>
          <Problem id={problemId} message={problem} />
          <Button variant="primary" onClick={() => void (stage === "email" ? sendCode() : checkCode())} loading={busy === "send" || busy === "check"}>
            Continue
          </Button>
          <Button variant="tertiary" className="self-start" onClick={() => (setStage("ask"), setProblem(null))} disabled={busy !== null}>
            Back
          </Button>
        </>
      )}
    </section>
  );
}
