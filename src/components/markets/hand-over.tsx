"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { enterFromHostAction } from "@/lib/actions/hand-over";
import type { MarkRef } from "@/lib/ui/mark";
import { CodeSheet } from "./whos-in-row";
import { PinStep, WhosJoining, type HandOverCandidate } from "./hand-over-steps";
import { MarketStage, type MarketStageProps } from "./market-stage";

export type { HandOverCandidate } from "./hand-over-steps";
const PIN_LENGTH = 4;
/** Three wrong tries end the handoff, and nothing is said to anyone (3.45, frame 5); the PIN's own lock counts further, on the server. */
const TRIES = 3;

/**
 * Handing the phone over (docs/design.md 3.45, frames 3 to 6; the shared steps of 3.17). The screen becomes the
 * friend's: "On Sam's phone" with a close, then the band and the details as the link page draws them, and the
 * entry sheet; nothing of anyone else's, not even the phone owner's number. After "I'm in at 60%, 1 beer" the
 * sheet asks who's joining with the entry's summary on the right ("Pick yourself", the people the market was sent
 * to who aren't in yet; those not set up at 0.45), then the friend's PIN on a keypad, whose fourth digit sends.
 * Then the whole screen is the handback: the check, "You're in, Maya.", when it can be changed from her own
 * phone, and "Hand it back to Sam". Back never returns to her entry: the screen replaces itself in history, and
 * nothing of hers is kept here.
 */
export function HandOver({ dareId, host, question, mark, url, candidates, changeUntil, blind, band, details, stage }: { dareId: string; host: { name: string }; question: string; mark: MarkRef | null; url: string; candidates: HandOverCandidate[]; /** "until 10:40pm": how long the friend's entry is theirs to change or withdraw from their own phone. */ changeUntil: string; blind: boolean; band: ReactNode; details: ReactNode; /** The entry stage's props, as the link page draws it; rendered here in host mode, so the pick lands in this component and nothing is sent from the stage. */ stage: Omit<MarketStageProps, "host"> }) {
  const router = useRouter();
  const [picked, setPicked] = useState<{ position: { stake: string; value: string }; words: string } | null>(null);
  const [friend, setFriend] = useState<HandOverCandidate | null>(null);
  const [pin, setPin] = useState("");
  const [wrong, setWrong] = useState(0);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<HandOverCandidate | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);

  // The handoff ends by leaving, with nothing of the friend's kept: the host's own screen takes this one's place in history.
  const leave = () => router.replace(`/m/${dareId}`);

  /** The fourth digit sends (3.45, frame 5): the friend's PIN and the entry go up together, and the dots clear either way. */
  async function send(full: string) {
    if (!friend || !picked || sending) return;
    setSending(true);
    setProblem(null);
    try {
      const r = await enterFromHostAction(dareId, picked.position, friend.id, full);
      setPin("");
      if (r.ok) return setDone(friend);
      if ("locked" in r) {
        setProblem("That PIN is locked for now.");
        setTimeout(leave, 1200);
        return;
      }
      if ("wrong" in r) {
        const n = wrong + 1;
        setWrong(n);
        // Three wrong tries end the handoff, and nothing is said to anyone.
        if (n >= TRIES) return leave();
        return setProblem("That’s not it.");
      }
      setProblem(r.error);
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-10" data-hand-back="">
        <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-pill bg-chalk text-on-chalk">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <h1 className="text-serif-l text-ink">You’re in, {done.name.split(/\s+/)[0]}.</h1>
        <p className="text-body-sm text-ink-2">{blind ? `It’s final. You can withdraw it from your own phone ${changeUntil}.` : `Change it on your own phone ${changeUntil}.`}</p>
        <Button variant="primary" className="mt-4 w-full" onClick={leave} data-hand-back-button="">
          Hand it back to {host.name.split(/\s+/)[0]}
        </Button>
      </div>
    );
  }

  return (
    <>
      <header className="flex h-14 items-center justify-between" data-on-phone="">
        <span className="text-body-strong text-ink">On {host.name.split(/\s+/)[0]}’s phone</span>
        <button type="button" aria-label="Close" onClick={leave} className="-mr-2 inline-flex h-12 w-12 items-center justify-center rounded-pill text-ink">
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>
      <div className="flex flex-col gap-7 py-2">
        {band}
        {details}
      </div>
      {!picked ? (
        <MarketStage {...stage} host={{ onPicked: (position, words) => setPicked({ position, words }) }} />
      ) : !friend ? (
        <WhosJoining candidates={candidates} words={picked.words} onPick={setFriend} onScan={() => setCodeOpen(true)} />
      ) : (
        <PinStep friend={friend} pin={pin} problem={problem} sending={sending} onKey={(k) => {
          const next = k === "back" ? pin.slice(0, -1) : pin.length < PIN_LENGTH ? pin + k : pin;
          setPin(next);
          if (next.length === PIN_LENGTH) void send(next);
        }} />
      )}
      <CodeSheet open={codeOpen} onClose={() => setCodeOpen(false)} dareId={dareId} url={url} question={question} mark={mark} />
    </>
  );
}

