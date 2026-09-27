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
import { attachEvidenceAction } from "@/lib/actions/media";
import { daresTypes } from "@/lib/chain/typed-data";
import { shrinkPhoto } from "@/lib/ui/shrink-photo";
import { countWord } from "@/lib/ledger/weight";
import { unitPhrase } from "@/lib/ledger/number-axis";
import { lowerFirst } from "@/lib/ui/outcome-words";
import { saidAnswer } from "@/lib/ledger/pick-one";
import type { Hue } from "@/lib/ui/hue";
import { cn } from "@/lib/utils";
import type { Signing } from "./market-actions";
import { NumberEntry } from "./number-entry";
import { TeamLine } from "./team-line";
import type { TeamFace } from "@/lib/ui/team";
import type { PickOneAnswer } from "./pick-one-bars";

/** What a vote names: yes, no, nobody can tell, "n:" and the whole number on a number question, or "a:" and the answer's index on a pick-one question. */
export type Word = "yes" | "no" | "void" | `n:${string}` | `a:${string}`;
type Unit = { singular: string; plural: string; margin?: { shift: string; home: string; away: string } | null } | null;
type Answers = PickOneAnswer[] | null;
/** The market's outcomes in its own words (3.25): the wells, or null for "Yes" and "No". */
export type Wells = { yes: string; no: string } | null;
const isNumber = (w: Word): w is `n:${string}` => w.startsWith("n:");
const isAnswer = (w: Word): w is `a:${string}` => w.startsWith("a:");
const numberOf = (w: Word): bigint => BigInt(w.slice(2));
const answerOf = (w: Word, answers: Answers): PickOneAnswer | null => (isAnswer(w) ? (answers?.find((a) => a.index === Number(w.slice(2))) ?? null) : null);
/** "He fell asleep", "Yes", "No", "Nobody can tell", "14 shirts", "Priya". */
const labelWith = (w: Word, unit: Unit, wells: Wells, answers: Answers): string => (w === "yes" ? (wells?.yes ?? "Yes") : w === "no" ? (wells?.no ?? "No") : w === "void" ? "Nobody can tell" : isAnswer(w) ? (answerOf(w, answers)?.text ?? "That one") : unit ? unitPhrase(numberOf(w), unit) : w.slice(2));
/** "he fell asleep", "yes", "no", "nobody can tell", "14 shirts", "Priya", "a field goal", for the middle of a sentence. */
const saidWith = (w: Word, unit: Unit, wells: Wells, answers: Answers): string => {
  if (isAnswer(w)) {
    const a = answerOf(w, answers);
    return a ? (a.text === "You" ? "you" : saidAnswer({ text: a.text, userId: a.person ? "person" : null })) : "that one";
  }
  return w === "yes" ? (wells ? lowerFirst(wells.yes) : "yes") : w === "no" ? (wells ? lowerFirst(wells.no) : "no") : w === "void" ? "nobody can tell" : unit ? unitPhrase(numberOf(w), unit) : w.slice(2);
};
/** The bare number in a count line ("3 of 6 have said 14."), the unit having been said once already; an answer keeps its words. */
const bareWith = (w: Word, unit: Unit, wells: Wells, answers: Answers): string => (isNumber(w) ? numberOf(w).toLocaleString("en-US") : isAnswer(w) ? labelWith(w, unit, wells, answers) : saidWith(w, unit, wells, answers));
const WORDS: Word[] = ["yes", "no", "void"];
const VOID = (1n << 256n) - 1n;
const outcomeOf = (w: Word): bigint => (w === "yes" ? 1n : w === "no" ? 0n : w === "void" ? VOID : isAnswer(w) ? BigInt(w.slice(2)) : numberOf(w));

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
  /** Everything attached while it is being called, each with who supplied it: everyone voting sees it (3.24). */
  evidence?: Array<{ id: string; by: string }>;
  /** The outcomes in the market's own words (3.25), or null for "Yes" and "No". */
  wells?: Wells;
  /** Whether this person has a line on the record with no vote yet ("You added a note", 3.24). */
  myNote?: boolean;
  /** The app's read of it, where there is one: the claim when nobody has said anything yet, a caption otherwise. */
  proposal: {
    outcome: Word | null;
    line: string;
    rationale: string | null;
  } | null;
  /** An argument whose read is on its way: the screen re-reads itself for a minute. */
  awaitingProposal: boolean;
  /** A number question: what the number counts, and on a signed margin its shift and the two sides. The sheet then takes a number where it took yes or no (3.24). */
  numberUnit?: { singular: string; plural: string; margin?: { shift: string; home: string; away: string } | null } | null;
  /**
   * A What's on question the final score answers (3.35): before the score is in, the sheet waits on it ("The final
   * score will propose what happened.") and offers "Say it yourself" only two hours past the game's expected end;
   * a tie the contract cannot score is said and never put to a vote, since the final score voids it with no toll.
   */
  feed?: { source: "score" | "plays"; waiting: boolean; canSayYourself: boolean; tie: string | null } | null;
  /** A pick-one question: the answers, in the asker's order. The sheet then takes an answer where it took yes or no (3.24). */
  answers?: PickOneAnswer[] | null;
  /** Between two teams (3.40): the two stamps for the margin's line, and its reach. */
  teams?: { away: TeamFace; home: TeamFace; reach: number } | null;
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
  const unit = props.numberUnit ?? null;
  const wells = props.wells ?? null;
  const answers = props.answers ?? null;
  const label = (w: Word, u: Unit) => labelWith(w, u, wells, answers);
  const said = (w: Word, u: Unit) => saidWith(w, u, wells, answers);
  const bare = (w: Word, u: Unit) => bareWith(w, u, wells, answers);
  const router = useRouter();
  const sign = useSigner();
  const [pick, setPick] = useState<Word | null>(null);
  /** The number typed on a number question: the claim, or the number a dissenter saw. */
  const [typed, setTyped] = useState<bigint | null>(null);
  const [picking, setPicking] = useState(false);
  const [raised, setRaised] = useState(false);
  const [line, setLine] = useState("");
  // "Say it yourself" (3.35): the feed is late or has nothing, and a person opens the ordinary claim.
  const [sayingItMyself, setSayingItMyself] = useState(false);
  const feed = props.feed ?? null;
  // Up to three photos or screenshots with the claim (3.24): evidence, seen by everyone voting, read by the model as this person's claim.
  const [shots, setShots] = useState<Array<{ file: File; preview: string }>>([]);
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
  // The count line (3.24): "3 of 6 have said yes. Two more and it settles."; on a pick-one question it names the answer ("3 of 6 say Priya."),
  // and when votes split it names the answer nearest to settling ("3 say Priya, 1 says John. Two more for Priya and it settles.").
  const countLine = !leading
    ? null
    : tally.length === 1
      ? `${leading.n} of ${quorum} ${answers ? (leading.n === 1 ? "says" : "say") : leading.n === 1 ? "has said" : "have said"} ${bare(leading.outcome, unit)}.${leading.n < threshold ? ` ${cap(countWord(threshold - leading.n))} more and it settles.` : ""}`
      : answers
        ? `${tally.map((t) => `${t.n} ${t.n === 1 ? "says" : "say"} ${bare(t.outcome, unit)}`).join(", ")}.${leading.n < threshold ? ` ${cap(countWord(threshold - leading.n))} more for ${bare(leading.outcome, unit)} and it settles.` : ""}`
        : `${tally.map((t) => `${t.n} ${t.n === 1 ? "says" : "say"} ${bare(t.outcome, unit)}`).join(", ")}. It takes ${threshold} agreeing.`;

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
            outcome: outcomeOf(outcome),
          },
        },
        "vote",
      );
      const r = await castVoteAction(dareId, outcome, signature);
      if ("error" in r) return setProblem(r.error);
      setChoice(null);
      setPick(null);
      setTyped(null);
      setPicking(false);
      setRaised(false);
      router.refresh();
    } catch (err) {
      setProblem(signingProblem(err));
    } finally {
      setBusy(false);
    }
  }

  /** The stored form of a typed number: a signed margin is shifted up by half its scale before it goes anywhere. */
  const stored = (n: bigint): bigint => (unit?.margin ? n + BigInt(unit.margin.shift) : n);
  /** The claim: what happened, in a line if there is one, then the vote that goes with it. */
  async function say() {
    const call: Word | null = unit ? (typed !== null ? `n:${stored(typed).toString()}` : null) : pick;
    setProblem(null);
    if (line.trim().length >= 2 || shots.length > 0) {
      setBusy(true);
      const form = new FormData();
      form.set("dareId", dareId);
      form.set("text", line);
      for (const s of shots) form.append("attachment", await shrinkPhoto(s.file), "attachment.jpg");
      const r = await sayWhatHappenedAction(form);
      setBusy(false);
      if ("error" in r) return setProblem(r.error);
      setShots([]);
    }
    // On a number question the number a dissenter saw is optional (3.24): words alone go on the record and cast nothing.
    if (!call) {
      setPicking(false);
      setRaised(false);
      setLine("");
      router.refresh();
      return;
    }
    setChoice(call);
  }
  /** The number field with the line under it, for the claim and for a dissenter (3.24); the side and the figure on a signed margin. */
  const numberPanel = unit ? (
    unit.margin ? (
      // The margin (3.40): the same line between the two teams the entry used, centred on a tie; never below the field's floor.
      <TeamLine mode="margin" value={typed === null ? null : Number(typed)} away={props.teams?.away ?? { abbr: unit.margin.away.slice(0, 3).toUpperCase(), name: unit.margin.away, color: null }} home={props.teams?.home ?? { abbr: unit.margin.home.slice(0, 3).toUpperCase(), name: unit.margin.home, color: null }} reach={props.teams?.reach ?? 35} unit={unit} hue={props.me.hue} disabled={busy} onChange={(v) => setTyped(BigInt(v) < -BigInt((unit.margin as { shift: string }).shift) ? -BigInt((unit.margin as { shift: string }).shift) : BigInt(v))} />
    ) : (
      <NumberEntry header={null} label="What it was" value={typed} unit={unit} hue={props.me.hue} disabled={busy} onChange={(v) => setTyped(v)} />
    )
  ) : null;
  /** "It was Giants by 7", "It was 14 shirts": the typed number in the unit's words. */
  const typedWords = (n: bigint) => (unit ? unitPhrase(stored(n), unit) : "");

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
              {label(choice, unit)}.
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
              {(wells && (choice === "yes" || choice === "no")) || isAnswer(choice) ? `Say it: ${said(choice, unit)}` : `Call it ${said(choice, unit)}`}
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

  const others = (except: Word | null) =>
    answers ? (
      // Not how I saw it, on a pick-one question (3.24): "What did you see?", the other answers as rows, a dashed "I couldn't tell", and Never mind.
      <div className="flex flex-col gap-2">
        <p className="text-label text-ink-3">What did you see?</p>
        {answers
          .filter((a) => `a:${a.index}` !== except)
          .map((a) => (
            <Button key={a.index} variant="secondary" className="justify-start gap-3" onClick={() => setChoice(`a:${a.index}`)}>
              {a.person ? <Avatar name={a.person.name} hue={a.person.hue} size={24} /> : null}
              <span className="min-w-0 flex-1 truncate text-left">{a.text}</span>
            </Button>
          ))}
        <Button variant="secondary" className="border-dashed" onClick={() => setChoice("void")}>
          I couldn’t tell
        </Button>
        <Button variant="tertiary" onClick={() => setPicking(false)}>
          Never mind
        </Button>
      </div>
    ) : unit ? (
      // Not how I saw it, on a number question: the field, the line, and the number is optional.
      <div className="flex flex-col gap-3">
        {numberPanel}
        <div className="flex flex-col gap-2">
          <label htmlFor="what-happened-2" className="text-label text-ink-3">
            What happened?
          </label>
          <input id="what-happened-2" value={line} onChange={(e) => setLine(e.target.value)} maxLength={280} className="h-12 rounded-button border border-line bg-ground px-4 text-body text-ink placeholder:text-ink-3" />
        </div>
        <ProblemSummary messages={[choice === null ? problem : null]} />
        <Button variant="primary" onClick={say} loading={busy && choice === null} disabled={typed === null}>
          {typed !== null ? `It was ${typedWords(typed)}` : "Type what it was"}
        </Button>
        {typed === null ? (
          // A dissent without a number is a note on the record and never a vote (3.24).
          <>
            <Button variant="tertiary" onClick={say} loading={busy && choice === null} disabled={line.trim().length < 2}>
              Add a note instead
            </Button>
            <p className="text-caption text-ink-3">A note goes on the record. Only a number counts toward settling it.</p>
          </>
        ) : null}
        <Button variant="tertiary" onClick={() => setChoice("void")}>
          Nobody can tell
        </Button>
        <Button variant="tertiary" onClick={() => (setPicking(false), setTyped(null))}>
          Never mind
        </Button>
      </div>
    ) : (
    <div className="flex flex-col gap-2">
      {WORDS.filter((w) => w !== except).map((w) => (
        <Button key={w} variant="secondary" onClick={() => setChoice(w)}>
          {label(w, unit)}
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
            <span className="text-ink">{v.name}</span> said {said(v.outcome, unit)}
          </span>
        </p>
      ))}
      {props.statements.map((s, i) => (
        <p key={`s${i}`} className="text-body-sm text-ink-2">
          <span className="text-ink">{s.name}:</span> {s.said}
        </p>
      ))}
      {props.evidence?.length ? <Attached evidence={props.evidence} /> : null}
      {myVote !== null || claim !== null ? <AttachMore dareId={dareId} /> : null}
      {proposal?.rationale ? (
        <p className="text-caption text-ink-3">
          {proposal.line} {proposal.rationale}
        </p>
      ) : null}
    </div>
  );

  // A tie the contract cannot score (3.35; docs/decisions.md, public markets): said, never put to a vote.
  if (myVote === null && claim === null && feed?.tie) {
    return (
      <PinnedSheet
        label="The final score"
        header={<p className="text-body-strong text-ink">A tie.</p>}
        low={<p className="text-body-sm text-ink-2">{feed.tie}</p>}
      />
    );
  }
  // Closed, waiting on the score (3.35): the final score will propose what happened; two hours past the game's
  // expected end, "Say it yourself" opens the ordinary claim in case the feed is late or has nothing.
  if (myVote === null && claim === null && feed?.waiting && !sayingItMyself) {
    return (
      <PinnedSheet
        label={feed.source === "plays" ? "Waiting on the play-by-play" : "Waiting on the score"}
        header={<p className="text-body-strong text-ink">{feed.source === "plays" ? "The play-by-play will propose what happened." : "The final score will propose what happened."}</p>}
        low={
          feed.canSayYourself ? (
            <Button variant="tertiary" className="self-start" onClick={() => setSayingItMyself(true)}>
              Say it yourself
            </Button>
          ) : (
            <p className="text-caption text-ink-3">{feed.source === "plays" ? "Once the game has its play-by-play, the first drive goes on the ballot and everyone confirms it in a tap." : "Once the game is over, the score goes on the ballot and everyone confirms it in a tap."}</p>
          )
        }
      />
    );
  }

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
              {unit ? "When it’s clear, say what it was." : "When it’s clear, say what happened."}
            </p>
          }
          low={
            <>
              {answers ? (
                // The answers as equal wells, two across, each with its avatar where it has one (3.24); any of them opens the claim.
                <div role="group" aria-label="What happened" className="grid grid-cols-2 gap-2">
                  {answers.map((a) => (
                    <Button
                      key={a.index}
                      variant="secondary"
                      size="secondary"
                      aria-pressed={pick === `a:${a.index}`}
                      className={cn("justify-start gap-2 px-3", pick === `a:${a.index}` && "border-ink text-ink")}
                      onClick={() => {
                        setPick(`a:${a.index}`);
                        setRaised(true);
                      }}
                    >
                      {a.person ? <Avatar name={a.person.name} hue={a.person.hue} size={24} /> : null}
                      <span className="min-w-0 flex-1 truncate text-left">{a.text}</span>
                    </Button>
                  ))}
                </div>
              ) : unit ? (
                <div onFocusCapture={() => setRaised(true)}>{numberPanel}</div>
              ) : (
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
                    {label(w, unit)}
                  </Button>
                ))}
              </div>
              )}
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
                className="h-12 rounded-button border border-line bg-ground px-4 text-body text-ink placeholder:text-ink-3"
              />
              <AttachRow shots={shots} disabled={busy} onChange={setShots} />
            </div>
          }
          foot={
            <>
              <ProblemSummary messages={[choice === null ? problem : null]} />
              <Button
                variant="primary"
                onClick={say}
                loading={busy && choice === null}
                disabled={unit ? typed === null : pick === null}
              >
                {unit ? (typed !== null ? `It was ${typedWords(typed)}` : "Type what it was") : pick ? `Say it: ${said(pick, unit)}` : "Pick what happened"}
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
                {props.myNote ? <p className="text-caption text-ink-3">You added a note. Only a number counts toward settling it.</p> : null}
                <Button variant="primary" onClick={() => setChoice(claim)}>
                  {claim === "void" ? `${label(claim, unit)}, that’s right` : unit || answers || wells ? `That’s right, ${bare(claim, unit)}` : `${label(claim, unit)}, that’s right`}
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
  const mineWord = myVote as Word;
  const saidLine = (
    <div className="flex items-center gap-3">
      <Avatar name={props.me.name} hue={props.me.hue} size={28} />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-body-strong text-ink">You said {said(mineWord, unit)}</p>
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
                {others(mineWord)}
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
              {others(mineWord)}
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

type Shot = { file: File; preview: string };
const SHOTS_MAX = 3;

/**
 * The row to attach proof with the claim or a case (3.24): "Add a photo or a screenshot", the phone's library
 * first, up to three per person, each shown as a 44px square with a remove control before it goes anywhere.
 * Words on it are a control's, so the budget does not count them (4.8).
 */
function AttachRow({ shots, disabled, onChange }: { shots: Shot[]; disabled: boolean; onChange: (shots: Shot[]) => void }) {
  return (
    <div className="flex flex-col gap-2" data-attach-row="">
      {shots.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Attached, not yet sent">
          {shots.map((s, i) => (
            <li key={s.preview} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.preview} alt="" width={44} height={44} className="h-11 w-11 rounded-stamp-28 object-cover" />
              <button
                type="button"
                aria-label={`Remove attachment ${i + 1}`}
                disabled={disabled}
                onClick={() => {
                  URL.revokeObjectURL(s.preview);
                  onChange(shots.filter((x) => x !== s));
                }}
                className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-pill bg-ink text-ground"
              >
                <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {shots.length < SHOTS_MAX ? (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-button bg-surface-2 px-3 py-1 text-body-sm font-semibold text-ink">
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-2">
            <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.2-2h6.2l1.2 2h2.2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" />
            <circle cx="12" cy="13" r="3.4" />
          </svg>
          <span className="min-w-0 flex-1">{shots.length === 0 ? "Add a photo or a screenshot" : "Add another"}</span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={disabled}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []).slice(0, SHOTS_MAX - shots.length);
              e.target.value = "";
              onChange([...shots, ...files.map((f) => ({ file: f, preview: URL.createObjectURL(f) }))]);
            }}
          />
        </label>
      ) : null}
    </div>
  );
}

/** Anyone voting may attach too (3.24): the same row in the raised sheet, sending at once, with nothing else to say. */
function AttachMore({ dareId }: { dareId: string }) {
  const router = useRouter();
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  async function send() {
    setProblem(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.set("dareId", dareId);
      for (const s of shots) form.append("attachment", await shrinkPhoto(s.file), "attachment.jpg");
      const r = await attachEvidenceAction(form);
      if ("error" in r) return setProblem(r.error);
      setShots([]);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <AttachRow shots={shots} disabled={busy} onChange={setShots} />
      {shots.length > 0 ? (
        <>
          <ProblemSummary messages={[problem]} />
          <Button variant="secondary" onClick={send} loading={busy}>
            {shots.length === 1 ? "Attach it" : `Attach these ${shots.length}`}
          </Button>
        </>
      ) : null}
    </div>
  );
}

/** What has been attached so far, 44px each, with who supplied it: the thing the arbitrator will be told too. */
function Attached({ evidence }: { evidence: Array<{ id: string; by: string }> }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Attached">
      {evidence.map((e) => (
        <li key={e.id} className="flex items-center gap-2 text-caption text-ink-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- behind the door, a signed URL that expires */}
          <img src={`/api/media/${e.id}?size=thumb`} alt={`What ${e.by} attached`} width={44} height={44} loading="lazy" data-evidence={e.id} className="h-11 w-11 rounded-stamp-28 bg-surface-2 object-cover" />
          <span>{e.by}</span>
        </li>
      ))}
    </ul>
  );
}

/** One line of a case for the tiebreaker: a different kind from "what happened", handed to the arbitrator labelled. A screenshot may go with it. */
function CaseForm({ dareId, mine }: { dareId: string; mine: string | null }) {
  const router = useRouter();
  const [text, setText] = useState(mine ?? "");
  const [saved, setSaved] = useState(Boolean(mine));
  const [shots, setShots] = useState<Shot[]>([]);
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
          if (shots.length > 0) {
            const form = new FormData();
            form.set("dareId", dareId);
            for (const s of shots) form.append("attachment", await shrinkPhoto(s.file), "attachment.jpg");
            const a = await attachEvidenceAction(form);
            if ("error" in a) return setField(a.error);
            setShots([]);
          }
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
      <AttachRow shots={shots} disabled={saving} onChange={(x) => (setShots(x), setSaved(false))} />
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
