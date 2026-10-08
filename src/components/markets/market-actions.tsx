"use client";

import { attempt } from "@/lib/ui/attempt";
import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TypedDataDomain } from "viem";
import type { CreateFields } from "@/lib/chain/typed-data";
import { Button } from "@/components/ui/button";
import { ProblemSummary } from "@/components/ledger/problem";
import { Sheet } from "@/components/ui/sheet";
import { Avatar } from "@/components/ledger/avatar";
import { callsAreInAction, itHappenedAction, lockMarketAction, takeBackCallsAction } from "@/lib/actions/markets";
import { CALLS_ARE_IN, IT_HAPPENED } from "@/lib/ui/copy";
import { callsLine, LEAVES_OUT, STUCK_LINE, WAITING_LINE, WAITING_ON_SCORE } from "@/lib/ui/calls-words";
import type { Hue } from "@/lib/ui/hue";
import { PinnedSheet } from "@/components/ui/pinned-sheet";
import { WORDS } from "@/lib/ui/errors";
import { hashAsksFor, useHash } from "@/lib/ui/hash";

/** Everything a browser needs to build the typed data a person signs. Bigints travel as strings. */
export type Signing = {
  domain: TypedDataDomain;
  dareOnchainId: `0x${string}`;
  stalemate: 0 | 1;
  ledgerWallet: string;
  governanceWallet: string;
  /** What an entry carries as confidence: everything on a pick-one market (3.30), nothing on the other two kinds. The same figure the server signs against. */
  confidenceBps: number;
  /** Present only for the creator of a draft: the Create message, every field final. */
  create?: CreateFields;
  /** The same message over the question's own group, which every entry signs beside its Enter (the games-and-the-reveal round): present while it can be entered. */
  question?: CreateFields;
};

export type StakeUnit = { monetary: boolean; quantifiable: boolean; singular: string; plural: string };

/**
 * The asker's close (3.42; the games-and-the-reveal round, 2026-10-07): "Close it with 4", a secondary that asks once
 * while the close is still ahead, because closing early leaves out whoever hasn't got in yet and binds everyone else;
 * the chalk, without asking, once the market is stuck past its close time. Closing early locks the market as its
 * close would.
 */
export function LockButton({ dareId, count, ask, variant }: { dareId: string; count: number; /** Ask once before closing: the close is still ahead, so it leaves out whoever isn't in yet. */ ask: boolean; variant: "primary" | "secondary" }) {
  const router = useRouter();
  const titleId = useId();
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  // A row on Now that says Close lands here with the ask open (the field round, 1.5): the address asks for it.
  const hash = useHash();
  useEffect(() => {
    if (!(hashAsksFor(hash, "close") && count >= 2 && ask)) return;
    // The ask opens on the next frame, once the screen has landed.
    const frame = requestAnimationFrame(() => setAsking(true));
    return () => cancelAnimationFrame(frame);
  }, [hash, count, ask]);
  const close = () =>
    start(async () => {
      setProblem(null);
      const r = await attempt(() => lockMarketAction(dareId));
      if ("error" in r) {
        setProblem(r.error);
        // Closed or decided under the person: the screen is read again, and the words say so (1.6).
        if (r.error === WORDS.changed) router.refresh();
      } else {
        setAsking(false);
        router.refresh();
      }
    });
  return (
    <div className="flex flex-col gap-3">
      <ProblemSummary messages={[asking ? null : problem]} />
      <Button variant={variant} loading={pending && !asking} disabled={count < 2} onClick={() => (ask ? setAsking(true) : close())} data-close-early="">
        {count < 2 ? "It takes two to close it" : `Close it with ${count}`}
      </Button>
      <Sheet open={asking} onClose={() => setAsking(false)} labelledBy={titleId}>
        <h2 id={titleId} className="text-body-strong text-ink">
          Close it with {count}?
        </h2>
        <div className="flex flex-col gap-4" data-close-early-ask="">
          <p className="text-body-sm text-ink-2">{LEAVES_OUT}</p>
          <ProblemSummary messages={[problem]} />
          <Button variant="primary" loading={pending} onClick={close}>
            Close it now
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => setAsking(false)}>
            Keep it open
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

/** "Calls are in" and "Take it back" (3.24, 3.42): the same 48px secondary, which adds this person's name or takes it off. */
function CallsButton({ dareId, said }: { dareId: string; said: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const press = () =>
    start(async () => {
      setProblem(null);
      const r = await attempt(() => (said ? takeBackCallsAction(dareId) : callsAreInAction(dareId)));
      if ("error" in r) setProblem(r.error);
      router.refresh();
    });
  return (
    <div className="flex flex-col gap-3">
      <ProblemSummary messages={[problem]} />
      <Button variant="secondary" loading={pending} onClick={press} data-calls-are-in={said ? "said" : ""}>
        {said ? "Take it back" : CALLS_ARE_IN}
      </Button>
    </div>
  );
}

/**
 * The close, in the sheet (docs/design.md 3.24, 3.42; the games-and-the-reveal round, 2026-10-07): for everyone in an
 * open market with two or more in. Resting, one line and one button. The line names who has said calls are in, their
 * avatars leading it, and who it closes on, never as a count (`callsLine`). The button: for the asker "Close it with
 * N", a secondary that asks once; for everyone else "Calls are in", a secondary that adds their name, or "Take it
 * back" once they have, and the market closes when as many of the people in have said it as it takes to settle a
 * vote; once it is stuck past its close time, the chalk "Close it with N" for anyone in. While the asker is the only
 * one in there is no close: share is the chalk on the who's-in row. The entry sheet takes its place while someone is
 * changing their own entry (`MarketStage`).
 */
export function CloseSheet({ dareId, count, asker, stuck, sayers, could, need, meSaid }: { dareId: string; count: number; asker: boolean; stuck: boolean; /** Whoever has said calls are in, oldest first, the viewer as "You" in the line and by their own name on their avatar. */ sayers: Array<{ name: string; avatarName?: string; hue: Hue; ghost: boolean }>; /** The people in who could still say so, by first name, the viewer as "you". */ could: string[]; /** How many more it takes. */ need: number; meSaid: boolean }) {
  const line = stuck ? STUCK_LINE : callsLine({ said: sayers.map((p) => p.name), could, need, asker });
  return (
    <PinnedSheet
      label="Close it"
      low={
        <>
          <div className="flex items-center gap-2">
            {!stuck && sayers.length > 0 ? (
              <span className="flex shrink-0 items-center" data-sayers={sayers.length}>
                {sayers.slice(0, 4).map((p, i) => (
                  <span key={i} className={i > 0 ? "-ml-[6px]" : undefined}>
                    <Avatar name={p.avatarName ?? p.name} hue={p.hue} size={24} ring="var(--surface)" ghost={p.ghost} />
                  </span>
                ))}
              </span>
            ) : null}
            <p className="text-body-sm text-ink-2" data-close-line={stuck ? "main" : "secondary"} {...(stuck ? { "data-stuck-line": "" } : {})}>
              {line}
            </p>
          </div>
          {stuck || asker ? <LockButton dareId={dareId} count={count} ask={!stuck} variant={stuck ? "primary" : "secondary"} /> : <CallsButton dareId={dareId} said={meSaid} />}
        </>
      }
    />
  );
}

/**
 * Calls are in (docs/design.md 3.24; the games-and-the-reveal round, 2026-10-07): from the close until it has happened
 * nothing is anyone's move, and the sheet rests on one line and "It's happened", the same 48px secondary as "Calls are
 * in", which opens the vote for everyone at once. On a question the final score answers, the line is 3.35's and there
 * is nothing to tap. The sheet keeps its handle like every sheet.
 */
export function CallsAreInSheet({ dareId, byScore }: { dareId: string; byScore: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const say = () =>
    start(async () => {
      setProblem(null);
      const r = await attempt(() => itHappenedAction(dareId));
      if ("error" in r) setProblem(r.error);
      router.refresh();
    });
  return (
    <PinnedSheet
      label={CALLS_ARE_IN}
      low={
        <>
          <p className="text-body-sm text-ink-2" data-waiting-line={byScore ? "score" : ""}>
            {byScore ? WAITING_ON_SCORE : WAITING_LINE}
          </p>
          <ProblemSummary messages={[problem]} />
          {byScore ? null : (
            <Button variant="secondary" loading={pending} onClick={say} data-it-happened="">
              {IT_HAPPENED}
            </Button>
          )}
        </>
      }
    />
  );
}
