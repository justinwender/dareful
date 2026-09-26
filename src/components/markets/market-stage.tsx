"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ledger/avatar";
import { Chip } from "@/components/ledger/chip";
import { InviteShare } from "@/components/ledger/invite-share";
import { ProblemSummary } from "@/components/ledger/problem";
import { signingProblem, useSigner } from "@/components/ledger/use-signer";
import { Button } from "@/components/ui/button";
import { PinnedSheet } from "@/components/ui/pinned-sheet";
import { enterMarketAction, openMarketAction } from "@/lib/actions/markets";
import { daresTypes } from "@/lib/chain/typed-data";
import type { Hue } from "@/lib/ui/hue";
import { OddsHeader, OddsLine } from "./odds-line";
import { WeightLine, bucketOfPercent, type WeightBucket } from "./weight-line";
import { NumberEntry } from "./number-entry";
import { NumberLine } from "./number-line";
import { PickOneBars, type PickOneAnswer, type PickOneBar } from "./pick-one-bars";
import { PickOneEntry } from "./pick-one-entry";
import { numberAxis, serialiseAxis, unitPhrase, withSeparators, type NumberLineAxis } from "@/lib/ledger/number-axis";
import { LockButton, type Signing, type StakeUnit } from "./market-actions";

export type StagePicture =
  | {
      kind: "weights";
      buckets: WeightBucket[];
      group: { percent: number } | null;
      caption: string;
    }
  /** A number market's axis, from what people entered (3.22). */
  | { kind: "numbers"; axis: NumberLineAxis; caption: string }
  /** A pick-one market's bars (3.31): what is riding on each answer, and the caption only when one stake is more than half. */
  | { kind: "picks"; bars: PickOneBar[]; entries: number; caption: string | null }
  /** Blind until lock: who is in, never where. No heights and no group's number, since an aggregate leaks the shape. */
  | { kind: "blind"; inCount: number; ofCount: number };

const STAKES_MONEY = [500, 1000, 2000];
const STAKES_COUNT = [1, 2, 3];
/** How long the entering moment runs before the sheet becomes the next state's (3.13): the columns grow, then the move changes. */
const ENTERING_MS = 1800;

/**
 * The market screen's stage (docs/design.md 3.13, 3.22, 3.24): the odds line in the pinned sheet until you are
 * in, then the entry line and the weight line in the screen and "Send it to the chat" in the sheet. One object
 * in two states: the ten segments of the odds line are the ten buckets the weight line grows into.
 *
 * Entering is a moment, not a navigation. Confirming lowers the sheet, the columns grow from the segments, your
 * share fills in your hue, your avatar rises, the group's marker draws last, and about two seconds later the
 * sheet carries the next move. No toast. What confirms it is the entry line, which is still there next visit.
 */
export function MarketStage(props: {
  dareId: string;
  signing: Signing;
  unit: StakeUnit;
  state: "draft" | "open" | "locked";
  me: { name: string; hue: Hue };
  /** This person's position: a percent on a yes-or-no question, the whole number (as text) on a number question, the answer's index on a pick-one question. */
  mine: { percent: number; number?: string; pick?: number; stake: string; stakeWords: string } | null;
  picture: StagePicture | null;
  mark: string | null;
  /** A number question: what the number counts. Absent on a yes-or-no question. */
  numberUnit?: { singular: string; plural: string } | null;
  /** A pick-one question (3.30): its answers, in the asker's order, for the sheet's rows and the bars. */
  pickOne?: { answers: PickOneAnswer[] } | null;
  /** An argument: which side this person starts on, all the way, and which side is already taken. */
  argument?: {
    defaultPercent: number;
    otherSays: { name: string; side: "yes" | "no" } | null;
  } | null;
  lockedLine: string | null;
  /** "until 10:40pm": how long a number is this person's to change, and how long the link gets people in. */
  changeUntil: string;
  /** While open: the link, the text that goes with it, and the sentence over the button. */
  share: { url: string; text: string; joinLine: string } | null;
  /** The asker's lock, while open: how many are in and whether that is everyone. */
  lock: { count: number; everyoneIn: boolean } | null;
  /**
   * The far-off check on a number question (src/lib/ledger/scale.ts): a number at or past the threshold gets a
   * line the person can confirm past, never a block. `scale` is the asker's scale when they set one, which the
   * line may name because it is already shown; a scale the model set is named nowhere.
   */
  farOff?: { threshold: string; scale: string | null } | null;
}) {
  const { dareId, signing, unit, state, me, mine, picture, mark } = props;
  const numberUnit = props.numberUnit ?? null;
  const pickOne = props.pickOne ?? null;
  // The pick, on a pick-one question (3.30): one answer and nothing else. Nothing is picked until a tap.
  const [pick, setPick] = useState<number | null>(mine?.pick ?? null);
  const router = useRouter();
  const sign = useSigner();
  const [changing, setChanging] = useState(false);
  const [value, setValue] = useState<number | null>(
    numberUnit ? null : (mine?.percent ?? props.argument?.defaultPercent ?? null),
  );
  // The number, on a number question (3.26): nothing prefilled, for the reason the odds line has no thumb.
  const [number, setNumber] = useState<bigint | null>(
    mine?.number !== undefined ? BigInt(mine.number) : null,
  );
  const [raised, setRaised] = useState(false);
  const [stake, setStake] = useState<string>(
    mine?.stake ?? (unit.quantifiable ? String(unit.monetary ? 1000 : 1) : "1"),
  );
  const [other, setOther] = useState(false);
  const [custom, setCustom] = useState("");
  const [step, setStep] = useState<"idle" | "approving" | "sending">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  /** The number the far-off check is asking about, and the one it has been confirmed for. */
  /** The far-off block (3.26): shown when the primary is tapped at or past the limit, and gone the moment the number is under it. */
  const [farBlocked, setFarBlocked] = useState(false);
  /** Set the moment an entry lands, so the picture exists before the server's copy of it arrives. */
  const [justIn, setJustIn] = useState<{
    percent: number;
    number?: string;
    pick?: number;
    stake: string;
    stakeWords: string;
  } | null>(null);
  const [phase, setPhase] = useState<"entering" | "in">("in");
  useEffect(() => {
    if (phase !== "entering") return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setPhase("in"), reduced ? 0 : ENTERING_MS);
    return () => clearTimeout(t);
  }, [phase]);

  const shown = mine ?? justIn;
  const reading = shown !== null && state !== "draft";
  const stakeUnits =
    other && custom.trim() ? customStake(custom, unit.monetary) : stake;
  const stakeWords = (units: string | null) =>
    !units
      ? ""
      : unit.monetary
        ? money(units)
        : `${units} ${units === "1" ? unit.singular : unit.plural}`;

  // What this person is saying, as a picture and as words: "70%", "17 shirts", or the answer they picked ("John").
  const answerText = (i: number | null | undefined) => (i === null || i === undefined ? "…" : (pickOne?.answers.find((a) => a.index === i)?.text ?? "…"));
  const picked = pickOne ? pick !== null : numberUnit ? number !== null : value !== null;
  const sayNumber = (n: bigint) => (pickOne ? answerText(Number(n)) : numberUnit ? unitPhrase(n, numberUnit) : `${n}%`);
  const mineWords = (m: { percent: number; number?: string; pick?: number }) => (pickOne ? answerText(m.pick) : numberUnit && m.number !== undefined ? unitPhrase(BigInt(m.number), numberUnit) : `${m.percent}%`);
  /** The pick-one entry line names the answer and nothing else (4.6): "You're in: John". The other two kinds say "You're in at 70%". */
  const entryLine = (m: { percent: number; number?: string; pick?: number }) => (pickOne ? `You’re in: ${mineWords(m)}` : `You’re in at ${mineWords(m)}`);
  const pickWords = (i: number | null) => (pickOne ? `${answerText(i)}, ${stakeWords(stakeUnits) || "…"}` : `${sayNumber(numberUnit ? (number ?? 0n) : BigInt(value ?? 0))}, ${stakeWords(stakeUnits) || "…"}`);

  /** A number at or past the limit (src/lib/ledger/scale.ts): blocked, never kept, because a slipped finger would lose the stake (3.26). */
  const farOff = (n: bigint | null) => numberUnit !== null && props.farOff !== null && props.farOff !== undefined && n !== null && n >= BigInt(props.farOff.threshold);
  const blocked = farBlocked && farOff(number);
  async function submit() {
    if (!picked) return;
    setProblem(null);
    if (farOff(number)) {
      setFarBlocked(true);
      return;
    }
    await submitConfirmed(number);
  }
  async function submitConfirmed(confirmed: bigint | null) {
    void confirmed;
    // The contract refuses a stake of nothing, and one refused position fails the whole lock for everyone, so
    // the least anyone can put on it is one (docs/decisions.md 2026-09-20).
    if (!stakeUnits || BigInt(stakeUnits) <= 0n)
      return setProblem(
        unit.monetary
          ? "Put an amount on it, like 10."
          : "Put at least one on it.",
      );
    const valueBps = (value ?? 0) * 100;
    const signedValue = pickOne ? BigInt(pick ?? 0) : numberUnit ? (number ?? 0n) : BigInt(valueBps);
    try {
      setStep("approving");
      let createSignature: `0x${string}` | null = null;
      if (state === "draft") {
        if (!signing.create) throw new Error("missing terms");
        const c = signing.create;
        createSignature = await sign(
          signing.ledgerWallet,
          {
            domain: signing.domain,
            types: daresTypes,
            primaryType: "Create",
            message: {
              dareId: signing.dareOnchainId,
              groupId: c.groupId,
              kind: c.kind,
              pace: c.pace,
              termsHash: c.termsHash,
              denomId: c.denomId,
              range: BigInt(c.range),
              options: c.options,
              stalemate: signing.stalemate,
              resolvesBy: BigInt(c.resolvesBy),
            },
          },
          "approve terms",
        );
      }
      const enterSignature = await sign(
        signing.ledgerWallet,
        {
          domain: signing.domain,
          types: daresTypes,
          primaryType: "Enter",
          message: {
            dareId: signing.dareOnchainId,
            stake: BigInt(stakeUnits),
            value: signedValue,
            // Everything on the pick on a pick-one question (3.30); no confidence on a number.
            confidenceBps: signing.confidenceBps,
            stalemate: signing.stalemate,
          },
        },
        "approve number",
      );
      setStep("sending");
      const position = pickOne ? { stake: stakeUnits, answer: Number(signedValue) } : numberUnit ? { stake: stakeUnits, number: signedValue.toString() } : { stake: stakeUnits, valueBps };
      const r = createSignature
        ? await openMarketAction(
            dareId,
            createSignature,
            position,
            enterSignature,
          )
        : await enterMarketAction(dareId, position, enterSignature);
      if ("error" in r) {
        // docs/design.md 3.13: the sheet stays raised, and the number is never silently dropped.
        setProblem(`Your number didn’t send. ${r.error}`);
        setStep("idle");
        return;
      }
      setJustIn({
        percent: value ?? 0,
        ...(numberUnit ? { number: signedValue.toString() } : {}),
        ...(pickOne ? { pick: Number(signedValue) } : {}),
        stake: stakeUnits,
        stakeWords: stakeWords(stakeUnits),
      });
      setChanging(false);
      setRaised(false);
      setStep("idle");
      setPhase("entering");
      router.refresh();
    } catch (err) {
      setProblem(signingProblem(err));
      setStep("idle");
    }
  }

  // The picture: the server's, or, for the seconds before it arrives, this person's column alone.
  const weights = picture?.kind === "weights" ? picture : null;
  const numbers = picture?.kind === "numbers" ? picture : null;
  const picks = picture?.kind === "picks" ? picture : null;
  const blind = picture?.kind === "blind" ? picture : null;
  // A pick-one question's bars before the server's copy arrives: this person's stake on their pick alone.
  const ownBars: PickOneBar[] = (pickOne?.answers ?? []).map((a) => ({ stake: shown?.pick !== undefined && a.index === shown.pick ? shown.stake : "0", noStake: 0 }));
  const ownAxis = numberUnit && shown?.number !== undefined && !numbers ? numberAxis([{ id: "me", stake: BigInt(shown.stake), value: BigInt(shown.number) }], numberUnit) : null;
  const own: WeightBucket[] = Array.from({ length: 10 }, (_, i) => ({
    n: i + 1,
    stake:
      shown && i + 1 === bucketOfPercent(shown.percent) ? shown.stake : "0",
    noStake: 0,
  }));
  const myPercent = shown?.percent ?? value ?? 0;

  const stage =
    reading && shown ? (
      <section
        className="flex flex-col gap-5"
        aria-label="Where the stake sits"
      >
        <div className="flex items-center gap-3">
          <Avatar name={me.name} hue={me.hue} size={36} />
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="text-body-strong text-ink">
              {entryLine(shown)}
            </p>
            <p className="text-caption text-ink-3">
              {[
                shown.stakeWords,
                state === "locked"
                  ? props.lockedLine
                  : `yours to change ${props.changeUntil}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {state !== "locked" && !changing ? (
            <Button
              variant="tertiary"
              onClick={() => {
                setValue(shown.percent);
                if (shown.number !== undefined) setNumber(BigInt(shown.number));
                if (shown.pick !== undefined) setPick(shown.pick);
                setChanging(true);
                setRaised(true);
              }}
            >
              Change
            </Button>
          ) : null}
        </div>
        {pickOne ? (
          <PickOneBars
            answers={pickOne.answers}
            bars={picks ? picks.bars : ownBars}
            entries={picks ? picks.entries : 1}
            me={shown.pick !== undefined ? { name: me.name, hue: me.hue, stake: shown.stake, pick: shown.pick } : null}
            livePick={changing ? pick : null}
            blind={blind ? { inCount: blind.inCount, ofCount: blind.ofCount } : null}
            heading={state === "locked" ? "Where everyone landed" : "Where the stake sits"}
            caption={picks ? picks.caption : null}
            rise={justIn !== null && mine === null}
          />
        ) : numberUnit ? (
          blind ? (
            // A blind number market draws no axis before the reveal (3.22): the ends alone would say what range everyone else picked.
            <div className="flex flex-col gap-3">
              <span className="self-center inline-flex h-7 items-center gap-1.5 rounded-pill border border-line-strong bg-ground px-3 text-caption text-ink-2">
                <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="11" width="14" height="9" rx="2" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
                Numbers show when everyone’s in
              </span>
              <p className="text-caption text-ink-3">{blind.inCount} of {blind.ofCount} in.</p>
            </div>
          ) : numbers || ownAxis ? (
            <NumberLine
              axis={numbers ? numbers.axis : serialiseAxis(ownAxis as NonNullable<typeof ownAxis>)}
              me={shown.number !== undefined ? { name: me.name, hue: me.hue, value: shown.number, stake: shown.stake } : null}
              heading={state === "locked" ? "Where everyone landed" : "Where the stake sits"}
              caption={numbers ? numbers.caption : "You’re first in. Height is how much is riding on each number, not how many people picked it."}
              rise={justIn !== null && mine === null}
            />
          ) : null
        ) : (
        <WeightLine
          buckets={weights ? weights.buckets : own}
          me={{
            name: me.name,
            hue: me.hue,
            stake: shown.stake,
            percent: shown.percent,
          }}
          liveValue={changing ? value : null}
          group={weights?.group ?? null}
          blind={
            blind ? { inCount: blind.inCount, ofCount: blind.ofCount } : null
          }
          heading={
            state === "locked"
              ? "Where everyone landed"
              : "Where the stake sits"
          }
          caption={
            weights
              ? weights.caption
              : "You’re first in. Height is how much is riding on each number, not how many people picked it."
          }
          rise={justIn !== null && mine === null}
        />
        )}
      </section>
    ) : null;

  if (state === "locked") return stage;

  const entering = !reading || changing || phase === "entering";
  const sheet = entering ? (
    <PinnedSheet
      label="Your number"
      raised={raised}
      onRaise={setRaised}
      header={pickOne ? <p className="text-body-strong text-ink">Pick one</p> : numberUnit ? <p className="text-body-strong text-ink">What’s your number?</p> : <OddsHeader value={value} />}
      low={
        <>
          {pickOne ? (
            <PickOneEntry
              answers={pickOne.answers}
              value={pick}
              hue={me.hue}
              disabled={phase === "entering" && !changing && reading}
              onChange={(i) => {
                setPick(i);
                if (!raised) setRaised(true);
              }}
            />
          ) : null}
          {numberUnit ? (
            <>
              <NumberEntry
                header={null}
                value={number}
                unit={numberUnit}
                hue={me.hue}
                problem={blocked}
                disabled={phase === "entering" && !changing && reading}
                onChange={(v) => {
                  setNumber(v);
                  if (!raised && v !== null) setRaised(true);
                }}
              />
              {blocked && number !== null && props.farOff ? (
                // The far-off block (3.26): a field error, never a way to keep the number. It names the limit, which is not the scoring scale.
                <p role="alert" data-far-off="" className="flex items-start gap-2 text-body-sm text-ink">
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mt-[2px] shrink-0">
                    <path d="M12 8v5M12 16.5v.5" />
                    <path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0z" />
                  </svg>
                  <span>
                    {unitPhrase(number, numberUnit)} is past the limit here. Try something under {withSeparators(BigInt(props.farOff.threshold))}.
                  </span>
                </p>
              ) : null}
            </>
          ) : null}
          {props.argument && !reading ? (
            <div className="flex flex-col gap-2">
              {props.argument.otherSays ? (
                <p className="text-body text-ink">
                  {props.argument.otherSays.name} says{" "}
                  {props.argument.otherSays.side}. You’re taking the other side.
                </p>
              ) : null}
              <div
                role="group"
                aria-label="Your side"
                className="grid grid-cols-2 gap-2"
              >
                {([100, 0] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={value === v}
                    onClick={() => setValue(v)}
                    className="rounded-pill"
                  >
                    <Chip size={44} selected={value === v} className="w-full">
                      {v === 100 ? "Yes, all the way" : "No, all the way"}
                    </Chip>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {numberUnit || pickOne ? null : (
          <OddsLine
            value={value}
            mark={mark}
            hue={me.hue}
            disabled={phase === "entering" && !changing && reading}
            onChange={(v) => {
              setValue(v);
              if (!raised) setRaised(true);
            }}
          />
          )}
        </>
      }
      high={
        <div className="flex flex-col gap-3">
          <h2 className="text-label text-ink-3">What’s riding on it</h2>
          {unit.quantifiable ? (
            <>
              <div
                role="group"
                aria-label="What's riding on it"
                className="grid grid-cols-3 gap-2"
              >
                {(unit.monetary ? STAKES_MONEY : STAKES_COUNT).map((o) => (
                  <button
                    key={o}
                    type="button"
                    aria-pressed={!other && stake === String(o)}
                    onClick={() => (setStake(String(o)), setOther(false))}
                    className="rounded-pill"
                  >
                    <Chip
                      size={44}
                      selected={!other && stake === String(o)}
                      className="w-full"
                    >
                      {stakeWords(String(o))}
                    </Chip>
                  </button>
                ))}
              </div>
              {other ? (
                <input
                  inputMode={unit.monetary ? "decimal" : "numeric"}
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder={unit.monetary ? "$" : "How many"}
                  aria-label="Another amount"
                  className="h-11 w-full rounded-button border border-line bg-ground px-4 text-body text-ink placeholder:text-ink-3"
                />
              ) : (
                <Button
                  variant="tertiary"
                  className="self-start"
                  onClick={() => setOther(true)}
                >
                  Something else
                </Button>
              )}
            </>
          ) : (
            <p className="text-caption text-ink-3">
              One {unit.singular}, the same for everyone.
            </p>
          )}
        </div>
      }
      foot={
        <>
          <ProblemSummary messages={[problem]} />
          {problem && !problem.startsWith("Put") ? (
            <Button
              variant="tertiary"
              onClick={submit}
              loading={step !== "idle"}
            >
              Try again
            </Button>
          ) : changing ? (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Button
                variant="primary"
                onClick={submit}
                loading={step !== "idle"}
                disabled={!picked || blocked}
              >
                Save: {pickWords(pick)}
              </Button>
              <Button
                variant="secondary"
                size="primary"
                disabled={step !== "idle"}
                onClick={() => {
                  setChanging(false);
                  setRaised(false);
                  setValue(shown?.percent ?? null);
                  setNumber(shown?.number !== undefined ? BigInt(shown.number) : null);
                  setPick(shown?.pick ?? null);
                }}
              >
                Never mind
              </Button>
            </div>
          ) : (
            <Button
              variant="primary"
              onClick={submit}
              loading={step !== "idle"}
              disabled={!picked || blocked || (phase === "entering" && reading)}
            >
              {!picked
                ? pickOne
                  ? "Pick an answer"
                  : numberUnit
                    ? "Type your number"
                    : "Slide to pick your odds"
                : state === "draft"
                  ? `Looks right. I’m in${pickOne ? ":" : " at"} ${pickWords(pick)}`
                  : `I’m in${pickOne ? ":" : " at"} ${pickWords(pick)}`}
            </Button>
          )}
        </>
      }
    />
  ) : props.share ? (
    <PinnedSheet
      label="Get people in"
      low={
        <>
          <p className="text-caption text-ink-2">{props.share.joinLine}</p>
          {props.lock && props.lock.everyoneIn ? (
            <>
              <LockButton dareId={dareId} count={props.lock.count} primary />
              <InviteShare url={props.share.url} text={props.share.text} />
            </>
          ) : (
            <>
              <InviteShare
                url={props.share.url}
                text={props.share.text}
                primary
              />
              {props.lock && props.lock.count >= 2 ? (
                <LockButton
                  dareId={dareId}
                  count={props.lock.count}
                  primary={false}
                />
              ) : null}
            </>
          )}
        </>
      }
    />
  ) : null;

  return (
    <>
      {stage}
      {sheet}
    </>
  );
}

function money(cents: string): string {
  const n = BigInt(cents);
  const whole = n / 100n;
  const rest = n % 100n;
  return rest === 0n
    ? `$${whole}`
    : `$${whole}.${rest.toString().padStart(2, "0")}`;
}

function customStake(input: string, monetary: boolean): string | null {
  if (!monetary) return /^\d{1,6}$/.test(input.trim()) ? input.trim() : null;
  const m = /^\s*\$?\s*(\d{1,6})(?:\.(\d{1,2}))?\s*$/.exec(input);
  if (!m) return null;
  return (
    BigInt(m[1] ?? "0") * 100n +
    BigInt((m[2] ?? "").padEnd(2, "0"))
  ).toString();
}
