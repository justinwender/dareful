"use client";

import { useId, useRef, useState } from "react";
import { useConnectWithOtp, useSocialAccounts } from "@dynamic-labs/sdk-react-core";
import type { ProviderEnum } from "@dynamic-labs/sdk-api-core";
import { Button } from "@/components/ui/button";
import { GoogleMark } from "@/components/auth/google-mark";
import { FIELD_PROBLEM_CLASS, Problem } from "@/components/ledger/problem";
import { codeOf, emailLooksRight, otpProblem, phoneDataOf } from "@/lib/auth/otp";
import { googleOffered } from "@/lib/auth/google";
import { installedHere } from "@/lib/usage/client";
import { writeJoinHandoff, type JoinHandoff } from "@/lib/ui/join-handoff";

const GOOGLE = "google" as ProviderEnum;

/**
 * Keeping your calls in an account, in the entry sheet (the first-contact rounds, 2026-10-04 and 2026-10-06;
 * docs/design.md 3.17 as amended): "Continue with Google" first, the step's one chalk control with Google's mark at
 * its left, since Google is one tap for most people and arrives with a verified email, which is what reminders need;
 * then an email, then a phone number, and a way out. After a guest's entry it is "Keep your calls in an account" with
 * "Not now"; from "I already have an account" it is "Sign in" with "Back", and the entry picked goes in under the
 * account once it exists. The code is Dynamic's own one-time code; what happens after it (the session, a new
 * account's wallets and name) is the login's bootstrap, and the handoff carries the name typed and the entry across
 * it, in this tab only.
 */
export function AccountStep({ mode, handoff, onClose, titleId, closeWord }: { mode: "keep" | "sign-in"; /** What the sign-in carries across (`src/lib/ui/join-handoff.ts`), written before any code is asked for; none from a sign-in that starts nowhere in particular (Now, a claim). */ handoff?: Omit<JoinHandoff, "at">; onClose: () => void; /** The heading's id, when a sheet is labelled by it. */ titleId?: string; /** The way out's word, where "Back" goes nowhere (the sign-in sheet, which closes). */ closeWord?: string }) {
  const { connectWithEmail, connectWithSms, verifyOneTimePassword, retryOneTimePassword } = useConnectWithOtp();
  const { signInWithSocialAccount } = useSocialAccounts();
  const [via, setVia] = useState<"email" | "phone">("email");
  const [stage, setStage] = useState<"address" | "code">("address");
  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  /** A Google sign-in that never opened: said under Google's button, never at the address field. */
  const [googleProblem, setGoogleProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<"send" | "check" | "again" | "google" | null>(null);
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  // Drawn only after a tap, never on the server, so the installed app's own question can be asked here.
  const google = googleOffered(installedHere());

  const remember = () => (handoff ? writeJoinHandoff({ ...handoff, at: Date.now() }) : undefined);

  async function send() {
    setProblem(null);
    const email = address.trim();
    const phone = via === "phone" ? phoneDataOf(address) : null;
    if (via === "email" && !emailLooksRight(email)) return setProblem("That doesn’t look like an email address.");
    if (via === "phone" && !phone) return setProblem("A US or Canadian number, like 555 123 4567.");
    setBusy("send");
    remember();
    try {
      if (via === "email") await connectWithEmail(email);
      else if (phone) await connectWithSms(phone);
      setStage("code");
      setCode("");
    } catch (err) {
      console.error("asking for a code failed", err instanceof Error ? err.message : err);
      setProblem(otpProblem(err, "address"));
    } finally {
      setBusy(null);
    }
  }

  async function check() {
    setProblem(null);
    const digits = codeOf(code);
    if (!digits) return setProblem("The code is six numbers.");
    setBusy("check");
    remember();
    try {
      // Verified, the SDK holds the login, and the bootstrap takes it from here: the session, and for someone new their two wallets and their name.
      await verifyOneTimePassword(digits);
    } catch (err) {
      console.error("checking a code failed", err instanceof Error ? err.message : err);
      setProblem(otpProblem(err, "code"));
      setBusy(null);
    }
  }

  async function again() {
    setProblem(null);
    setBusy("again");
    try {
      await retryOneTimePassword();
    } catch (err) {
      console.error("sending a code again failed", err instanceof Error ? err.message : err);
      setProblem(otpProblem(err, "address"));
    } finally {
      setBusy(null);
    }
  }

  async function withGoogle() {
    setProblem(null);
    setGoogleProblem(null);
    setBusy("google");
    remember();
    try {
      // Dynamic's redirect: this page goes to Google and comes back to this address, where the provider at the root finishes the sign-in.
      await signInWithSocialAccount(GOOGLE, { redirectUrl: window.location.href });
    } catch (err) {
      console.error("Google sign-in failed to start", err instanceof Error ? err.message : err);
      setGoogleProblem("Google didn’t open. Try again, or use an email.");
      setBusy(null);
    }
  }

  const problemId = `${id}-problem`;
  const heading = mode === "keep" ? "Keep your calls in an account" : "Sign in";
  if (stage === "code") {
    return (
      <div className="flex flex-col gap-3" data-account-step="code">
        <h2 id={titleId} className="text-body-strong text-ink">{heading}</h2>
        <label className="flex flex-col gap-1">
          <span className="text-label text-ink-3">The code sent to {address.trim()}</span>
          <input
            ref={field}
            value={code}
            onChange={(e) => (setCode(e.target.value), setProblem(null))}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={12}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? problemId : undefined}
            className={`h-12 w-full rounded-button border border-line bg-ground px-4 text-body text-ink tabular-nums${problem ? ` ${FIELD_PROBLEM_CLASS}` : ""}`}
          />
        </label>
        <Problem id={problemId} message={problem} />
        <Button variant="primary" onClick={() => void check()} loading={busy === "check"} disabled={busy !== null && busy !== "check"}>
          Continue
        </Button>
        <div className="flex flex-wrap gap-x-4">
          <Button variant="tertiary" onClick={() => void again()} loading={busy === "again"} disabled={busy === "check"}>
            Send a new code
          </Button>
          <Button variant="tertiary" onClick={() => (setStage("address"), setProblem(null))} disabled={busy === "check"}>
            Back
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3" data-account-step="address">
      <h2 id={titleId} className="text-body-strong text-ink">{heading}</h2>
      {google ? (
        <>
          <Button variant="primary" onClick={() => void withGoogle()} loading={busy === "google"} disabled={busy !== null && busy !== "google"} data-account-google="">
            <GoogleMark />
            Continue with Google
          </Button>
          <Problem id={`${problemId}-google`} message={googleProblem} />
        </>
      ) : null}
      <label className="flex flex-col gap-1">
        <span className="text-label text-ink-3">{via === "email" ? "Email" : "Phone number"}</span>
        <input
          ref={field}
          value={address}
          onChange={(e) => (setAddress(e.target.value), setProblem(null))}
          type={via === "email" ? "email" : "tel"}
          inputMode={via === "email" ? "email" : "tel"}
          autoComplete={via === "email" ? "email" : "tel"}
          autoCapitalize="none"
          maxLength={80}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? problemId : undefined}
          className={`h-12 w-full rounded-button border border-line bg-ground px-4 text-body text-ink${problem ? ` ${FIELD_PROBLEM_CLASS}` : ""}`}
        />
      </label>
      <Problem id={problemId} message={problem} />
      {/* With Google offered it is the step's chalk, and the address's Continue is a secondary; without it, the address leads. */}
      <Button variant={google ? "secondary" : "primary"} onClick={() => void send()} loading={busy === "send"} disabled={busy !== null && busy !== "send"} data-account-continue="">
        Continue
      </Button>
      <Button variant="secondary" onClick={() => (setVia(via === "email" ? "phone" : "email"), setAddress(""), setProblem(null))} disabled={busy !== null} data-account-switch="">
        {via === "email" ? "Use a phone number" : "Use an email"}
      </Button>
      <Button variant="tertiary" onClick={onClose} disabled={busy !== null} data-account-close="">
        {closeWord ?? (mode === "keep" ? "Not now" : "Back")}
      </Button>
    </div>
  );
}
