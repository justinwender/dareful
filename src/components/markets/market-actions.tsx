"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TypedDataDomain } from "viem";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { ProblemSummary } from "@/components/ledger/problem";
import { signingProblem, useSigner } from "@/components/ledger/use-signer";
import { castVoteAction, lockMarketAction, sayWhatHappenedAction } from "@/lib/actions/markets";
import { daresTypes } from "@/lib/chain/typed-data";

/** Everything a browser needs to build the typed data a person signs. Bigints travel as strings. */
export type Signing = {
  domain: TypedDataDomain;
  dareOnchainId: `0x${string}`;
  stalemate: 0 | 1;
  ledgerWallet: string;
  governanceWallet: string;
  /** Present only for the creator of a draft: the Create message, every field final. */
  create?: { groupId: `0x${string}`; kind: number; pace: number; termsHash: `0x${string}`; denomId: `0x${string}`; range: string; options: number; resolvesBy: string };
};

export type StakeUnit = { monetary: boolean; quantifiable: boolean; singular: string; plural: string };

/** The creator's lock. After this nobody's number moves, and everyone can see everyone's. */
export function LockButton({ dareId, count, primary = true }: { dareId: string; count: number; primary?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <ProblemSummary messages={[problem]} />
      <Button
        variant={primary ? "primary" : "secondary"}
        loading={pending}
        disabled={count < 2}
        onClick={() =>
          start(async () => {
            setProblem(null);
            const r = await lockMarketAction(dareId);
            if ("error" in r) setProblem(r.error);
            else router.refresh();
          })
        }
      >
        {count < 2 ? "It takes two to lock it in" : `Lock it in with ${count}`}
      </Button>
      {pending ? <p className="text-caption text-ink-3">Locking everyone’s numbers. A few seconds.</p> : null}
    </div>
  );
}

/** One line about what happened. It is the only thing the app's suggestion has to go on: it was not there. */
export function WhatHappened({ dareId, mine }: { dareId: string; mine: string | null }) {
  const router = useRouter();
  const [text, setText] = useState(mine ?? "");
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim().length < 2) return setProblem("Say what happened in a line.");
        start(async () => {
          setProblem(null);
          const r = await sayWhatHappenedAction(dareId, text);
          if ("error" in r) setProblem(r.error);
          else router.refresh();
        });
      }}
    >
      <label htmlFor="what-happened" className="text-label text-ink-3">
        What happened?
      </label>
      <input id="what-happened" value={text} onChange={(e) => setText(e.target.value)} maxLength={280} placeholder="Out cold by the second act" className="h-12 rounded-tile border border-line bg-surface px-3 text-body text-ink placeholder:text-ink-3" />
      <ProblemSummary messages={[problem]} />
      <Button type="submit" variant="secondary" loading={pending}>
        {mine ? "Update what I said" : "Say it"}
      </Button>
      {pending ? <p className="text-caption text-ink-3">Reading the terms against what you said.</p> : null}
    </form>
  );
}

const LABEL = { yes: "Yes", no: "No", void: "Nobody can tell" } as const;

/**
 * The ballot. Agreeing with the suggestion is one tap and one approval; disagreeing means picking a different
 * answer first. The approval comes from the second of the person's two keys, the one the app never holds, which
 * is the whole reason a vote cannot be cast for anyone.
 */
export function Ballot({ dareId, signing, suggested, myVote, tallyLine, threshold }: { dareId: string; signing: Signing; suggested: "yes" | "no" | "void" | null; myVote: "yes" | "no" | "void" | null; tallyLine: string; threshold: number }) {
  const router = useRouter();
  const sign = useSigner();
  // Derived, not remembered: the suggestion arrives after someone says what happened, on a screen already open.
  const [disagreeing, setDisagreeing] = useState(false);
  const picking = suggested === null || disagreeing;
  // A vote binds everyone in the question, so it gets a deliberate moment of its own, in the app's words: pick,
  // then say so. Things that bind only the person doing them (a number, a yep) are their own button and no more.
  const [choice, setChoice] = useState<"yes" | "no" | "void" | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const VOID = (1n << 256n) - 1n;

  async function cast(outcome: "yes" | "no" | "void") {
    setProblem(null);
    setBusy(true);
    try {
      const signature = await sign(signing.governanceWallet, { domain: signing.domain, types: daresTypes, primaryType: "Vote", message: { dareId: signing.dareOnchainId, outcome: outcome === "yes" ? 1n : outcome === "no" ? 0n : VOID } }, "vote");
      const r = await castVoteAction(dareId, outcome, signature);
      if ("error" in r) return setProblem(r.error);
      setChoice(null);
      router.refresh();
    } catch (err) {
      setProblem(signingProblem(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-ink-2">{tallyLine}</p>
      {myVote ? <p className="text-body-sm text-ink-2">You said {LABEL[myVote].toLowerCase()}. You can change it until it’s decided.</p> : null}
      {suggested && !picking ? (
        <>
          <Button variant="primary" onClick={() => setChoice(suggested)}>
            {LABEL[suggested]}, that’s right
          </Button>
          <Button variant="tertiary" onClick={() => setDisagreeing(true)}>
            That’s not how it went
          </Button>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          {(["yes", "no", "void"] as const).map((o) => (
            <Button key={o} variant="secondary" onClick={() => setChoice(o)}>
              {LABEL[o]}
            </Button>
          ))}
        </div>
      )}
      {choice === null ? <ProblemSummary messages={[problem]} /> : null}
      <Sheet
        open={choice !== null}
        labelledBy="call-it-title"
        onClose={() => {
          if (!busy) setChoice(null);
        }}
      >
        {choice ? (
          <>
            <div className="flex flex-col gap-2">
              <p className="text-label text-ink-3">You’re calling it</p>
              <h2 id="call-it-title" className="text-question text-ink">
                {LABEL[choice]}.
              </h2>
            </div>
            <p className="text-body-sm-prose text-ink-2">
              This one counts for everyone in it, not just you. It’s decided once {threshold} of you say the same thing, and you can change yours until then. Nobody can say it for you, and the app can’t either.
            </p>
            <ProblemSummary messages={[problem]} />
            <div className="flex flex-col gap-1">
              <Button variant="primary" data-autofocus onClick={() => cast(choice)} loading={busy}>
                Call it {LABEL[choice].toLowerCase()}
              </Button>
              <Button variant="tertiary" onClick={() => setChoice(null)} disabled={busy}>
                Not yet
              </Button>
            </div>
          </>
        ) : null}
      </Sheet>
    </div>
  );
}
