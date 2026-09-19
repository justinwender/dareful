"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SignInButton } from "@/components/auth/sign-in-button";
import { Button } from "@/components/ui/button";
import { concedeAction, thatsMeAction } from "@/lib/actions/claims";

/**
 * The choice on a claim link. The link never signs anyone in: it says who the person who sent it thinks you
 * are, and only you can say they are right. Signed in, "that's me" makes these yours to answer. Signed out,
 * it is remembered in this browser and nothing else happens until you sign in.
 */
export function ClaimChoice({ token, name, signedIn, held }: { token: string; name: string; signedIn: boolean; held: boolean }) {
  const router = useRouter();
  const [isHeld, setHeld] = useState(held);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function thatsMe() {
    setError(null);
    start(async () => {
      const r = await thatsMeAction(token);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      if ("bound" in r) {
        router.replace("/welcome");
        router.refresh();
        return;
      }
      setHeld(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="text-body-sm text-ink-2">
          {error}
        </p>
      ) : null}
      {signedIn ? (
        <Button variant="primary" onClick={thatsMe} loading={pending}>
          That’s me
        </Button>
      ) : isHeld ? (
        <>
          <p className="text-body text-ink-2">Got it, {name}. Sign in and these are yours to say yes or no to. An email or a phone number is all it takes.</p>
          <SignInButton label="Sign in" />
        </>
      ) : (
        <>
          <Button variant="primary" onClick={thatsMe} loading={pending}>
            That’s me
          </Button>
          <SignInButton label="I already have an account" />
        </>
      )}
    </div>
  );
}

/** "Fine, you got me." Works with no account, from the browser that said "that's me". It binds nobody to anything. */
export function ConcedeButton({ proposalId, conceded }: { proposalId: string; conceded: boolean }) {
  const router = useRouter();
  const [done, setDone] = useState(conceded);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (done) return <p className="px-1 text-caption text-ink-3">You said “fine, you got me.”</p>;
  return (
    <div className="flex items-center gap-3 px-1">
      <Button
        variant="tertiary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await concedeAction(proposalId);
            if ("error" in r) setError(r.error);
            else {
              setDone(true);
              router.refresh();
            }
          })
        }
      >
        Fine, you got me
      </Button>
      {error ? (
        <span role="alert" className="text-caption text-ink-3">
          {error}
        </span>
      ) : null}
    </div>
  );
}
