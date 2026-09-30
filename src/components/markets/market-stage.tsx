"use client";

import { useEffect, useId, useState } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ledger/avatar";
import { Chip, chipPress } from "@/components/ledger/chip";
import { FIELD_PROBLEM_CLASS, Problem, ProblemSummary } from "@/components/ledger/problem";
import { signingProblem, useSigner } from "@/components/ledger/use-signer";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { SignInButton } from "@/components/auth/sign-in-button";
import { withdrawHostedEntryAction } from "@/lib/actions/hand-over";
import { PinnedSheet } from "@/components/ui/pinned-sheet";
import { enterAsGhostAction, enterMarketAction, openMarketAction, suggestGhostNamesAction, forgetGhostAction } from "@/lib/actions/markets";
import { isIdentifier } from "@/lib/auth/login";
import { daresTypes } from "@/lib/chain/typed-data";
import type { Hue } from "@/lib/ui/hue";
import { OddsHeader, OddsLine } from "./odds-line";
import { TeamHeader, TeamLine } from "./team-line";
import { leanPill, type TeamFace } from "@/lib/ui/team";
import { WeightLine, bucketOfPercent, type WeightBucket } from "./weight-line";
import { NumberEntry } from "./number-entry";
import { NumberLine } from "./number-line";
import { PickOneBars, type PickOneAnswer, type PickOneBar } from "./pick-one-bars";
import { PickOneEntry } from "./pick-one-entry";
import { numberAxis, serialiseAxis, unitPhrase, withSeparators, type NumberLineAxis } from "@/lib/ledger/number-axis";
import type { Signing, StakeUnit } from "./market-actions";
import { defaultStake, StakeChips } from "./stake-chips";
import { sheetPresent } from "@/lib/ui/stage";
import { dropKeyboard } from "@/lib/ui/viewport";

export type StagePicture =
  | {
      kind: "weights";
      buckets: WeightBucket[];
      group: { percent: number } | null;
      caption: string | null;
    }
  /** A number market's axis, from what people entered (3.22). */
  | { kind: "numbers"; axis: NumberLineAxis; caption: string | null }
  /** A pick-one market's bars (3.31): what is riding on each answer, and the caption only when one stake is more than half. */
  | { kind: "picks"; bars: PickOneBar[]; entries: number; caption: string | null };

/**
 * The market screen's stage (docs/design.md 3.13, 3.22, 3.24): the odds line in the pinned sheet until you are
 * in, then the entry line and the weight line in the screen and no sheet at all, since once you're in nothing
 * is your move (3.24): the icons end the who's-in row (3.42) and the photo slot sits last on the screen (3.39).
 * One object in two states: the ten segments of the odds line are the ten buckets the weight line grows into.
 *
 * Entering is a moment, not a navigation. The sheet goes in the render the entry line arrives in (`sheetPresent`;
 * 3.13, amended 2026-09-29: the two were 1.8 seconds apart), and in the page the columns grow from the segments,
 * your share fills in your hue, your avatar rises and the group's marker draws last. No toast. What confirms it
 * is the entry line, which is still there next visit.
 *
 * A pick-one market's sheet opens raised, since picking is the move, and lowers to one bar ("Pick one" and the
 * count of answers, or your pick) so the terms behind six answers can be read (3.30). A touch on the bar raises it.
 */
export type GhostEntry = {
  /** This browser's ghost on this market, once in. */
  known: { name: string } | null;
};

export type MarketStageProps = Parameters<typeof MarketStage>[0];

export function MarketStage(props: {
  dareId: string;
  /** Null for a ghost (docs/design.md 3.17): nothing is signed, and the entry goes in without an account. */
  signing: Signing | null;
  /** Entering without an account: who they say they are goes in with the number, and the browser keeps a token for it. */
  ghost?: GhostEntry | null;
  unit: StakeUnit;
  state: "draft" | "open" | "locked";
  me: { name: string; hue: Hue; /** Entering without an account: the stone avatar with its dashed ring (3.1). */ ghost?: boolean };
  /** This person's position: a percent on a yes-or-no question, the whole number (as text) on a number question, the answer's index on a pick-one question. */
  mine: { percent: number; number?: string; pick?: number; stake: string; stakeWords: string; /** A position bound to this account from a ghost's entry and never signed (PLANNING.md section 4, "One phone"): confirming it is entering. */ unsigned?: boolean; /** On a blind market an entry is final once made (3.22, 3.31): no Change, and the caption says so. */ final?: boolean; /** Made on a friend's phone (3.45): the host's first name, for "from Sam's phone" in the caption. */ from?: string; /** A blind entry made on a friend's phone, while open (3.45): withdrawable from this person's own phone, and never enterable again. */ withdrawable?: boolean } | null;
  /** Handing the phone over (3.45): the friend's entry is picked here as on the link page and handed to the parent, which asks who's joining and for the PIN; nothing is sent from this stage. */
  host?: { onPicked: (position: { stake: string; value: string }, words: string) => void } | null;
  /** Signed in, on a link (3.17, frame 7): "Joining as Sam · Not you?" under the primary while entering. */
  signedInAs?: string | null;
  /** A blind market (3.31): one line above the primary says what is about to happen before anyone commits. */
  blind?: boolean;
  picture: StagePicture | null;
  mark: string | null;
  /** A number question: what the number counts, and on a signed margin its shift and the two sides. Absent on a yes-or-no question. */
  numberUnit?: { singular: string; plural: string; margin?: { shift: string; home: string; away: string } | null } | null;
  /** Between two teams (docs/design.md 3.40): the away side at the low end and the home side at the high end, each a stamp, and the margin's reach either way. */
  teams?: { away: TeamFace; home: TeamFace; reach: number } | null;
  /** The consent line in the entry sheet, directly above the primary (3.35, 4.9): "If nobody votes, the final score settles it." */
  consent?: string | null;
  /** A pick-one question (3.30): its answers, in the asker's order, for the sheet's rows and the bars. */
  pickOne?: { answers: PickOneAnswer[] } | null;
  /** An argument: which side this person starts on, all the way, and which side is already taken. */
  argument?: {
    defaultPercent: number;
    otherSays: { name: string; side: "yes" | "no" } | null;
  } | null;
  lockedLine: string | null;
  /** Voting has opened (3.38): the claim card or the source card stands where the entry line stood, so the entry line leaves and the picture alone remains. */
  claimed?: boolean;
  /** "until 10:40pm": how long a number is this person's to change. */
  changeUntil: string;
  /**
   * The far-off check on a number question (src/lib/ledger/scale.ts): a number at or past the threshold gets a
   * line the person can confirm past, never a block. `scale` is the asker's scale when they set one, which the
   * line may name because it is already shown; a scale the model set is named nowhere.
   */
  farOff?: { threshold: string; scale: string | null } | null;
}) {
  const { dareId, signing, unit, state, me, mine, picture, mark } = props;
  const ghost = props.ghost ?? null;
  const host = props.host ?? null;
  /** "Who's joining?" (3.17, frame 3): the step after the number, where a ghost says who they are; the primary raises it instead of sending. */
  const [whoStep, setWhoStep] = useState(false);
  /** "Not you?" (3.17, frame 7): signing out of this phone so someone else can join from the link. */
  const [notYou, setNotYou] = useState(false);
  const [withdrawing, setWithdrawing] = useState<"asking" | "sending" | null>(null);
  const [withdrawProblem, setWithdrawProblem] = useState<string | null>(null);
  const stageId = useId();
  const { handleLogOut } = useDynamicContext();
  const numberUnit = props.numberUnit ?? null;
  // A ghost's name and number, typed on the way in (3.17); the number is hashed at the door and never kept.
  const [ghostName, setGhostName] = useState("");
  const [ghostPhone, setGhostPhone] = useState("");
  const [ghostMember, setGhostMember] = useState<string | null>(null);
  /** "Is one of these you?" (3.17, frame 4): names for the letters typed so far, at most three, and nothing before the first letters. */
  const [suggestions, setSuggestions] = useState<Array<{ claimId: string; name: string }>>([]);
  /** The picked name's number check, at its field (3.17, frame 5; 5.1). */
  const [phoneProblem, setPhoneProblem] = useState<string | null>(null);
  const suggesting = ghost !== null && !ghost.known && !ghostMember && ghostName.trim().length >= 2;
  useEffect(() => {
    if (!suggesting) return;
    let alive = true;
    const t = setTimeout(() => {
      suggestGhostNamesAction(dareId, ghostName.trim())
        .then((r) => alive && setSuggestions(r))
        .catch(() => alive && setSuggestions([]));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [dareId, suggesting, ghostName]);
  const shownSuggestions = suggesting ? suggestions : [];
  const pickOne = props.pickOne ?? null;
  const teams = props.teams ?? null;
  const shift = numberUnit?.margin ? BigInt(numberUnit.margin.shift) : null;
  // The pick, on a pick-one question (3.30): one answer and nothing else. Nothing is picked until a tap.
  const [pick, setPick] = useState<number | null>(mine?.pick ?? null);
  const router = useRouter();
  const sign = useSigner();
  // A bound, unsigned position starts in the changing state: the numbers are there, and the tap that keeps them is the signature.
  const [changing, setChanging] = useState(mine?.unsigned === true);
  const [value, setValue] = useState<number | null>(
    numberUnit ? null : (mine?.percent ?? props.argument?.defaultPercent ?? null),
  );
  // The number, on a number question (3.26): nothing prefilled, for the reason the odds line has no thumb.
  const [number, setNumber] = useState<bigint | null>(
    mine?.number !== undefined ? BigInt(mine.number) : null,
  );
  // A pick-one sheet opens raised (3.30); the others raise on the first touch (3.13).
  const [raised, setRaised] = useState(mine?.unsigned === true || (pickOne !== null && mine === null));
  const [stake, setStake] = useState<string>(
    mine?.stake ?? defaultStake(unit),
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
  const shown = mine ?? justIn;
  const reading = shown !== null && state !== "draft";
  const unsigned = mine?.unsigned === true && justIn === null;
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
  /** Between two teams the number is said as a side (3.40): "Bills 70%", "Even"; a margin as "Bills by 7". */
  const sayPercent = (n: number) => (teams && !numberUnit ? leanPill(n, teams.away.name, teams.home.name) : `${n}%`);
  const sayNumber = (n: bigint) => (pickOne ? answerText(Number(n)) : numberUnit ? unitPhrase(n, numberUnit) : sayPercent(Number(n)));
  const mineWords = (m: { percent: number; number?: string; pick?: number }) => (pickOne ? answerText(m.pick) : numberUnit && m.number !== undefined ? unitPhrase(BigInt(m.number), numberUnit) : sayPercent(m.percent));
  /** The pick-one entry line names the answer and nothing else (4.6): "You're in: John". The other two kinds say "You're in at 70%", "You're in at Bills 70%". */
  const entryLine = (m: { percent: number; number?: string; pick?: number }) => (pickOne ? `You’re in: ${mineWords(m)}` : `You’re in at ${mineWords(m)}`);
  const pickWords = (i: number | null) => (pickOne ? `${answerText(i)}, ${stakeWords(stakeUnits) || "…"}` : `${sayNumber(numberUnit ? (number ?? 0n) : BigInt(value ?? 0))}, ${stakeWords(stakeUnits) || "…"}`);

  /** A number at or past the limit (src/lib/ledger/scale.ts): blocked, never kept, because a slipped finger would lose the stake (3.26). */
  const farOff = (n: bigint | null) => numberUnit !== null && props.farOff !== null && props.farOff !== undefined && n !== null && n >= BigInt(props.farOff.threshold);
  const blocked = farBlocked && farOff(number);
  async function submit() {
    // The keyboard leaves by a blur before the sheet that holds its field goes (viewport.ts).
    dropKeyboard();
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
    const position = pickOne ? { stake: stakeUnits, answer: Number(signedValue) } : numberUnit ? { stake: stakeUnits, number: signedValue.toString() } : { stake: stakeUnits, valueBps };
    if (host) {
      // Handing the phone over (3.45): the number and the stake go to the parent, which asks who's joining and for the PIN. Nothing is sent from here.
      host.onPicked({ stake: stakeUnits, value: signedValue.toString() }, pickWords(pick));
      return;
    }
    if (ghost && !ghost.known && !whoStep) {
      // The link page's next step (3.17, frame 3): who's joining, before anything is sent.
      setWhoStep(true);
      setRaised(true);
      return;
    }
    if (ghost) {
      // No signature: who they are goes in, with a number if they give one, and the browser keeps a token for the ghost (3.17). A picked name needs the number it joined with.
      setPhoneProblem(null);
      if (!ghost.known && !ghostName.trim()) return setProblem("Say what your friends call you.");
      if (!ghost.known && isIdentifier(ghostName)) return setProblem("Say what your friends call you.");
      if (!ghost.known && ghostMember && !ghostPhone.trim()) return setPhoneProblem("A picked name needs the number it joined with.");
      setStep("sending");
      const r = await enterAsGhostAction(dareId, position, { name: ghost.known ? "" : ghostName.trim(), ...(!ghost.known && ghostPhone.trim() ? { phone: ghostPhone.trim() } : {}), ...(!ghost.known && ghostMember ? { memberClaimId: ghostMember } : {}) });
      if ("error" in r) {
        if (r.at === "phone") setPhoneProblem(r.error);
        else setProblem(`Your number didn’t send. ${r.error}`);
        setStep("idle");
        return;
      }
      setJustIn({ percent: value ?? 0, ...(numberUnit ? { number: signedValue.toString() } : {}), ...(pickOne ? { pick: Number(signedValue) } : {}), stake: stakeUnits, stakeWords: stakeWords(stakeUnits) });
      setChanging(false);
      setRaised(false);
      setStep("idle");
      router.refresh();
      return;
    }
    if (!signing) return setProblem("That didn’t go through. Try again.");
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
          { action: "create", dareId },
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
        { action: "enter", dareId, stake: String(stakeUnits), value: signedValue.toString() },
      );
      setStep("sending");
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
        {props.claimed ? null : (
        <div className="flex items-center gap-3">
          <Avatar name={me.name} hue={me.hue} size={36} ghost={me.ghost} />
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="text-body-strong text-ink">
              {entryLine(shown)}
            </p>
            <p className="text-caption text-ink-3">
              {[
                shown.stakeWords,
                // Made on a friend's phone (3.45, frame 7): where it came from, then whose it is to change.
                mine?.from ? `from ${mine.from}’s phone` : null,
                state === "locked"
                  ? props.lockedLine
                  : mine?.final
                    ? "final"
                    : `yours to change ${props.changeUntil}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {state !== "locked" && !changing && mine?.final && mine.withdrawable ? (
            // A blind entry made on a friend's phone (3.45): withdrawable from this person's own phone, and never enterable again, so a watched PIN stays fixable without a way around blind.
            <Button variant="tertiary" onClick={() => setWithdrawing("asking")} data-withdraw-entry="">
              Withdraw it
            </Button>
          ) : null}
          {state !== "locked" && !changing && !mine?.final ? (
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
        )}
        {pickOne ? (
          <PickOneBars
            answers={pickOne.answers}
            bars={picks ? picks.bars : ownBars}
            entries={picks ? picks.entries : 1}
            me={shown.pick !== undefined ? { name: me.name, hue: me.hue, stake: shown.stake, pick: shown.pick } : null}
            livePick={changing ? pick : null}
            heading={state === "locked" ? "Where everyone landed" : "Where the stake sits"}
            caption={picks ? picks.caption : null}
            rise={justIn !== null && mine === null}
          />
        ) : numberUnit ? (
          numbers || ownAxis ? (
            <NumberLine
              axis={numbers ? numbers.axis : serialiseAxis(ownAxis as NonNullable<typeof ownAxis>)}
              me={shown.number !== undefined ? { name: me.name, hue: me.hue, value: shown.number, stake: shown.stake } : null}
              heading={state === "locked" ? "Where everyone landed" : "Where the stake sits"}
              caption={numbers ? numbers.caption : null}
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
          heading={
            state === "locked"
              ? "Where everyone landed"
              : "Where the stake sits"
          }
          caption={weights ? weights.caption : null}
          rise={justIn !== null && mine === null}
          ends={teams ? { away: teams.away.name, home: teams.home.name } : null}
        />
        )}
      </section>
    ) : null;

  if (state === "locked") return stage;

  const entering = sheetPresent(reading, changing);
  /** The answer picked on a pick-one sheet, for the lowered bar (3.30). */
  const pickedAnswer: PickOneAnswer | null = pickOne && pick !== null ? (pickOne.answers.find((a) => a.index === pick) ?? null) : null;
  const foot = (
        <>
          <ProblemSummary messages={[problem]} retry={() => void submit()} />
          {props.blind && !changing ? (
            // A blind market (3.31): what is about to happen, said once before anyone commits, after the 16px lock glyph.
            <p className="flex items-center gap-2 text-body-sm text-ink" data-blind-line="">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              <span>You see everyone’s once you’re in. Yours is final then.</span>
            </p>
          ) : null}
          {props.consent ? (
            // The consent every entry gives (3.35, 4.9): one line in ink after the 16px ticket glyph, directly above the button that gives it.
            <p className="flex items-center gap-2 text-body-sm text-ink" data-consent-line="">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <path d="M4 9a2 2 0 0 0 2-2V6h12v1a2 2 0 0 0 2 2v6a2 2 0 0 0-2 2v1H6v-1a2 2 0 0 0-2-2z" />
                <path d="M12 7v10" strokeDasharray="1.5 2.5" />
              </svg>
              <span>{props.consent}</span>
            </p>
          ) : null}
          {problem && !problem.startsWith("Put") ? (
            <Button
              variant="tertiary"
              onClick={submit}
              loading={step !== "idle"}
            >
              Try again
            </Button>
          ) : changing && unsigned ? (
            // A number that came in before this person signed in (PLANNING.md section 4): keeping it, or changing it, is the signature.
            <Button variant="primary" onClick={submit} loading={step !== "idle"} disabled={!picked || blocked}>
              {`Confirm${pickOne || teams ? ":" : " at"} ${pickWords(pick)}`}
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
              // On the who's-joining step the chalk waits for the name alone, and for the number too only when a name was picked (3.17, amended).
              disabled={!picked || blocked || (whoStep && (!ghostName.trim() || (ghostMember !== null && !ghostPhone.trim())))}
              data-join-primary={whoStep ? "who" : undefined}
            >
              {!picked
                ? pickOne
                  ? "Pick an answer"
                  : teams
                    ? "Slide to pick a side"
                    : numberUnit
                      ? "Type your number"
                      : "Slide to pick your odds"
                : ghost && !ghost.known
                  ? whoStep
                    ? ghostName.trim()
                      ? `Join as ${ghostName.trim().split(/\s+/)[0]}`
                      : "Join"
                    : `I’m in${pickOne || teams ? ":" : " at"} ${pickWords(pick)}`
                  : state === "draft"
                    ? `Looks right. I’m in${pickOne || teams ? ":" : " at"} ${pickWords(pick)}`
                    : `I’m in${pickOne || teams ? ":" : " at"} ${pickWords(pick)}`}
            </Button>
          )}
          {whoStep && ghost && !ghost.known ? (
            <div className="flex justify-start" data-have-account="">
              <SignInButton variant="tertiary" label="Have an account? Sign in" />
            </div>
          ) : null}
          {(props.signedInAs || ghost?.known) && !reading && !changing && state === "open" ? (
            // Signed in, on a link (3.17, frame 7): who this phone will join as, and the way to join as somebody else. A phone that remembers a ghost joins as them the same way, since the entry goes to the ghost it remembers whatever name is typed.
            <p className="flex items-center gap-1 text-caption text-ink-3" data-joining-as="">
              <span>Joining as {props.signedInAs ?? ghost?.known?.name}</span>
              <span aria-hidden="true">·</span>
              <button type="button" onClick={() => setNotYou(true)} data-press="line" className="link-tertiary press-line">
                Not you?
              </button>
            </p>
          ) : null}
        </>
  );
  const sheet = entering ? (
    <PinnedSheet
      label="Your number"
      raised={raised}
      onRaise={setRaised}
      header={pickOne ? (
        // The bar (3.30): "Pick one" on the left; on the right the count of answers, or, once picked, the pick's avatar, its name and a check.
        <div className="flex h-7 items-center justify-between gap-3" data-pick-one-bar="">
          <p className="text-body-strong text-ink">Pick one</p>
          {pickedAnswer ? (
            <span className="flex items-center gap-2 text-body-sm font-semibold text-ink">
              {pickedAnswer.person ? <Avatar name={pickedAnswer.person.name} hue={pickedAnswer.person.hue} size={22} /> : null}
              <span>{pickedAnswer.text}</span>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l5 5 9-10" />
              </svg>
            </span>
          ) : (
            <span className="text-caption text-ink-2">{pickOne.answers.length} answers</span>
          )}
        </div>
      ) : teams && numberUnit?.margin && shift !== null ? <TeamHeader mode="margin" value={number === null ? null : Number(number - shift)} away={teams.away} home={teams.home} /> : numberUnit ? <p className="text-body-strong text-ink">What’s your number?</p> : teams ? <TeamHeader mode="wins" value={value} away={teams.away} home={teams.home} /> : <OddsHeader value={value} />}
      low={
        <>
          {numberUnit ? (
            <>
              {numberUnit.margin && shift !== null ? (
                // The margin (3.40): the line between the two teams, centred on a tie, past an end typed; stored shifted up by half the scale, and never below the field's floor.
                <TeamLine
                  mode="margin"
                  value={number === null ? null : Number(number - shift)}
                  away={teams?.away ?? { abbr: numberUnit.margin.away.slice(0, 3).toUpperCase(), name: numberUnit.margin.away, color: null }}
                  home={teams?.home ?? { abbr: numberUnit.margin.home.slice(0, 3).toUpperCase(), name: numberUnit.margin.home, color: null }}
                  reach={teams?.reach ?? 35}
                  unit={numberUnit}
                  hue={me.hue}
                  onChange={(v) => {
                    const signed = BigInt(v) < -shift ? -shift : BigInt(v);
                    setNumber(signed + shift);
                    if (!raised) setRaised(true);
                  }}
                />
              ) : (
              <NumberEntry
                header={null}
                value={number}
                unit={numberUnit}
                hue={me.hue}
                problem={blocked}
                onChange={(v) => {
                  setNumber(v);
                  if (!raised && v !== null) setRaised(true);
                }}
              />
              )}
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
                    // Taking a side is the first touch on an argument's sheet (3.21): it raises the sheet, as the line does, so the stake and the primary come into view.
                    onClick={() => {
                      setValue(v);
                      if (!raised) setRaised(true);
                    }}
                    {...chipPress(value === v)}
                  >
                    <Chip size={44} selected={value === v} className="w-full" choice>
                      {v === 100 ? "Yes, all the way" : "No, all the way"}
                    </Chip>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {numberUnit || pickOne ? null : teams ? (
          <TeamLine
            mode="wins"
            value={value}
            away={teams.away}
            home={teams.home}
            hue={me.hue}
            onChange={(v) => {
              setValue(v);
              if (!raised) setRaised(true);
            }}
          />
          ) : (
          <OddsLine
            value={value}
            mark={mark}
            hue={me.hue}
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
          {pickOne ? (
            <PickOneEntry
              answers={pickOne.answers}
              value={pick}
              hue={me.hue}
              onChange={(i) => {
                setPick(i);
                if (!raised) setRaised(true);
              }}
            />
          ) : null}
          {ghost && !ghost.known && whoStep ? (
            // Who's joining? (3.17, frame 3): its own step after the number, the entry's summary on the right; a name, and a number if they give one, so the entry is theirs when they sign in with it. A picked name joins only with its number.
            <div className="flex flex-col gap-3" data-ghost-fields="">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-body-strong text-ink">Who’s joining?</h2>
                <span className="text-caption text-ink-2">{pickWords(pick)}</span>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-label text-ink-3">Your name</span>
                <span className="relative">
                  <input
                    value={ghostName}
                    onChange={(e) => {
                      setGhostName(e.target.value);
                      setGhostMember(null);
                      setPhoneProblem(null);
                    }}
                    autoComplete="given-name"
                    maxLength={40}
                    aria-label="Your name"
                    className="h-12 w-full rounded-button border border-line bg-ground px-4 text-body text-ink"
                  />
                  {ghostMember ? (
                    // Picked from the names (3.17, frame 4): the check says so.
                    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-ink" data-picked-name="">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  ) : null}
                </span>
              </label>
              {shownSuggestions.length > 0 ? (
                <div className="flex flex-col gap-2" data-name-suggestions="">
                  <p className="text-label text-ink-3">Is one of these you?</p>
                  <div className="flex flex-wrap gap-2">
                    {shownSuggestions.map((m) => (
                      <button key={m.claimId} type="button" onClick={() => (setGhostMember(m.claimId), setGhostName(m.name), setSuggestions([]))} {...chipPress(false)}>
                        <Chip size={40} selected={false}>
                          <Avatar name={m.name} hue="stone" size={24} ghost />
                          {m.name}
                        </Chip>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <label className="flex flex-col gap-1">
                <span className="text-label text-ink-3">Your phone number</span>
                <input value={ghostPhone} onChange={(e) => (setGhostPhone(e.target.value), setPhoneProblem(null))} type="tel" inputMode="tel" autoComplete="tel" maxLength={40} aria-label="Your phone number" aria-invalid={phoneProblem ? true : undefined} aria-describedby={phoneProblem ? "ghost-phone-problem" : undefined} className={`h-12 w-full rounded-button border border-line bg-ground px-4 text-body text-ink${phoneProblem ? ` ${FIELD_PROBLEM_CLASS}` : ""}`} />
              </label>
              <Problem id="ghost-phone-problem" message={phoneProblem} />
              <p className="text-caption text-ink-3">Nothing gets sent to it. Sign in with this number later and your entries are waiting.</p>
            </div>
          ) : null}
          {unsigned ? <p className="text-body-sm text-ink-2">This was you before you signed in. Keep it, or change it.</p> : null}
          {whoStep ? null : <h2 className="text-label text-ink-3">What’s riding on it</h2>}
          {whoStep ? null : <StakeChips unit={unit} stake={stake} other={other} custom={custom} stakeWords={(u) => stakeWords(u)} onStake={setStake} onOther={setOther} onCustom={setCustom} />}
          {pickOne ? foot : null}
        </div>
      }
      foot={pickOne ? undefined : foot}
    />
  ) : null;

  return (
    <>
      {stage}
      {sheet}
      {/* "Not you?" (3.17, frame 7): a modal over the raised sheet, since signing this phone out is a moment worth a pause. */}
      <Sheet open={notYou} onClose={() => setNotYou(false)} labelledBy={`${stageId}-not-you`}>
        <h2 id={`${stageId}-not-you`} className="text-body-strong text-ink">
          Not {props.signedInAs ?? ghost?.known?.name}?
        </h2>
        <p className="text-body-sm text-ink-2">{props.signedInAs ? "Sign out of this phone, and join as yourself from the link." : "This phone forgets them, and you join as yourself from the link."}</p>
        <div className="flex flex-col gap-1">
          <Button
            variant="primary"
            data-autofocus
            onClick={async () => {
              if (props.signedInAs) {
                await fetch("/api/session", { method: "DELETE" });
                await handleLogOut().catch(() => undefined);
              } else {
                await forgetGhostAction();
              }
              window.location.reload();
            }}
          >
            {props.signedInAs ? "Sign out" : "Forget them"}
          </Button>
          <Button variant="tertiary" onClick={() => setNotYou(false)}>
            Never mind
          </Button>
        </div>
      </Sheet>
      {/* Withdrawing a blind entry made on a friend's phone (3.45): asked once, since nothing of theirs comes into this one again. */}
      <Sheet open={withdrawing !== null} onClose={() => (withdrawing === "sending" ? undefined : setWithdrawing(null))} labelledBy={`${stageId}-withdraw`}>
        <h2 id={`${stageId}-withdraw`} className="text-body-strong text-ink">
          Withdraw your entry?
        </h2>
        <p className="text-body-sm text-ink-2">It comes out for good, and you can’t get into this one again.</p>
        <ProblemSummary messages={[withdrawProblem]} />
        <div className="flex flex-col gap-1">
          <Button
            variant="primary"
            data-autofocus
            loading={withdrawing === "sending"}
            onClick={async () => {
              setWithdrawProblem(null);
              setWithdrawing("sending");
              const r = await withdrawHostedEntryAction(dareId);
              if ("error" in r) {
                setWithdrawProblem(r.error);
                setWithdrawing("asking");
                return;
              }
              setWithdrawing(null);
              router.refresh();
            }}
          >
            Withdraw it
          </Button>
          <Button variant="tertiary" disabled={withdrawing === "sending"} onClick={() => setWithdrawing(null)}>
            Keep it
          </Button>
        </div>
      </Sheet>
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
