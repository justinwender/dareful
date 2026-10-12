"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonWait, useWaitStage } from "@/components/ui/button";
import { enterFromHostAction } from "@/lib/actions/hand-over";
import { attempt } from "@/lib/ui/attempt";
import { WORDS } from "@/lib/ui/errors";
import type { NobodyToPick } from "@/lib/ledger/hand-over";
import type { MarkRef } from "@/lib/ui/mark";
import { GIVE_UP_MS } from "@/lib/ui/motion";
import { CodeSheet } from "./whos-in-row";
import { PinStep, pinAfterKey, WhosJoining, type HandOverCandidate } from "./hand-over-steps";
import { MarketStage, type MarketStageProps } from "./market-stage";

export type { HandOverCandidate } from "./hand-over-steps";
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
export function HandOver({ dareId, host, question, mark, url, candidates, nobody, changeUntil, blind, band, details, stage }: { dareId: string; host: { name: string }; question: string; mark: MarkRef | null; url: string; candidates: HandOverCandidate[]; /** Why nobody can be picked, when nobody can (`handOverPicks`). */ nobody: NobodyToPick | null; /** "until 10:40pm": how long the friend's entry is theirs to change or withdraw from their own phone. */ changeUntil: string; blind: boolean; band: ReactNode; details: ReactNode; /** The entry stage's props, as the link page draws it; rendered here in host mode, so the pick lands in this component and nothing is sent from the stage. */ stage: Omit<MarketStageProps, "host"> }) {
  const router = useRouter();
  const [picked, setPicked] = useState<{ position: { stake: string; value: string }; words: string } | null>(null);
  const [friend, setFriend] = useState<HandOverCandidate | null>(null);
  const [pin, setPin] = useState("");
  const [wrong, setWrong] = useState(0);
  /** A PIN on its way, from the fourth digit until the answer; or the screen leaving after a lock. Either way the keypad takes nothing. */
  const [holding, setHolding] = useState<"sent" | "leaving" | null>(null);
  // Read in the tap itself, so a tap landing in the same frame as the fourth digit sends nothing a second time.
  const held = useRef(false);
  // The try whose answer is shown: one given up on after a minute answers into nothing, unless it got the friend in.
  const tryNo = useRef(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<HandOverCandidate | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  // The PIN holds as every tap does (5.2): the tally past a third of a second, its line at three, and words of our own at a minute.
  const wait = buttonWait(useWaitStage(holding === "sent"), "write");

  // The handoff ends by leaving, with nothing of the friend's kept: the host's own screen takes this one's place in history.
  const leave = () => router.replace(`/m/${dareId}`);

  /**
   * The fourth digit sends (3.45, frame 5): the friend's PIN and the entry go up together, the keypad holds with the tally
   * until the answer (pre-submission bug fixes 2: three to five seconds of nothing read as frozen), and the answer takes
   * its place: in, a wrong PIN, a lock or a refusal, with the dots cleared.
   */
  async function send(full: string) {
    if (!friend || !picked || held.current) return;
    held.current = true;
    const mine = ++tryNo.current;
    setHolding("sent");
    setProblem(null);
    // No answer in a minute is a failure on our end, said in its words, and the keypad takes the PIN again (5.2, as every tap's).
    const giveUp = setTimeout(() => {
      if (tryNo.current !== mine) return;
      tryNo.current += 1;
      held.current = false;
      setHolding(null);
      setPin("");
      setProblem(WORDS.server);
    }, GIVE_UP_MS);
    const r = await attempt(() => enterFromHostAction(dareId, picked.position, friend.id, full));
    clearTimeout(giveUp);
    if ("ok" in r && r.ok) return setDone(friend);
    if (tryNo.current !== mine) return;
    setPin("");
    if ("locked" in r) {
      setHolding("leaving");
      setProblem("That PIN is paused for an hour.");
      setTimeout(leave, 1200);
      return;
    }
    held.current = false;
    setHolding(null);
    if ("wrong" in r) {
      const n = wrong + 1;
      setWrong(n);
      // Three wrong tries end the handoff, and nothing is said to anyone.
      if (n >= TRIES) return leave();
      return setProblem("That’s not it.");
    }
    setProblem(r.error);
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
        <button type="button" aria-label="Close" onClick={leave} data-press="line" className="-mr-2 inline-flex h-12 w-12 items-center justify-center rounded-pill text-ink press-line">
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
        <WhosJoining candidates={candidates} words={picked.words} host={host.name.split(/\s+/)[0] ?? host.name} empty={nobody} onPick={setFriend} onScan={() => setCodeOpen(true)} />
      ) : (
        <PinStep friend={friend} pin={pin} problem={problem} holding={holding !== null} counting={holding === "sent" && wait.pending} line={holding === "sent" ? wait.line : null} onKey={(k) => {
          const next = pinAfterKey(pin, k, held.current);
          setPin(next.pin);
          if (next.send) void send(next.pin);
        }} />
      )}
      <CodeSheet open={codeOpen} onClose={() => setCodeOpen(false)} dareId={dareId} url={url} question={question} mark={mark} />
    </>
  );
}

