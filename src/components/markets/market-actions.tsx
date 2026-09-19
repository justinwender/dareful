"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TypedDataDomain } from "viem";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ledger/chip";
import { ProblemSummary } from "@/components/ledger/problem";
import { signingProblem, useSigner } from "@/components/ledger/use-signer";
import { castVoteAction, enterMarketAction, lockMarketAction, openMarketAction, sayWhatHappenedAction } from "@/lib/actions/markets";
import { daresTypes } from "@/lib/chain/typed-data";
import { ProbabilityEntry } from "./probability-entry";

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
const STAKES_MONEY = [500, 1000, 2000, 5000];
const STAKES_COUNT = [1, 2, 3, 5];

/**
 * Putting a number on it: how likely, and what is on it. One tap, then the person's own approval of exactly those
 * two numbers. For the creator of a draft the same tap also approves the terms, which is what opens it.
 */
export function EntryPanel({ dareId, signing, unit, mode, mark, suggestion, average, initial }: {
  dareId: string;
  signing: Signing;
  unit: StakeUnit;
  mode: "open" | "enter" | "change";
  mark: string | null;
  suggestion: { percent: number; rationale: string | null } | null;
  average: { kind: "hidden"; names: string[] } | { kind: "shown"; percent: number; names: string[] } | null;
  initial?: { percent: number; stake: string };
}) {
  const router = useRouter();
  const sign = useSigner();
  const [value, setValue] = useState(initial?.percent ?? 50);
  const [touched, setTouched] = useState(Boolean(initial));
  const [stake, setStake] = useState<string>(initial?.stake ?? (unit.quantifiable ? String(unit.monetary ? 1000 : 1) : "1"));
  const [custom, setCustom] = useState("");
  const [step, setStep] = useState<"idle" | "approving" | "sending">("idle");
  const [problem, setProblem] = useState<string | null>(null);

  async function submit() {
    setProblem(null);
    const stakeUnits = custom.trim() ? customStake(custom, unit.monetary) : stake;
    if (!stakeUnits || BigInt(stakeUnits) <= 0n) return setProblem(unit.monetary ? "Put an amount on it, like 10." : "Put at least one on it.");
    const valueBps = value * 100;
    try {
      setStep("approving");
      let createSignature: `0x${string}` | null = null;
      if (mode === "open") {
        if (!signing.create) throw new Error("missing terms");
        const c = signing.create;
        createSignature = await sign(signing.ledgerWallet, { domain: signing.domain, types: daresTypes, primaryType: "Create", message: { dareId: signing.dareOnchainId, groupId: c.groupId, kind: c.kind, pace: c.pace, termsHash: c.termsHash, denomId: c.denomId, range: BigInt(c.range), options: c.options, stalemate: signing.stalemate, resolvesBy: BigInt(c.resolvesBy) } }, "approve terms");
      }
      const enterSignature = await sign(signing.ledgerWallet, { domain: signing.domain, types: daresTypes, primaryType: "Enter", message: { dareId: signing.dareOnchainId, stake: BigInt(stakeUnits), value: BigInt(valueBps), confidenceBps: 0, stalemate: signing.stalemate } }, "approve number");
      setStep("sending");
      const position = { stake: stakeUnits, valueBps };
      const r = createSignature ? await openMarketAction(dareId, createSignature, position, enterSignature) : await enterMarketAction(dareId, position, enterSignature);
      if ("error" in r) {
        setProblem(r.error);
        setStep("idle");
        return;
      }
      router.refresh();
      setStep("idle");
    } catch (err) {
      setProblem(signingProblem(err));
      setStep("idle");
    }
  }

  const options = unit.monetary ? STAKES_MONEY : STAKES_COUNT;
  return (
    <div className="flex flex-col gap-6">
      <ProbabilityEntry
        value={value}
        onChange={(v) => {
          setValue(v);
          setTouched(true);
        }}
        touched={touched}
        mark={mark}
        suggestion={suggestion}
        average={average && (average.kind === "hidden" || touched) ? average : average ? { kind: "hidden", names: average.names } : null}
      />
      <div className="flex flex-col gap-3">
        <h2 className="text-label text-ink-3">What’s on it</h2>
        {unit.quantifiable ? (
          <div className="flex flex-wrap items-center gap-2">
            {options.map((o) => (
              <button key={o} type="button" onClick={() => (setStake(String(o)), setCustom(""))} className="rounded-pill">
                <Chip size={36} selected={!custom && stake === String(o)}>
                  {unit.monetary ? `$${o / 100}` : `${o} ${o === 1 ? unit.singular : unit.plural}`}
                </Chip>
              </button>
            ))}
            <input inputMode={unit.monetary ? "decimal" : "numeric"} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={unit.monetary ? "other $" : "other"} aria-label="Another amount" className="h-9 w-24 rounded-pill border border-line-strong bg-transparent px-3 text-[13px] text-ink placeholder:text-ink-3" />
          </div>
        ) : (
          <p className="text-body-sm text-ink-2">One {unit.singular}, the same for everyone. Whoever was furthest off has got whoever was closest.</p>
        )}
        <p className="text-caption text-ink-3">The most you can be out is what you put on it, and only if you were the furthest off.</p>
      </div>
      <ProblemSummary messages={[problem]} />
      <Button variant="primary" onClick={submit} loading={step !== "idle"}>
        {mode === "open" ? "Looks right. I’m in" : mode === "change" ? "Change my number" : "I’m in"}
      </Button>
      {step === "approving" ? <p className="text-caption text-ink-3">{mode === "open" ? "Two quick approvals: the terms, then your number." : "One quick approval."}</p> : null}
    </div>
  );
}

function customStake(input: string, monetary: boolean): string | null {
  if (!monetary) return /^\d{1,6}$/.test(input.trim()) ? input.trim() : null;
  const m = /^\s*\$?\s*(\d{1,6})(?:\.(\d{1,2}))?\s*$/.exec(input);
  if (!m) return null;
  return (BigInt(m[1] ?? "0") * 100n + BigInt((m[2] ?? "").padEnd(2, "0"))).toString();
}

/** The creator's lock. After this nobody's number moves, and everyone can see everyone's. */
export function LockButton({ dareId, count }: { dareId: string; count: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <ProblemSummary messages={[problem]} />
      <Button
        variant="primary"
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
export function Ballot({ dareId, signing, suggested, myVote, tallyLine }: { dareId: string; signing: Signing; suggested: "yes" | "no" | "void" | null; myVote: "yes" | "no" | "void" | null; tallyLine: string }) {
  const router = useRouter();
  const sign = useSigner();
  // Derived, not remembered: the suggestion arrives after someone says what happened, on a screen already open.
  const [disagreeing, setDisagreeing] = useState(false);
  const picking = suggested === null || disagreeing;
  const [busy, setBusy] = useState<"yes" | "no" | "void" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const VOID = (1n << 256n) - 1n;

  async function cast(outcome: "yes" | "no" | "void") {
    setProblem(null);
    setBusy(outcome);
    try {
      const signature = await sign(signing.governanceWallet, { domain: signing.domain, types: daresTypes, primaryType: "Vote", message: { dareId: signing.dareOnchainId, outcome: outcome === "yes" ? 1n : outcome === "no" ? 0n : VOID } }, "vote");
      const r = await castVoteAction(dareId, outcome, signature);
      if ("error" in r) setProblem(r.error);
      else router.refresh();
    } catch (err) {
      setProblem(signingProblem(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-ink-2">{tallyLine}</p>
      {myVote ? <p className="text-body-sm text-ink-2">You said {LABEL[myVote].toLowerCase()}. You can change it until it’s decided.</p> : null}
      {suggested && !picking ? (
        <>
          <Button variant="primary" onClick={() => cast(suggested)} loading={busy === suggested} disabled={busy !== null}>
            {LABEL[suggested]}, that’s right
          </Button>
          <Button variant="tertiary" onClick={() => setDisagreeing(true)} disabled={busy !== null}>
            That’s not how it went
          </Button>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          {(["yes", "no", "void"] as const).map((o) => (
            <Button key={o} variant="secondary" onClick={() => cast(o)} loading={busy === o} disabled={busy !== null}>
              {LABEL[o]}
            </Button>
          ))}
        </div>
      )}
      <ProblemSummary messages={[problem]} />
      {busy ? <p className="text-caption text-ink-3">One approval, from you and nobody else.</p> : null}
    </div>
  );
}
