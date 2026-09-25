"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ledger/avatar";
import {
  FIELD_PROBLEM_CLASS,
  Problem,
  ProblemSummary,
} from "@/components/ledger/problem";
import { signingProblem, useSigner } from "@/components/ledger/use-signer";
import { Button } from "@/components/ui/button";
import { PinnedSheet } from "@/components/ui/pinned-sheet";
import { RefreshWhile } from "@/components/ui/refresh-while";
import { Sheet } from "@/components/ui/sheet";
import {
  arbitrateAction,
  castVoteAction,
  sayWhatHappenedAction,
  stateCaseAction,
} from "@/lib/actions/markets";
import { daresTypes } from "@/lib/chain/typed-data";
import { countWord } from "@/lib/ledger/weight";
import type { Hue } from "@/lib/ui/hue";
import { cn } from "@/lib/utils";
import type { Signing } from "./market-actions";

export type Word = "yes" | "no" | "void";
const LABEL: Record<Word, string> = {
  yes: "Yes",
  no: "No",
  void: "Nobody can tell",
};
const SAID: Record<Word, string> = {
  yes: "yes",
  no: "no",
  void: "nobody can tell",
};
const WORDS: Word[] = ["yes", "no", "void"];
const VOID = (1n << 256n) - 1n;

export type CallSheetProps = {
  dareId: string;
  signing: Signing;
  threshold: number;
  quorum: number;
  me: { name: string; hue: Hue };
  myVote: Word | null;
  /** Who has said what, in the order they said it. The first is the claimant. */
  votes: Array<{ name: string; hue: Hue; outcome: Word }>;
  /** What happened, in each person's words. */
  statements: Array<{ name: string; said: string }>;
  /** The app's read of it, where there is one: the claim when nobody has said anything yet, a caption otherwise. */
  proposal: {
    outcome: Word | null;
    line: string;
    rationale: string | null;
  } | null;
  /** An argument whose read is on its way: the screen re-reads itself for a minute. */
  awaitingProposal: boolean;
  /** Under the arbitrate rule, once the vote is split: the cases, and whether the app may be asked yet. */
  split: {
    cases: Array<{ name: string; said: string }>;
    mine: string | null;
    canAsk: boolean;
    line: string;
  } | null;
};

/**
 * The sheet on a locked market (docs/design.md 3.24): whose move it is, and the move. Not yet known: say what
 * happened, as two equal wells. Voting, not said: the count line, the chalk agree and "Not how I saw it".
 * Voting, said: one line and Change. Split: add what you saw, and the tiebreaker everyone agreed to going in.
 *
 * A vote binds everyone in the market, so casting one still gets the app's own short modal sheet on top: pick,
 * then say so, with the second of the person's two keys, the one the app never holds.
 */
export function CallSheet(props: CallSheetProps) {
  const { dareId, signing, threshold, quorum, votes, myVote, proposal } = props;
  const router = useRouter();
  const sign = useSigner();
  const [pick, setPick] = useState<Word | null>(null);
  const [picking, setPicking] = useState(false);
  const [raised, setRaised] = useState(false);
  const [line, setLine] = useState("");
  const [choice, setChoice] = useState<Word | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // The tally, and the claim: what the most people have said, or, before anyone has, what the app read.
  const by = new Map<Word, number>();
  for (const v of votes) by.set(v.outcome, (by.get(v.outcome) ?? 0) + 1);
  const tally = Array.from(by, ([outcome, n]) => ({ outcome, n })).sort(
    (a, b) => b.n - a.n,
  );
  const leading = tally[0] ?? null;
  const claim: Word | null = leading?.outcome ?? proposal?.outcome ?? null;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const countLine = !leading
    ? null
    : tally.length === 1
      ? `${leading.n} of ${quorum} ${leading.n === 1 ? "has" : "have"} said ${SAID[leading.outcome]}.${leading.n < threshold ? ` ${cap(countWord(threshold - leading.n))} more and it settles.` : ""}`
      : `${tally.map((t) => `${t.n} ${t.n === 1 ? "says" : "say"} ${SAID[t.outcome]}`).join(", ")}. It takes ${threshold} agreeing.`;

  async function cast(outcome: Word) {
    setProblem(null);
    setBusy(true);
    try {
      const signature = await sign(
        signing.governanceWallet,
        {
          domain: signing.domain,
          types: daresTypes,
          primaryType: "Vote",
          message: {
            dareId: signing.dareOnchainId,
            outcome: outcome === "yes" ? 1n : outcome === "no" ? 0n : VOID,
          },
        },
        "vote",
      );
      const r = await castVoteAction(dareId, outcome, signature);
      if ("error" in r) return setProblem(r.error);
      setChoice(null);
      setPick(null);
      setPicking(false);
      setRaised(false);
      router.refresh();
    } catch (err) {
      setProblem(signingProblem(err));
    } finally {
      setBusy(false);
    }
  }

  /** The claim: what happened, in a line if there is one, then the vote that goes with it. */
  async function say() {
    if (!pick) return;
    setProblem(null);
    if (line.trim().length >= 2) {
      setBusy(true);
      const r = await sayWhatHappenedAction(dareId, line);
      setBusy(false);
      if ("error" in r) return setProblem(r.error);
    }
    setChoice(pick);
  }

  const modal = (
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
            <h2 id="call-it-title" className="text-serif-l text-ink">
              {LABEL[choice]}.
            </h2>
          </div>
          <p className="text-body-sm text-ink-2">
            This one counts for everyone in it, not just you. It’s decided once{" "}
            {threshold} of you say the same thing, and you can change yours
            until then. Nobody can say it for you, and the app can’t either.
          </p>
          <ProblemSummary messages={[problem]} />
          <div className="flex flex-col gap-1">
            <Button
              variant="primary"
              data-autofocus
              onClick={() => cast(choice)}
              loading={busy}
            >
              Call it {SAID[choice]}
            </Button>
            <Button
              variant="tertiary"
              onClick={() => setChoice(null)}
              disabled={busy}
            >
              Not yet
            </Button>
          </div>
        </>
      ) : null}
    </Sheet>
  );

  const others = (except: Word | null) => (
    <div className="flex flex-col gap-2">
      {WORDS.filter((w) => w !== except).map((w) => (
        <Button key={w} variant="secondary" onClick={() => setChoice(w)}>
          {LABEL[w]}
        </Button>
      ))}
      <Button variant="tertiary" onClick={() => setPicking(false)}>
        Never mind
      </Button>
    </div>
  );

  const whoSaidWhat = (
    <div className="flex flex-col gap-2">
      {votes.map((v, i) => (
        <p key={i} className="flex items-center gap-2 text-body-sm text-ink-2">
          <Avatar name={v.name} hue={v.hue} size={22} />
          <span>
            <span className="text-ink">{v.name}</span> said {SAID[v.outcome]}
          </span>
        </p>
      ))}
      {props.statements.map((s, i) => (
        <p key={`s${i}`} className="text-body-sm text-ink-2">
          <span className="text-ink">{s.name}:</span> {s.said}
        </p>
      ))}
      {proposal?.rationale ? (
        <p className="text-caption text-ink-3">
          {proposal.line} {proposal.rationale}
        </p>
      ) : null}
    </div>
  );

  // Not yet known: nobody has said anything, and the app has nothing to say either.
  if (myVote === null && claim === null) {
    return (
      <>
        <PinnedSheet
          label="Say what happened"
          raised={raised}
          onRaise={setRaised}
          header={
            <p className="text-body-strong text-ink">
              When it’s clear, say what happened.
            </p>
          }
          low={
            <>
              <div
                role="group"
                aria-label="What happened"
                className="grid grid-cols-2 gap-2"
              >
                {(["yes", "no"] as const).map((w) => (
                  <Button
                    key={w}
                    variant="secondary"
                    size="primary"
                    aria-pressed={pick === w}
                    className={cn(pick === w && "border-ink text-ink")}
                    onClick={() => {
                      setPick(w);
                      setRaised(true);
                    }}
                  >
                    {LABEL[w]}
                  </Button>
                ))}
              </div>
              <Button variant="tertiary" onClick={() => setChoice("void")}>
                Nobody can tell
              </Button>
              {props.awaitingProposal ? (
                <p className="text-caption text-ink-3">
                  The app is weighing it up. You don’t have to wait for it.
                  <RefreshWhile />
                </p>
              ) : null}
            </>
          }
          high={
            <div className="flex flex-col gap-2">
              <label htmlFor="what-happened" className="text-label text-ink-3">
                What happened?
              </label>
              <input
                id="what-happened"
                value={line}
                onChange={(e) => setLine(e.target.value)}
                maxLength={280}
                placeholder="Out cold by the second act"
                className="h-12 rounded-button border border-line bg-ground px-4 text-body text-ink placeholder:text-ink-3"
              />
            </div>
          }
          foot={
            <>
              <ProblemSummary messages={[choice === null ? problem : null]} />
              <Button
                variant="primary"
                onClick={say}
                loading={busy && choice === null}
                disabled={pick === null}
              >
                {pick ? `Say it: ${SAID[pick]}` : "Pick what happened"}
              </Button>
            </>
          }
        />
        {modal}
      </>
    );
  }

  // Voting, not said: the claim, the count, the chalk agree, and the other way of seeing it.
  if (myVote === null && claim !== null) {
    return (
      <>
        <PinnedSheet
          label="Call it"
          raised={raised}
          onRaise={setRaised}
          header={
            <p className="text-body-strong text-ink">
              {countLine ?? proposal?.line}
            </p>
          }
          low={
            picking ? (
              others(claim)
            ) : (
              <>
                <ProblemSummary messages={[choice === null ? problem : null]} />
                <Button variant="primary" onClick={() => setChoice(claim)}>
                  {LABEL[claim]}, that’s right
                </Button>
                <Button variant="secondary" onClick={() => setPicking(true)}>
                  Not how I saw it
                </Button>
              </>
            )
          }
          high={whoSaidWhat}
        />
        {modal}
      </>
    );
  }

  // Said, and the vote is not split (or the rule is void): one line, and Change.
  const said = myVote as Word;
  const saidLine = (
    <div className="flex items-center gap-3">
      <Avatar name={props.me.name} hue={props.me.hue} size={28} />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-body-strong text-ink">You said {SAID[said]}</p>
        {countLine ? (
          <p className="text-caption text-ink-3">{countLine}</p>
        ) : null}
      </div>
      {!picking ? (
        <Button variant="tertiary" onClick={() => setPicking(true)}>
          Change
        </Button>
      ) : null}
    </div>
  );
  if (!props.split) {
    return (
      <>
        <PinnedSheet
          label="Your call"
          low={
            picking ? (
              <>
                {saidLine}
                {others(said)}
              </>
            ) : (
              saidLine
            )
          }
        />
        {modal}
      </>
    );
  }
  return (
    <>
      <PinnedSheet
        label="Can’t agree"
        raised={raised}
        onRaise={setRaised}
        header={<p className="text-body-strong text-ink">Can’t agree?</p>}
        low={
          picking ? (
            <>
              {saidLine}
              {others(said)}
            </>
          ) : (
            <>
              {saidLine}
              <CaseForm dareId={dareId} mine={props.split.mine} />
              <Ask
                dareId={dareId}
                canAsk={props.split.canAsk}
                line={props.split.line}
              />
            </>
          )
        }
        high={
          <>
            {props.split.cases.length
              ? props.split.cases.map((c, i) => (
                  <p key={i} className="text-body-sm text-ink-2">
                    <span className="text-ink">{c.name}:</span> {c.said}
                  </p>
                ))
              : null}
            {whoSaidWhat}
          </>
        }
      />
      {modal}
    </>
  );
}

/** One line of a case for the tiebreaker: a different kind from "what happened", handed to the arbitrator labelled. */
function CaseForm({ dareId, mine }: { dareId: string; mine: string | null }) {
  const router = useRouter();
  const [text, setText] = useState(mine ?? "");
  const [saved, setSaved] = useState(Boolean(mine));
  const [field, setField] = useState<string | null>(null);
  const [saving, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-2"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setField(null);
        if (text.trim().length < 2) return setField("Say your side in a line.");
        start(async () => {
          const r = await stateCaseAction(dareId, text);
          if ("error" in r) return setField(r.error);
          setSaved(true);
          router.refresh();
        });
      }}
    >
      <label htmlFor="my-case" className="text-label text-ink-3">
        Add what you saw
      </label>
      <div className="flex gap-2">
        <input
          id="my-case"
          value={text}
          onChange={(e) => (setText(e.target.value), setSaved(false))}
          maxLength={280}
          placeholder="The sign said 8,558 feet"
          aria-invalid={field ? true : undefined}
          aria-describedby={field ? "my-case-problem" : undefined}
          className={cn(
            "h-12 min-w-0 flex-1 rounded-button border border-line bg-ground px-4 text-body text-ink placeholder:text-ink-3",
            field && FIELD_PROBLEM_CLASS,
          )}
        />
        <Button
          type="submit"
          variant="secondary"
          loading={saving}
          disabled={saved}
        >
          {saved ? "Saved" : "Save"}
        </Button>
      </div>
      <Problem id="my-case-problem" message={field} />
    </form>
  );
}

/**
 * Asking the tiebreaker everyone agreed to going in. It ends the vote for everyone, so it gets the deliberate
 * moment a vote gets; before its time, the line says when it can be asked.
 */
function Ask({
  dareId,
  canAsk,
  line,
}: {
  dareId: string;
  canAsk: boolean;
  line: string;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [hearing, start] = useTransition();
  if (!canAsk) return <p className="text-caption text-ink-3">{line}</p>;
  return (
    <>
      <Button variant="primary" onClick={() => setAsking(true)}>
        Let the tiebreaker call it
      </Button>
      <Sheet
        open={asking}
        labelledBy="hear-it-title"
        onClose={() => (hearing ? undefined : setAsking(false))}
      >
        <div className="flex flex-col gap-2">
          <p className="text-label text-ink-3">
            You’re asking for the tiebreaker
          </p>
          <h2 id="hear-it-title" className="text-serif-l text-ink">
            That ends the vote.
          </h2>
        </div>
        <p className="text-body-sm text-ink-2">
          Everyone in it agreed to this going in. It reads the terms, what
          everyone put in, what people said happened, and each side’s case, and
          writes down how it came out and why. That counts for everyone, and it
          can’t be undone. If the terms turn out not to settle it, it’s called
          off and nothing changes hands.
        </p>
        <ProblemSummary messages={[problem]} />
        <div className="flex flex-col gap-1">
          <Button
            variant="primary"
            data-autofocus
            loading={hearing}
            onClick={() =>
              start(async () => {
                setProblem(null);
                const r = await arbitrateAction(dareId);
                if ("error" in r) return setProblem(r.error);
                setAsking(false);
                router.refresh();
              })
            }
          >
            Call it
          </Button>
          <Button
            variant="tertiary"
            onClick={() => setAsking(false)}
            disabled={hearing}
          >
            Not yet
          </Button>
          {hearing ? (
            <p className="text-center text-caption text-ink-3">
              Reading both sides. About half a minute.
            </p>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
