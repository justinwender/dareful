import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LinkPending } from "@/components/ui/link-pending";
import { after } from "next/server";
import { asc, and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { GhostMarketPage } from "./ghost";
import { participantsOf, pidOf } from "@/lib/ledger/participants";
import { Avatar, AvatarStack } from "@/components/ledger/avatar";
import { Chip } from "@/components/ledger/chip";
import { MediaFrame } from "@/components/ledger/media-frame";
import { EmptySlot } from "@/components/markets/empty-slot";
import { PhotoAdding } from "@/components/markets/photo-adding";
import { mediaOnMarket } from "@/lib/media";
import { storageConfigured } from "@/lib/media/storage";
import { ClipView } from "@/components/markets/clip-view";
import { nightHeading, restOfThatNight } from "@/lib/ledger/night";
import { markRefOf } from "@/lib/ui/mark";
import { outcomeLine, outcomeWordsOf, saidWord } from "@/lib/ui/outcome-words";
import type { MarketMark } from "@/components/ledger/state-mark";
import { InkPicker } from "@/components/markets/ink-picker";
import { inkOf } from "@/lib/ui/ink";
import { InkRoot } from "@/components/ledger/ink-root";
import { QuestionBand } from "@/components/markets/question-band";
import { bandClock } from "@/lib/ui/band";
import { Screen, SectionLabel, TopBar } from "@/components/ledger/screen";
import { When } from "@/components/ledger/when";
import { CallLine, Ruler } from "@/components/markets/call-line";
import { CallSheet, type Word } from "@/components/markets/call-sheet";
import { Leaderboard, NumberLeaderboard, WhoHasWho } from "@/components/markets/leaderboard";
import type { PickOneAnswer, PickOneBar } from "@/components/markets/pick-one-bars";
import { PickOneRows } from "@/components/markets/pick-one-rows";
import { answerLine as pickAnswerLine, answerShares, calledItLine, pickOneCaption, saidAnswer } from "@/lib/ledger/pick-one";
import { rulerFor } from "@/components/markets/market-card-from";
import { VotePoll } from "@/components/markets/vote-poll";
import { numberAxis, serialiseAxis, unitPhrase, withSeparators } from "@/lib/ledger/number-axis";
import { pulseOf } from "@/lib/ledger/pulse";
import { templateOfMarket } from "@/lib/sports";
import { SAY_YOURSELF_AFTER_MS, scoreLine } from "@/lib/sports/results";
import { CAN_TIE, CONSENT, DRIVE_CONSENT, SLIDER_REACH, TIE_VOID, UNCLEAR_BY_PLAYS, UNCLEAR_BY_SCORE } from "@/lib/sports/templates";
import type { Sport } from "@/lib/sports/types";
import { TeamStamp } from "@/components/ledger/team-stamp";
import { leanPill, type TeamFace } from "@/lib/ui/team";
import { farOffThreshold } from "@/lib/ledger/scale";
import { InvitePreview } from "@/components/markets/invite-preview";
import { WhosInRow } from "@/components/markets/whos-in-row";
import { Nudge } from "@/components/notify/nudge";
import { DeadLink } from "@/components/markets/dead-link";
import { HeadsUp } from "@/components/notify/heads-up";
import { onWayFor } from "@/lib/ledger/again";
import {
  arbitrationOpen,
  expireMarket,
  proposeForArgument,
} from "@/lib/ledger/settle";
import {
  LockButton,
  type Signing,
  type StakeUnit,
} from "@/components/markets/market-actions";
import {
  MarketStage,
  type StagePicture,
} from "@/components/markets/market-stage";
import { SetupSheet } from "@/components/markets/setup-sheet";
import { Sparkline } from "@/components/markets/sparkline";
import {
  buckets,
  groupsNumberBps,
  percentOf,
  showsMarker,
  sparkEligible,
  weightCaption,
  numberCaption,
} from "@/lib/ledger/weight";
import { currentUser } from "@/lib/auth/session";
import { contracts } from "@/lib/chain/contracts";
import { daresDomain, Stalemate } from "@/lib/chain/typed-data";
import { denominationById } from "@/lib/ledger/denominations";
import { askerLine, isMember, setLabel } from "@/lib/ledger/groups";
import { dareOnchainId } from "@/lib/ledger/ids";
import { numbersVisible } from "@/lib/ledger/market-view";
import {
  answersOf,
  confidenceFor,
  createTypedData,
  marketById,
  positionsOf,
  reconcileFromIndexer,
  stateOf,
  tally,
  unitOf,
  VOID_OUTCOME,
  votesOf,
} from "@/lib/ledger/markets";
import { marketShare } from "@/lib/ledger/share";
import {
  clockOf,
  closesLabel,
  dateLabel,
  dayLabel,
  daysBetween,
  firstName,
  fromThatNight,
  lockedLabel,
  untilLabel,
} from "@/lib/ui/copy";
import { hueFor } from "@/lib/ui/hue";
import { formatMoney, unitWords } from "@/lib/ui/units";
import { viewerClock } from "@/lib/ui/zone";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const share = await marketShare(id);
  return {
    title: share.title,
    description: share.description,
    robots: { index: false, follow: false },
    openGraph: { title: share.title, description: share.description },
  };
}

/** The market screen's information sheet (10.1): one per state that changes what a person can do. */
function infoKeyFor(state: string, memory: boolean, kind: "binary" | "numeric" | "categorical"): string {
  if (memory) return "market-memory";
  if (state === "draft") return "market-draft";
  const swap = kind === "numeric" ? "-number" : kind === "categorical" ? "-pick" : "";
  if (state === "open") return `market-open${swap}`;
  if (state === "locked") return `market-voting${swap}`;
  return "market-ended";
}

/** An outcome as the sheet's word: yes, no, nobody can tell, "n:" and the number on a number question, or "a:" and the answer's index on a pick-one question. */
const wordFor =
  (numeric: boolean, pickOne: boolean) =>
  (o: bigint | null): Word | null =>
    o === null ? null : o === VOID_OUTCOME ? "void" : pickOne ? `a:${o.toString()}` : numeric ? `n:${o.toString()}` : o === 1n ? "yes" : "no";

export default async function MarketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ side?: string }>;
}) {
  const clock = await viewerClock();
  const { id } = await params;
  const me = await currentUser();
  // Arriving from a link with no account (docs/design.md 3.17; PLANNING.md section 4): the market's own screen, and a way in without one.
  if (!me) return <GhostMarketPage id={id} clock={clock} />;

  let d = /^[0-9a-f-]{36}$/i.test(id) ? await marketById(id) : null;
  // A revoked or malformed link (3.17): the code screen with a form-level message, signed in or not.
  if (!d) return <DeadLink signedIn />;
  const member = await isMember(d.groupId, me.id);
  // A locked market the chain has already decided, whose result never got written here: take the chain's word.
  if (
    d.lockedAt &&
    !d.resolvedAt &&
    member &&
    (await reconcileFromIndexer(d.id))
  )
    d = (await marketById(id)) ?? d;
  // The scheduler's jobs are all reachable without it: opening a question that was set to go unsettled, after
  // its time, settles that here and now.
  if (
    d.lockedAt &&
    !d.resolvedAt &&
    d.stalemate === "void" &&
    d.resolvesBy &&
    d.resolvesBy.getTime() < clock.now &&
    member
  ) {
    if (await expireMarket(d.id).catch(() => false))
      d = (await marketById(id)) ?? d;
  }
  // An argument whose proposal never arrived (the model was down when it locked) asks again, off the critical path.
  if (
    d.pace === "argument" &&
    d.lockedAt &&
    !d.resolvedAt &&
    !d.aiProposedAt &&
    clock.now - d.lockedAt.getTime() > 20_000
  )
    after(() => proposeForArgument(id).catch(() => undefined));
  const state = stateOf(d);
  if (state === "draft" && d.creatorId !== me.id) notFound();
  const ink = inkOf(d);
  // A What's on market (3.33, 3.35): the question and game it came from, and whether the final score answers it.
  const fromTemplate = await templateOfMarket(d);
  const decidedByScore = fromTemplate?.template.decidedByScore === true;
  const game = fromTemplate?.game ?? null;
  const feedFinal = game && game.finalSeenAt && game.homeScore !== null && game.awayScore !== null ? { home: game.homeScore, away: game.awayScore } : null;
  // Whether the feed settles it at all (the score, or the play-by-play for the first drive), and the two teams as stamps (3.40).
  const decidedByFeed = fromTemplate?.template.decidedByFeed === true;
  const firstDrive = fromTemplate?.template.key === "first_drive";
  const twoTeams = fromTemplate?.template.key === "home_wins" || fromTemplate?.template.key === "margin";
  const teams: { away: TeamFace; home: TeamFace; reach: number } | null = game && twoTeams ? { away: { abbr: game.awayAbbr, name: game.awayShort, color: game.awayColor }, home: { abbr: game.homeAbbr, name: game.homeShort, color: game.homeColor }, reach: SLIDER_REACH[game.sport as Sport] ?? 35 } : null;
  const whoWins = teams !== null && fromTemplate?.template.key === "home_wins";
  const feedEnding = d.feedEnding;
  // On a signed margin the unit carries its shift and the two sides, so every number on this screen reads "Giants by 7".
  const numberUnit = ((u) => (u && fromTemplate?.template.key === "margin" && fromTemplate.template.shift !== null && game ? { ...u, margin: { shift: fromTemplate.template.shift.toString(), home: game.homeShort, away: game.awayShort } } : u))(unitOf(d));
  const answers = answersOf(d);
  const word = wordFor(numberUnit !== null, answers !== null);
  /** A pick-one answer's words for the viewer: a person answer reads as their current first name, the viewer as "You" (3.30). Filled once the people are read. */
  let pickAnswers: PickOneAnswer[] | null = null;
  /** "14 shirts", "he fell asleep", "yes", "no", "nobody can tell", "Priya", "a field goal": an outcome in the middle of a sentence, in the market's words where it has them (3.25). */
  const SAID = (w: Word): string => {
    if (w === "yes" || w === "no") return saidWord(d, w === "yes");
    if (w === "void") return "nobody can tell";
    if (w.startsWith("a:")) {
      const a = pickAnswers?.find((x) => x.index === Number(w.slice(2)));
      return a ? (a.text === "You" ? "you" : saidAnswer({ text: a.text, userId: a.person ? "person" : null })) : "that one";
    }
    return numberUnit ? unitPhrase(BigInt(w.slice(2)), numberUnit) : w.slice(2);
  };
  const wells = ((w) => (w ? { yes: w.yesWell, no: w.noWell } : null))(outcomeWordsOf(d));

  const [group] = await db
    .select()
    .from(schema.groups)
    .where(eq(schema.groups.id, d.groupId))
    .limit(1);
  if (!member) {
    // Someone signed in, holding the link, and not in yet: the invitation, and nothing it could cost (3.17).
    const [creator] = await db
      .select({ id: schema.users.id, displayName: schema.users.displayName })
      .from(schema.users)
      .where(eq(schema.users.id, d.creatorId))
      .limit(1);
    const inCount = (await positionsOf(d.id)).length;
    const COUNT = [
      "",
      "One friend is in",
      "Two friends are in",
      "Three friends are in",
      "Four friends are in",
      "Five friends are in",
      "Six friends are in",
    ];
    return (
      <Screen>
        <TopBar back />
        <div className="py-2">
          <InvitePreview
            viewerName={firstName(me.displayName)}
            data={{
              dareId: d.id,
              inviter: {
                name: firstName(creator?.displayName ?? "A friend"),
                hue: hueFor(d.creatorId),
              },
              groupLabel: group?.name ?? null,
              question: d.title,
              mark: markRefOf(d),
              countLine:
                inCount === 0
                  ? null
                  : (COUNT[inCount] ?? "A lot of friends are in"),
              decidesLine: d.resolvesBy
                ? `Decided ${closesLabel(d.resolvesBy, new Date(clock.now), clock.zone)}, by the people in it.`
                : null,
              criterionLine: d.criterion
                ? `Decided ${d.criterion}, and by nothing else.`
                : null,
              stalemateLine:
                d.stalemate === "void"
                  ? "If nobody can agree how it came out, it goes unsettled."
                  : "If nobody can agree how it came out, the tiebreaker everyone agreed to hears both sides and calls it. Being in means you’re fine with that.",
              argument: d.pace === "argument",
              finished: state !== "open",
            }}
          />
        </div>
      </Screen>
    );
  }

  const denomination = await denominationById(d.denomId);
  if (!denomination) notFound();
  const [positions, votes, statements, seats, media] = await Promise.all([
    positionsOf(d.id),
    votesOf(d.id),
    db
      .select({
        userId: schema.dareStatements.userId,
        statement: schema.dareStatements.statement,
        statedAt: schema.dareStatements.statedAt,
      })
      .from(schema.dareStatements)
      .where(
        and(
          eq(schema.dareStatements.dareId, d.id),
          eq(schema.dareStatements.kind, "update"),
        ),
      )
      .orderBy(asc(schema.dareStatements.statedAt)),
    db
      .select({ userId: schema.groupMembers.userId })
      .from(schema.groupMembers)
      .where(
        and(
          eq(schema.groupMembers.groupId, d.groupId),
          isNotNull(schema.groupMembers.userId),
          isNull(schema.groupMembers.leftAt),
        ),
      ),
    // Photos on the market (docs/marks-and-memories.md): memories for the frame, screenshots for the claim, told apart by
    // their role. The album is open the whole time (3.39, amended 2026-09-27): a memory is everyone's the moment it lands.
    mediaOnMarket(d.id),
  ]);
  const ids = Array.from(
    new Set([
      d.creatorId,
      ...positions.map((p) => pidOf(p)),
      ...votes.map((v) => v.userId),
      ...statements.map((s) => s.userId),
      ...(answers?.flatMap((a) => (a.userId ? [a.userId] : [])) ?? []),
    ]),
  );
  // Everyone on the screen, account-holder or ghost: a ghost's number draws like anyone's (PLANNING.md section 4).
  const person = await participantsOf(ids);
  const nameOf = (uid: string) =>
    uid === me.id ? "You" : (person.get(uid)?.displayName ?? "Someone");
  const first = (uid: string) =>
    uid === me.id
      ? "You"
      : firstName(person.get(uid)?.displayName ?? "Someone");

  // The answers as this viewer reads them (3.30, 3.31): a person by their current first name, the viewer as "You".
  // The words say "You"; the avatar keeps the person's own initial (found in the real session: a "Y" avatar).
  pickAnswers = answers ? answers.map((a) => ({ index: a.index, text: a.userId ? first(a.userId) : a.text, person: a.userId ? { name: person.get(a.userId)?.displayName ?? a.text, hue: hueFor(a.userId) } : null })) : null;
  const mine = positions.find((p) => p.userId === me.id) ?? null;
  // An entry made on a friend's phone (3.45) names the host in its caption.
  const hostName = mine?.enteredBy && mine.enteredBy !== me.id ? firstName((await db.select({ displayName: schema.users.displayName }).from(schema.users).where(eq(schema.users.id, mine.enteredBy)))[0]?.displayName ?? "a friend") : null;
  const show = numbersVisible(d, mine !== null);
  const others = positions.filter((p) => p.userId !== me.id);
  const pins = positions.map((p) => ({
    id: pidOf(p),
    name: person.get(pidOf(p))?.displayName ?? "Someone",
    percent: Number(p.value) / 100,
    ghost: person.get(pidOf(p))?.ghost === true,
  }));
  // A number question's ruler (3.5): everyone's number and, once there is one, the answer.
  const answerNumber = numberUnit && d.resolvedOutcome !== null && d.resolvedOutcome !== VOID_OUTCOME && state === "resolved" ? d.resolvedOutcome : null;
  const rulerData = numberUnit && show ? rulerFor({ unit: numberUnit, answer: answerNumber === null ? null : answerNumber.toString(), people: positions.map((p) => ({ id: pidOf(p), name: person.get(pidOf(p))?.displayName ?? "Someone", ghost: person.get(pidOf(p))?.ghost === true, percent: null, number: p.value.toString(), pick: null })) }) : null;
  /** "14 shirts · $5", "70% · $5", "John · $5": a person's number, or their pick, and what they put on it. */
  // The pick-one picture (3.25, 3.31): who picked each answer, and each answer's share of everything riding.
  const pickers = pickAnswers ? pickAnswers.map((a) => positions.filter((p) => Number(p.value) === a.index).map((p) => ({ name: person.get(pidOf(p))?.displayName ?? "Someone", hue: hueFor(pidOf(p)), ghost: person.get(pidOf(p))?.ghost === true }))) : [];
  const pickShares = pickAnswers ? answerShares(pickAnswers.map((a) => positions.filter((p) => Number(p.value) === a.index).reduce((sum, p) => sum + p.stake, 0n))) : [];

  const { chainId, dares } = contracts();
  const signing: Signing = {
    domain: daresDomain(chainId, dares.address),
    dareOnchainId: dareOnchainId(d.id),
    stalemate: d.stalemate === "void" ? Stalemate.Void : Stalemate.Arbitrate,
    ledgerWallet: me.ledgerWallet,
    governanceWallet: me.governanceWallet,
    confidenceBps: confidenceFor(d),
  };
  if (state === "draft") {
    const c = createTypedData(d).message;
    signing.create = {
      groupId: c.groupId,
      kind: c.kind,
      pace: c.pace,
      termsHash: c.termsHash,
      denomId: c.denomId,
      range: c.range.toString(),
      options: c.options,
      resolvesBy: c.resolvesBy.toString(),
    };
  }
  const unit: StakeUnit = {
    monetary: denomination.monetary,
    quantifiable: denomination.quantifiable,
    singular:
      denomination.template === "next_time" ? "next time" : denomination.label,
    plural: denomination.pluralLabel,
  };
  const stakeWords = (s: bigint) =>
    denomination.monetary ? formatMoney(s) : unitWords(denomination, s);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://dareful.app";
  const now = new Date(clock.now);
  // After it ends (3.37): settled, voided or expired. The memory view is the same screen from the second calendar day.
  const ended = state === "resolved" || state === "voided" || state === "expired";
  const endedAt = d.resolvedAt ?? d.lockedAt ?? d.createdAt;
  const memoryView = ended && daysBetween(endedAt, now, clock.zone) >= 1;
  const night = fromThatNight(endedAt, now, clock.zone);
  // Someone who is in adds a memory while it is open (the camera, 3.39) and once it has ended (the library, 3.8); nobody adds one while it is being called.
  const canAdd = (ended || state === "open") && mine !== null && storageConfigured();
  // The picture of where everyone landed, for someone who is in. Weights when numbers may be seen (an open
  // question once you have picked, or any question once locked); otherwise who is in and nothing about where.
  const entries = positions.map((p) => ({
    id: pidOf(p),
    stake: p.stake,
    valueBps: p.value,
  }));
  const number = groupsNumberBps(entries);
  const axis = numberUnit && show && mine ? numberAxis(positions.map((p) => ({ id: pidOf(p), stake: p.stake, value: p.value })), numberUnit) : null;
  const pickBars: PickOneBar[] = pickAnswers ? pickAnswers.map((a) => ({ stake: positions.filter((p) => Number(p.value) === a.index).reduce((sum, p) => sum + (p.stake > 0n ? p.stake : 0n), 0n).toString(), noStake: positions.filter((p) => Number(p.value) === a.index && p.stake <= 0n).length })) : [];
  const picture: StagePicture | null = !mine
    ? null
    : show && pickAnswers
      ? { kind: "picks", bars: pickBars, entries: positions.length, caption: pickOneCaption({ entries: positions.map((p) => ({ id: pidOf(p), stake: p.stake, pick: Number(p.value) })), answers: pickAnswers.map((a) => a.text), viewerId: me.id, nameOf: (id) => firstName(person.get(id)?.displayName ?? "Someone"), stakeWords }) }
    : show && numberUnit
      ? axis
        ? { kind: "numbers", axis: serialiseAxis(axis), caption: [numberCaption({ entries: positions.map((p) => ({ id: pidOf(p), stake: p.stake, value: p.value })), viewerId: me.id, nameOf: (id) => firstName(person.get(id)?.displayName ?? "Someone"), stakeWords, valueWords: (v) => unitPhrase(v, numberUnit) }), axis.offHigh || axis.offLow ? "One number sits past the end so the rest can be read." : null].filter(Boolean).join(" ") || null }
        : null
      : show
      ? {
          kind: "weights",
          buckets: buckets(entries).map((b) => ({
            n: b.n,
            stake: b.stake.toString(),
            noStake: b.noStake,
          })),
          group:
            showsMarker(entries) && number !== null
              ? { percent: percentOf(number) }
              : null,
          caption: weightCaption({
            entries,
            viewerId: me.id,
            nameOf: (id) => firstName(person.get(id)?.displayName ?? "Someone"),
            stakeWords,
          }),
        }
      : null;
  const series =
    state === "open" || state === "locked"
      ? await db
          .select({
            at: schema.dareNumberSeries.at,
            valueBps: schema.dareNumberSeries.valueBps,
          })
          .from(schema.dareNumberSeries)
          .where(eq(schema.dareNumberSeries.dareId, d.id))
          .orderBy(asc(schema.dareNumberSeries.at))
      : [];
  // Both conditions, checked here and now: a slow question with three in and a fast one with six both exist.
  const spark =
    show &&
    mine &&
    !numberUnit &&
    !pickAnswers &&
    number !== null &&
    sparkEligible({
      openedAt: d.createdAt,
      now,
      entries: positions.length,
      points: series.length,
    });
  const sparkline = spark ? (
    <Sparkline
      points={series.map((x) => ({
        at: x.at.getTime(),
        percent: x.valueBps / 100,
      }))}
      openedLabel={dayLabel(d.createdAt, clock.zone)}
      currentPercent={percentOf(number ?? 0n)}
    />
  ) : null;
  const lockedLine = d.lockedAt
    ? lockedLabel(d.lockedAt, now, clock.zone)
    : null;
  const until = d.resolvesBy
    ? untilLabel(d.resolvesBy, now, clock.zone)
    : "until it closes";
  // An argument's two numbers default to all the way on opposite sides, so whoever is wrong is out the whole
  // thing; either of them can soften theirs before they're in. The other side is not a secret in an argument:
  // taking the opposite one is the whole act, so the opponent is told which side is taken, never the number.
  const firstIn = d.pace === "argument" ? (others[0] ?? null) : null;
  const argument =
    d.pace === "argument"
      ? {
          defaultPercent: firstIn
            ? firstIn.value >= 5000n
              ? 0
              : 100
            : (await searchParams).side === "no"
              ? 0
              : 100,
          otherSays: firstIn
            ? {
                name: firstName(
                  person.get(pidOf(firstIn))?.displayName ?? "They",
                ),
                side:
                  firstIn.value >= 5000n ? ("yes" as const) : ("no" as const),
              }
            : null,
        }
      : null;
  const stage = (
    <MarketStage
      dareId={d.id}
      signing={signing}
      unit={unit}
      state={
        state === "draft" ? "draft" : state === "locked" ? "locked" : "open"
      }
      me={{ name: me.displayName, hue: hueFor(me.id) }}
      mine={
        mine
          ? {
              percent: numberUnit || pickAnswers ? 0 : Number(mine.value) / 100,
              ...(numberUnit ? { number: mine.value.toString() } : {}),
              ...(pickAnswers ? { pick: Number(mine.value) } : {}),
              stake: mine.stake.toString(),
              stakeWords: stakeWords(mine.stake),
              // Bound from a ghost's entry and never signed: keeping it is the signature (PLANNING.md section 4, "One phone").
              unsigned: state === "open" && mine.enterSignature === null,
              // On a blind market an entry is final once made (3.22, 3.31), which the server enforces; a bound ghost's unsigned numbers may still be kept.
              final: d.revealMode === "blind" && mine.enterSignature !== null,
              // Made on a friend's phone (3.45): whose, and, on a blind market while open, withdrawable from here and never enterable again.
              ...(hostName ? { from: hostName, withdrawable: d.revealMode === "blind" && state === "open" } : {}),
            }
          : null
      }
      signedInAs={mine ? null : firstName(me.displayName)}
      blind={d.revealMode === "blind"}
      picture={picture}
      numberUnit={numberUnit}
      teams={teams}
      consent={decidedByFeed ? (firstDrive ? DRIVE_CONSENT : CONSENT) : null}
      pickOne={pickAnswers ? { answers: pickAnswers } : null}
      mark={d.markKind === "emoji" ? d.markValue : null}
      argument={argument}
      lockedLine={lockedLine}
      changeUntil={until}
      farOff={
        numberUnit && farOffThreshold(d) !== null
          ? { threshold: (farOffThreshold(d) as bigint).toString(), scale: d.rangeSource === "asker" && d.range !== null ? d.range.toString() : null }
          : null
      }
    />
  );
  const more = (
    <SetupSheet>
      <p className="text-body-sm text-ink-2">
        {d.revealMode === "blind"
          ? "Once you’re in you see everyone’s so far, and yours is final."
          : "Once you’ve picked, you can see where the stake sits."}{" "}
        What’s riding on it is in{" "}
        {denomination.monetary ? "dollars" : unit.plural}, the same for
        everyone, so it can be weighed.
      </p>
      {show && !numberUnit && !pickAnswers && number !== null && showsMarker(entries) ? (
        <p className="text-body-sm text-ink-2">
          The group’s number, exactly: {(Number(number) / 100).toFixed(1)}%.
        </p>
      ) : null}
      {axis?.marker && numberUnit ? (
        <p className="text-body-sm text-ink-2">
          The group’s number is {unitPhrase(BigInt(axis.marker.chip.replace(/,/g, "")), numberUnit)}: half of what’s riding sits at or below it.
        </p>
      ) : null}
      {ended && (statements.length > 0 || media.record.length > 0) ? (
        // On the record once it has ended (3.24): what people said happened, and what was attached by anyone but the claimant.
        <div className="flex flex-col gap-2">
          <p className="text-label text-ink-3">How it was called</p>
          {statements.map((s) => (
            <p key={s.userId} className="text-body-sm text-ink-2">
              <span className="text-ink">{first(s.userId)}:</span> {s.statement}
            </p>
          ))}
          {media.record.length > 0 ? (
            <ul className="flex flex-wrap gap-2" aria-label="Also attached">
              {media.record.map((e) => (
                <li key={e.id} className="flex items-center gap-2 text-caption text-ink-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- behind the door */}
                  <img src={`/api/media/${e.id}?size=thumb`} alt={`What ${first(e.author.id)} attached`} width={44} height={44} loading="lazy" data-record={e.id} className="h-11 w-11 rounded-stamp-28 bg-surface-2 object-cover" />
                  <span>{first(e.author.id)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {d.creatorId === me.id &&
      state !== "resolved" &&
      state !== "voided" &&
      state !== "expired" ? (
        <InkPicker dareId={d.id} current={ink} />
      ) : null}
    </SetupSheet>
  );
  // The details (3.25): four facts with 96px labels, on the market's surface. Everything else about how it
  // works is behind More, where someone can go looking for it (4.9).
  const details = (
    <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-card border border-line bg-surface px-4 py-[14px]">
      <dt className="text-label text-ink-3">Counts if</dt>
      <dd className="text-body text-ink">{d.termsText}</dd>
      <dt className="text-label text-ink-3">Decided</dt>
      <dd className="text-body text-ink">
        {decidedByScore ? (
          "By the final score, once the game is over"
        ) : firstDrive ? (
          "By the play-by-play, once the game is over"
        ) : d.resolvesBy ? (
          <>
            by{" "}
            <When
              iso={d.resolvesBy.toISOString()}
              zone={clock.zone}
              serverNow={clock.now}
              style="day"
            />
            , by the people in it
          </>
        ) : (
          "the moment both of you are in"
        )}
        {d.criterion ? `, ${d.criterion}` : ""}
      </dd>
      {fromTemplate ? (
        // Once it is running it looks like any other market, with one extra row (3.33): no badge, no link to other groups.
        <>
          <dt className="text-label text-ink-3">Question from</dt>
          <dd className="text-body text-ink">What’s on{game ? `, ${game.name}` : ""}</dd>
        </>
      ) : null}
      <dt className="text-label text-ink-3">Stakes</dt>
      <dd className="text-body text-ink">
        {denomination.monetary
          ? "Dollars"
          : unit.plural.charAt(0).toUpperCase() + unit.plural.slice(1)}
        , the same for everyone
      </dd>
      {/* The scoring scale, once, only when a person set it (3.26): the asker's, or a template's written by people; a scale the app set appears on no screen. */}
      {numberUnit && d.range !== null && (d.rangeSource === "asker" || d.rangeSource === "template") ? (
        <>
          <dt className="text-label text-ink-3">Scored on</dt>
          <dd className="text-body text-ink">Off by {withSeparators(d.range)} {d.range === 1n ? numberUnit.singular : numberUnit.plural} or more scores nothing. Closer scores more.</dd>
        </>
      ) : null}
      {whoWins && game && CAN_TIE[game.sport as Sport] ? (
        // The tie row (3.40): the deployed contract cannot score the middle, so a football tie is void.
        <>
          <dt className="text-label text-ink-3">If it’s a tie</dt>
          <dd className="text-body text-ink">{TIE_VOID}</dd>
        </>
      ) : null}
      <dt className="text-label text-ink-3">If it’s unclear</dt>
      <dd className="text-body text-ink">
        {decidedByScore
          ? UNCLEAR_BY_SCORE
          : firstDrive
            ? UNCLEAR_BY_PLAYS
            : d.stalemate === "void"
              ? "It’s called off and nothing changes hands."
              : "Everyone says their piece and the tiebreaker everyone agreed to calls it."}
      </dd>
    </dl>
  );
  const outcome = word(d.resolvedOutcome);
  // Who a nudge would go to, by first name: while open, group members with no number in; once locked, members
  // who have not called it. The server works out the real recipients again; this is only the sentence.
  const doneIds = new Set(
    state === "locked"
      ? votes.map((v) => v.userId)
      : positions.map((p) => p.userId).filter((x): x is string => x !== null),
  );
  const waitingIds = seats
    .map((x) => x.userId)
    .filter((x): x is string => x !== null && x !== me.id && !doneIds.has(x));
  const waitingUsers = waitingIds.length
    ? await db
        .select({ id: schema.users.id, displayName: schema.users.displayName })
        .from(schema.users)
        .where(inArray(schema.users.id, waitingIds))
    : [];
  const waitingNames = waitingUsers.map((u) => firstName(u.displayName));
  const edges =
    state === "resolved"
      ? await db
          .select()
          .from(schema.obligations)
          .where(
            and(
              eq(schema.obligations.origin, "dare"),
              eq(schema.obligations.originId, d.id),
            ),
          )
      : [];

  const canArbitrate = arbitrationOpen(d, now);
  const cases =
    state === "locked" && d.stalemate === "arbitrate"
      ? await db
          .select({
            userId: schema.dareStatements.userId,
            statement: schema.dareStatements.statement,
          })
          .from(schema.dareStatements)
          .where(
            and(
              eq(schema.dareStatements.dareId, d.id),
              eq(schema.dareStatements.kind, "statement"),
            ),
          )
          .orderBy(asc(schema.dareStatements.statedAt))
      : [];
  const myVote = word(votes.find((v) => v.userId === me.id)?.outcome ?? null);
  const soft =
    d.aiConfidenceBps !== null &&
    d.aiConfidenceBps < 9000 &&
    d.aiOutcome !== null &&
    d.aiOutcome !== VOID_OUTCOME;
  const counted = tally(votes);
  const orderedVotes = [...votes].sort(
    (a, b) => a.signedAt.getTime() - b.signedAt.getTime(),
  );
  // The question band (3.25): the stamp on the market's ground, the citron dot when it is waiting on this person
  // with a clock, the state mark, and a clock, over the question and who asked.
  const bandState: MarketMark =
    state === "draft"
      ? "draft"
      : state === "open"
        ? mine
          ? "in"
          : "open"
        : state === "locked"
          ? canArbitrate && counted.length > 1
            ? "deadlocked"
            : votes.length > 0
              ? "voting"
              : "locked"
          : state;
  const bandClockWords = bandClock({ state, resolvesBy: d.resolvesBy, resolvedAt: d.resolvedAt, resolvedBy: d.resolvedBy, votes: votes.length, now, zone: clock.zone });
  const bandLive =
    d.resolvesBy !== null &&
    ((state === "open" && !mine) || (state === "locked" && myVote === null));
  // This person's last tap here is sent and still going through (5.2): the lock while open, the resolution the vote decided while locked.
  const onWayHere = state === "open" || state === "locked" ? await onWayFor(me.id, now).then((w) => w.locks.has(d.id) || w.resolves.has(d.id)) : false;
  // A set with no name is named by its people (4.7, 3.38): the seats beside the asker, on a draft and a live market alike.
  const seatNames = !group?.name && seats.some((x) => x.userId !== me.id) ? (await db.select({ displayName: schema.users.displayName }).from(schema.users).where(inArray(schema.users.id, seats.map((x) => x.userId).filter((x): x is string => x !== null)))).map((u) => u.displayName) : [];
  const setName = group?.name ?? (seatNames.length > 1 ? setLabel({ name: null, isDyad: group?.isDyad ?? false, memberNames: seatNames, viewerName: me.displayName }) : null);
  // The band (3.25, 9.4, 9.7): the shared component, so the shell a row draws before this screen arrives is the same geometry.
  const band = (
    <QuestionBand
      state={bandState}
      clock={memoryView ? dateLabel(endedAt, clock.zone) : bandClockWords}
      live={bandLive}
      onWay={onWayHere}
      draft={state === "draft"}
      mark={markRefOf(d)}
      title={d.title}
      asker={{ name: person.get(d.creatorId)?.displayName ?? "?", hue: hueFor(d.creatorId), line: askerLine(first(d.creatorId), setName, group?.isDyad ?? false) }}
      forWhom={setName ? `For ${setName}` : undefined}
      ink="var(--market-ink)"
      hue={hueFor(me.id)}
    />
  );
  // The source card (3.35): where a person's claim card stands, once the final score is in and before anyone has
  // said. No avatar and no "says": the score the terms named is speaking, not a person.
  const finalLabel = game?.finalSeenAt ? `${game.finalSeenAt.toLocaleDateString("en-US", { timeZone: clock.zone, weekday: "short" })} ${clockOf(game.finalSeenAt, clock.zone)}` : null;
  const ticket = (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M4 9a2 2 0 0 0 2-2V6h12v1a2 2 0 0 0 2 2v6a2 2 0 0 0-2 2v1H6v-1a2 2 0 0 0-2-2z" />
      <path d="M12 7v10" strokeDasharray="1.5 2.5" />
    </svg>
  );
  const homeFace: TeamFace | null = game ? { abbr: game.homeAbbr, name: game.homeShort, color: game.homeColor } : null;
  const awayFace: TeamFace | null = game ? { abbr: game.awayAbbr, name: game.awayShort, color: game.awayColor } : null;
  const sourceCard =
    state === "locked" && decidedByScore && feedFinal && game && homeFace && awayFace && votes.length === 0 ? (
      <section className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3" data-source-card="">
        <p className="flex items-center gap-2 text-label text-ink-3">
          {ticket}
          <span>From the final score</span>
        </p>
        {[
          { face: homeFace, score: feedFinal.home },
          { face: awayFace, score: feedFinal.away },
        ]
          .sort((a, b) => b.score - a.score)
          .map((row, i) => (
            <p key={row.face.abbr} className={`flex items-center justify-between gap-3 text-body-strong ${i === 0 && feedFinal.home !== feedFinal.away ? "text-ink" : "text-ink-2"}`}>
              <span className="inline-flex items-center gap-2">
                <TeamStamp team={row.face} size={20} />
                {row.face.name}
              </span>
              <span className="tabular-nums">{row.score}</span>
            </p>
          ))}
        <p className="text-caption text-ink-3">{finalLabel ? `Final, ${finalLabel}. ` : "Final. "}The terms said the final score decides.</p>
      </section>
    ) : state === "locked" && firstDrive && game && game.firstDriveResult && d.feedOutcome !== null && votes.length === 0 ? (
      // The play-by-play's card (docs/decisions.md, the game page): the first drive as the source recorded it, no avatar and no "says".
      <section className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3" data-source-card="plays">
        <p className="flex items-center gap-2 text-label text-ink-3">
          {ticket}
          <span>From the play-by-play</span>
        </p>
        <p className="text-body-strong text-ink">{game.firstDriveResult}</p>
        <p className="text-caption text-ink-3">The terms said the play-by-play decides.</p>
      </section>
    ) : null;
  // The claim card while voting (3.25): who first said how it came out, and what they said happened.
  const claimant = state === "locked" ? (orderedVotes[0] ?? null) : null;
  const claimWord = claimant ? word(claimant.outcome) : null;
  const claimSaid = claimant
    ? (statements.find((s) => s.userId === claimant.userId)?.statement ?? null)
    : null;
  // The claim card (3.37): the clip on the left, the claimant and their words on the right, the line and when the clip was shot under them.
  const claimClips = claimant ? media.evidence.filter((e) => e.author.id === claimant.userId) : [];
  const clip = claimClips[0] ?? null;
  const claim =
    claimant && claimWord ? (
      <section className="flex items-start gap-3 rounded-card border border-line bg-surface p-3">
        {clip ? (
          // Opens full screen in the viewer (3.37, 3.38), never a new tab; the claimant's other attachments follow it.
          <ClipView items={claimClips.map((c, i) => ({ id: c.id, alt: `What ${first(claimant.userId)} attached, ${i + 1} of ${claimClips.length}`, removable: false }))} thumb={`/api/media/${clip.id}?size=thumb`} label={`What ${first(claimant.userId)} attached, full size`} more={claimClips.length - 1} stickers={storageConfigured()} />
        ) : null}
        <div className="flex min-w-0 flex-col gap-1">
          <p className="flex items-center gap-2 text-body-strong text-ink">
            <Avatar name={person.get(claimant.userId)?.displayName ?? "?"} hue={hueFor(claimant.userId)} size={22} />
            <span>
              {first(claimant.userId)} {claimant.userId === me.id ? "say" : "says"} {SAID(claimWord)}
            </span>
          </p>
          {claimSaid || clip?.capturedAt ? (
            <p className="text-caption text-ink-3">
              {[claimSaid, clip?.capturedAt ? `shot ${clockOf(clip.capturedAt, clock.zone)}` : null].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
      </section>
    ) : null;
  // The sheet on a locked market: whose move it is, and the move (3.24).
  const callSheet =
    state === "locked" ? (
      <CallSheet
        dareId={d.id}
        signing={signing}
        threshold={d.threshold}
        quorum={seats.length}
        me={{ name: me.displayName, hue: hueFor(me.id) }}
        myVote={myVote}
        votes={orderedVotes.map((v) => ({
          name: first(v.userId),
          hue: hueFor(v.userId),
          outcome: word(v.outcome) ?? "void",
        }))}
        statements={statements.map((s) => ({
          name: first(s.userId),
          said: s.statement,
        }))}
        evidence={media.evidence.map((e) => ({ id: e.id, by: first(e.author.id) }))}
        wells={wells}
        answers={pickAnswers}
        teams={teams}
        myNote={myVote === null && statements.some((s) => s.userId === me.id)}
        feed={
          decidedByFeed && game
            ? {
                source: firstDrive ? "plays" : "score",
                waiting: d.feedOutcome === null,
                canSayYourself: now.getTime() >= game.expectedEndAt.getTime() + SAY_YOURSELF_AFTER_MS,
                tie: d.feedOutcome === VOID_OUTCOME && feedFinal ? `${scoreLine(feedFinal, game.homeShort, game.awayShort)}. The terms make a tie void, so nothing changes hands, and it counts against nobody.` : null,
              }
            : null
        }
        proposal={
          decidedByScore && d.feedOutcome !== null && d.feedOutcome !== VOID_OUTCOME && feedFinal && game
            ? { outcome: word(d.feedOutcome), line: `From the final score: ${scoreLine(feedFinal, game.homeShort, game.awayShort)}.`, rationale: null, source: "feed" as const }
            : firstDrive && d.feedOutcome !== null && d.feedOutcome !== VOID_OUTCOME && game?.firstDriveResult
              ? { outcome: word(d.feedOutcome), line: `From the play-by-play: ${game.firstDriveResult}.`, rationale: null, source: "feed" as const }
            : d.aiRationale
            ? {
                outcome: word(d.aiOutcome),
                line:
                  d.aiOutcome === null
                    ? "The app can’t tell yet."
                    : word(d.aiOutcome) === "void"
                      ? "The app thinks the terms don’t settle it."
                      : soft
                        ? `The app leans ${SAID(word(d.aiOutcome) ?? "void")}, ${Math.round((d.aiConfidenceBps ?? 0) / 100)} to ${100 - Math.round((d.aiConfidenceBps ?? 0) / 100)}.`
                        : `The app thinks: ${SAID(word(d.aiOutcome) ?? "void")}.`,
                rationale: d.aiRationale,
                source: "app" as const,
              }
            : null
        }
        awaitingProposal={d.pace === "argument" && !d.aiProposedAt}
        numberUnit={numberUnit}
        split={
          d.stalemate === "arbitrate" && mine && counted.length > 1 && !decidedByScore
            ? {
                cases: cases.map((c) => ({
                  name: nameOf(c.userId),
                  said: c.statement,
                })),
                mine: cases.find((c) => c.userId === me.id)?.statement ?? null,
                canAsk: canArbitrate,
                line: d.resolvesBy
                  ? `The tiebreaker everyone agreed to can be asked ${closesLabel(d.resolvesBy, now, clock.zone) === "soon" ? "now" : `from ${closesLabel(d.resolvesBy, now, clock.zone)}`}.`
                  : "",
              }
            : null
        }
      />
    ) : null;
  const closest =
    state === "resolved" && outcome && outcome !== "void"
      ? positions.reduce<(typeof positions)[number] | null>(
          (m, p) =>
            p.score !== null && (m === null || (m.score ?? -1) < p.score)
              ? p
              : m,
          null,
        )
      : null;
  // The answer as a sentence (3.25): "14 shirts, then a seam gave out." when the claimant said what happened in a few words, else "14 shirts."; on a pick-one question "Priya, 40 minutes in." or "Priya.".
  const claimantSaid = state === "resolved" ? (statements.find((s) => s.userId === orderedVotes[0]?.userId)?.statement ?? null) : null;
  // The answer that happened on a pick-one question, as an index, and who called it: everyone who picked it (3.25), never a ranking among them.
  const pickedIndex = pickAnswers && state === "resolved" && d.resolvedOutcome !== null && d.resolvedOutcome !== VOID_OUTCOME ? Number(d.resolvedOutcome) : null;
  const pickCallers = pickedIndex === null ? [] : positions.filter((p) => Number(p.value) === pickedIndex).map((p) => first(pidOf(p)));
  const calledLine = pickAnswers ? calledItLine(pickCallers, pickCallers.includes("You")) : "";
  const answerLine = pickAnswers && pickedIndex !== null ? pickAnswerLine(pickAnswers.find((a) => a.index === pickedIndex)?.text ?? "Decided", claimantSaid) : answerNumber !== null && numberUnit ? `${unitPhrase(answerNumber, numberUnit)}${claimantSaid && claimantSaid.length <= 60 ? `, ${claimantSaid.charAt(0).toLowerCase()}${claimantSaid.slice(1).replace(/[.!]+$/, "")}.` : "."}` : outcomeLine(d, outcome === "yes");
  const offBy = (p: (typeof positions)[number]) => (answerNumber === null ? 0n : p.value > answerNumber ? p.value - answerNumber : answerNumber - p.value);
  const closestLine = pickAnswers ? calledLine : closest ? (numberUnit ? `${first(pidOf(closest))} ${closest.userId === me.id ? "were" : "was"} closest, ${offBy(closest) === 0n ? "dead on" : `off by ${withSeparators(offBy(closest))}`}.` : `${first(pidOf(closest))} ${closest.userId === me.id ? "were" : "was"} closest, at ${whoWins && teams ? leanPill(Number(closest.value) / 100, teams.away.name, teams.home.name) : `${Number(closest.value) / 100}%`}.`) : "";
  // The final score as the settled line's caption on a question the score answered (3.40): "Giants 24, Titans 17."
  const scoreCaption = game && feedFinal && (decidedByScore || twoTeams) && ended ? `${scoreLine(feedFinal, game.homeShort, game.awayShort)}.` : null;
  // The feed's ending, in one line after the ticket glyph (3.35, Endings): which of its three ways it took, or the play-by-play's.
  const endingLine =
    state === "resolved" && d.resolvedBy === "feed"
      ? feedEnding === "alone"
        ? "Decided by the final score, as the terms said. Nobody voted, and the score held for three days."
        : feedEnding === "drive"
          ? "Decided by the play-by-play, as the terms said. Nobody voted, and it held for three days."
          : "Decided by the final score, as the terms said. Nobody voted within a day."
      : null;
  const frameItems = media.frame.map((m) => ({ id: m.id, author: { name: m.author.displayName, hue: hueFor(m.author.id) }, removable: m.role === "memory" && m.author.id === me.id }));
  // The frame, or the empty slot for someone who can add, or nothing (3.8): never an empty frame.
  // "Make a sticker" in the full-screen photo (3.28), for any photo the viewer can see, while a cutout can be stored.
  const frameOrSlot = (height: 200 | 260) => (frameItems.length > 0 ? <MediaFrame items={frameItems} height={height} inset add={canAdd ? { night } : null} stickers={storageConfigured()} /> : canAdd ? <EmptySlot /> : null);
  const endedCaption =
    state === "voided"
      ? d.resolvedBy === "removed"
        ? "Nobody else got in."
        : d.resolvedBy === "arbitration"
        ? "The terms didn’t decide it. Nothing changes hands."
        : d.resolvedBy === "feed"
          ? feedEnding === "tie"
            ? `${scoreCaption ? `${scoreCaption} ` : ""}The terms make a tie void, so nothing changes hands, and it counts against nobody.`
            : feedEnding === "drive_unknown"
              ? "The play-by-play couldn’t say how it ended, so it’s void. Nothing changes hands, and it counts against nobody."
              : "The two results we check disagreed, so it’s void. Nothing changes hands, and it counts against nobody."
          : "Nothing changes hands."
      : state === "expired"
        ? "Nobody said what happened before it closed for good."
        : [scoreCaption, numberUnit || pickAnswers || whoWins ? closestLine : (claimantSaid ?? "")].filter(Boolean).join(" ");
  const endedOutcome = state === "voided" ? (d.resolvedBy === "removed" ? "Called off." : d.resolvedBy === "feed" && feedEnding === "tie" ? "A tie." : d.resolvedBy === "feed" && feedEnding === "drive_unknown" ? "No first drive to go by." : d.resolvedBy === "feed" ? "No final score to go by." : "Nobody could tell.") : state === "expired" ? "Never settled." : answerLine;
  const lineOrRuler = (resolved: boolean) =>
    pickAnswers ? (
      // The pick-one rows (3.25) where the call line would be: washed on the answer that happened, and on a void nothing washed.
      <PickOneRows answers={pickAnswers} pickers={pickers} shares={pickShares} outcome={resolved ? pickedIndex : null} />
    ) : numberUnit ? (
      rulerData ? <Ruler ruler={rulerData} state={resolved ? "resolved" : undefined} size="screen" surface="var(--ground)" /> : null
    ) : (
      <CallLine words={((w) => (w ? { yes: w.yesLine, no: w.noLine } : null))(outcomeWordsOf(d))} pins={pins} state={resolved ? "resolved" : "in"} outcome={resolved && outcome ? (outcome === "yes" ? 1 : 0) : undefined} size="screen" surface="var(--ground)" ends={teams} />
    );
  const settledOutcome = state === "resolved" && outcome !== null && outcome !== "void";
  const participants = positions.map((p) => pidOf(p));
  const people = new Map(Array.from(person.values(), (u) => [u.id, { id: u.id, displayName: u.displayName }] as const));
  // A provisional market leaves proposals where an onchain one leaves edges (PLANNING.md section 4): the pending ones are shown beside the confirmed.
  const proposed =
    state === "resolved" && d.onchainId === null
      ? await db.select().from(schema.obligationProposals).where(and(eq(schema.obligationProposals.origin, "dare"), eq(schema.obligationProposals.originId, d.id), eq(schema.obligationProposals.status, "pending")))
      : [];
  const transfers = [
    ...edges.map((e) => ({ fromId: e.fromUser, toId: e.toUser, quantity: e.quantity ?? 1n, closed: e.closedAt !== null })),
    ...proposed.map((p) => ({ fromId: (p.fromUser ?? p.fromClaim) as string, toId: (p.toUser ?? p.toClaim) as string, quantity: p.quantity ?? 1n, closed: false })),
  ];
  // "The rest of that night" (3.37), on the memory view only: other events that shared this night with the viewer.
  const restOfNight = memoryView && d.lockedAt && d.resolvedAt ? await restOfThatNight({ dareId: d.id, groupIds: [d.groupId], people: positions.map((p) => p.userId).filter((x): x is string => x !== null), viewerId: me.id, closedAt: d.lockedAt, endedAt: d.resolvedAt }).catch(() => []) : [];
  // The who's-in row (3.42): who is in, and the one place the market is shared from, for anyone who is in and, once settled, anyone who can see it.
  const whosInPeople = positions.map((p) => ({ name: person.get(pidOf(p))?.displayName ?? "Someone", hue: hueFor(pidOf(p)), ghost: person.get(pidOf(p))?.ghost === true, asked: pidOf(p) === d.creatorId, ...(p.claimId ? { claimId: p.claimId } : {}) }));
  const alone = positions.length === 1 && mine !== null && d.creatorId === me.id;
  // Holdouts (3.42): the people the market was sent to who are not in yet follow the stack as dashed avatars while it is open, and the count names both numbers.
  const holdouts = state === "open" ? waitingUsers.map((u) => ({ name: u.displayName, hue: hueFor(u.id) })) : [];
  // The count (3.42, ruled 2026-09-27): when the asker named people, the holdouts rule from the first entry ("1 of 6 in", with the dashed avatars); "Just you so far" only when nobody was named. Share stays the chalk while the asker is alone either way.
  const whosInCount = holdouts.length > 0 ? `${positions.length} of ${positions.length + holdouts.length} in` : alone ? "Just you so far" : `${positions.length} of you in`;
  // The people still out, in who's in (3.42, amended 2026-09-27): asked and not in while open, in the quorum and not voted once locked, each with a nudge beside them for anyone who is in.
  const stillOut = state === "open" || state === "locked" ? waitingUsers.map((u) => ({ id: u.id, name: u.displayName, hue: hueFor(u.id) })) : [];
  const relayWords = state === "locked" ? `We’re waiting on your call: ${d.title}` : `We’re waiting on you: ${d.title}`;
  const whosIn = (
    <WhosInRow people={whosInPeople} holdouts={holdouts} count={whosInCount} share={{ url: `${appUrl}/m/${d.id}`, title: d.title }} code={state === "open" ? { dareId: d.id, question: d.title, mark: markRefOf(d) } : null} chalk={state === "open" && alone} list={{ dareId: d.id, canRemove: state === "open" && d.creatorId === me.id, out: stillOut, stage: state === "locked" ? "vote" : "enter", canNudge: mine !== null, relay: { url: `${appUrl}/m/${d.id}`, text: relayWords } }} pass={state === "open" && mine ? { dareId: d.id, explained: me.handOverExplainedAt !== null } : null} />
  );
  // The photos while it is open and through the vote (3.37 and 3.39, amended 2026-09-27: the album is open the whole time): the same slot and frame as after it ends, last on the screen under the details, for everyone the door admits, someone in and the group it was asked in (a signed-in viewer past this point is one or the other: a non-member got the invitation above). The add tile and the empty slot are for someone who can add, which before the end means someone who is in while it is open; someone who only opened the link sees nothing here.
  const albumItems = media.memories.map((m) => ({ id: m.id, author: { name: m.author.displayName, hue: hueFor(m.author.id) }, removable: m.author.id === me.id }));
  // The memories alone: while it is being called, the claim's clip is on the claim card, never in a frame.
  const openFrame = albumItems.length > 0 ? <MediaFrame items={albumItems} height={200} inset add={canAdd ? { night } : null} stickers={storageConfigured()} /> : canAdd ? <EmptySlot /> : null;
  const openPhotos =
    (state === "open" || state === "locked") && openFrame ? (
      <section className="flex flex-col gap-2" data-open-photos="">
        {openFrame}
      </section>
    ) : null;
  // The one ask for the phone's permission (4.10): once, after first getting in, kept on the account.
  const headsUp = mine && (state === "open" || state === "locked") && !me.headsUpAnsweredAt ? <HeadsUp /> : null;
  const endedBody = !ended ? null : memoryView ? (
    // The memory it leaves: the photos first, the outcome and one line, the line or ruler, what it left, the rest of that night. No ranking.
    <>
      <section className="flex flex-col gap-3">
        {frameOrSlot(260)}
      </section>
      <section className="flex flex-col gap-2">
        <p className="text-serif-l text-ink">{endedOutcome}</p>
        {[scoreCaption, state === "resolved" && !numberUnit && !pickAnswers ? claimantSaid : null, state === "resolved" ? closestLine || null : endedCaption].filter(Boolean).length > 0 ? (
          <p className="text-body text-ink-2">{[state === "resolved" && scoreCaption ? scoreCaption : null, state === "resolved" && !numberUnit && !pickAnswers ? claimantSaid : null, state === "resolved" ? closestLine || null : endedCaption].filter(Boolean).join(" ")}</p>
        ) : null}
      </section>
      <section className="flex flex-col gap-3">{lineOrRuler(settledOutcome)}</section>
      {settledOutcome ? whosIn : null}
      {settledOutcome ? (
        <section className="flex flex-col gap-2 rounded-card border border-line bg-surface px-4 py-[14px]">
          {transfers.length === 0 ? <p className="text-body-sm text-ink-2">Nothing changed hands.</p> : <WhoHasWho transfers={transfers} people={people} participants={participants} denomination={denomination} viewerId={me.id} />}
        </section>
      ) : null}
      {restOfNight.length > 0 && d.lockedAt ? (
        <section className="flex flex-col gap-3">
          <SectionLabel>{nightHeading(d.lockedAt, clock.zone)}</SectionLabel>
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            {restOfNight.map((r, i) => (
              <Link prefetch={false} key={r.key} href={r.href} className={`relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}>
                <LinkPending />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-label text-ink-3">{r.kindLabel}</span>
                  <span className="text-body-strong text-ink">{r.subject}</span>
                  {r.caption ? <span className="text-caption text-ink-3">{r.caption}</span> : null}
                </span>
                {r.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element -- behind the door
                  <img src={r.thumb} alt="" width={60} height={60} loading="lazy" className="h-[60px] w-[60px] shrink-0 rounded-button bg-surface-2 object-cover" />
                ) : (
                  <span />
                )}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  ) : (
    // The settled screen (3.37): the outcome is the news, so it comes first; then the frame; the line; closest first; who's got who.
    <>
      <section className="flex flex-col gap-4">
        <p className="text-serif-l text-ink">{endedOutcome}</p>
        {endedCaption ? <p className="text-caption text-ink-2">{endedCaption}</p> : null}
        {endingLine ? (
          <p className="flex items-center gap-2 text-caption text-ink-3" data-feed-ending={feedEnding ?? ""}>
            {ticket}
            <span>{endingLine}</span>
          </p>
        ) : null}
        {frameOrSlot(200)}
        {pickAnswers && settledOutcome ? null : lineOrRuler(settledOutcome)}
      </section>
      {settledOutcome && !pickAnswers ? whosIn : null}
      {settledOutcome && pickAnswers ? (
        // A pick-one market's settled screen (3.25): "Everyone's pick" replaces the call line and closest first, then the who's-in row, and who's got who follows.
        <>
          <section className="flex flex-col gap-3">
            <SectionLabel>Everyone’s pick</SectionLabel>
            <PickOneRows answers={pickAnswers} pickers={pickers} shares={pickShares} outcome={pickedIndex} />
          </section>
          {whosIn}
          <section className="flex flex-col gap-2">
            <SectionLabel>Who’s got who</SectionLabel>
            {transfers.length === 0 ? <p className="text-body-sm text-ink-2">Nothing changes hands.</p> : <WhoHasWho transfers={transfers} people={people} participants={participants} denomination={denomination} viewerId={me.id} />}
          </section>
        </>
      ) : settledOutcome ? (
        <>
          <section className="flex flex-col gap-3">
            <SectionLabel>Closest first</SectionLabel>
            {numberUnit && rulerData && rulerData.answer ? (
              <NumberLeaderboard
                viewerId={me.id}
                said={numberUnit.margin ? (v) => unitPhrase(BigInt(v), numberUnit) : undefined}
                answer={rulerData.answer}
                standings={positions.map((p) => ({
                  userId: pidOf(p),
                  name: person.get(pidOf(p))?.displayName ?? "Someone",
                  value: p.value.toString(),
                  xPermille: rulerData.pins.find((x) => x.id === p.userId)?.xPermille ?? 0,
                  score: p.score ?? 0,
                  ghost: person.get(pidOf(p))?.ghost === true,
                }))}
              />
            ) : (
              <Leaderboard
                viewerId={me.id}
                ends={teams ? { away: teams.away.name, home: teams.home.name } : null}
                outcome={outcome === "yes" ? 1 : 0}
                standings={positions.map((p) => ({
                  userId: pidOf(p),
                  name: person.get(pidOf(p))?.displayName ?? "Someone",
                  percent: Number(p.value) / 100,
                  score: p.score ?? 0,
                  ghost: person.get(pidOf(p))?.ghost === true,
                }))}
              />
            )}
          </section>
          <section className="flex flex-col gap-2">
            <SectionLabel>Who’s got who</SectionLabel>
            <WhoHasWho transfers={transfers} people={people} participants={participants} denomination={denomination} viewerId={me.id} />
          </section>
        </>
      ) : null}
    </>
  );

  return (
    <div className="flex flex-1 flex-col">
      <InkRoot ink={ink} />
      <PhotoAdding dareId={d.id} night={night} canAdd={canAdd} capture={state === "open"} viewer={{ name: me.displayName, hue: hueFor(me.id) }}>
      <Screen arrive="fade">
        <TopBar back right={<>{group?.name ? <Chip>{group.name}</Chip> : null}{mine || state !== "open" ? more : null}</>} info={infoKeyFor(state, memoryView, pickAnswers ? "categorical" : numberUnit ? "numeric" : "binary")} />
        <div className="flex flex-col gap-7 py-2">
          {band}
          {game && awayFace && homeFace ? (
            // Part of a game (3.33): one 44px row back to the game page, with the two 20px stamps and a chevron; shown with one question too, since the page is where the rest of the menu waits.
            <Link prefetch={false} href={`/on/${game.id}?g=${d.groupId}`} className="relative -mt-3 flex h-11 items-center justify-between gap-3 rounded-button border border-line px-3" data-part-of={game.id}>
              <LinkPending />
              <span className="flex min-w-0 items-center gap-2">
                <span className="inline-flex items-center gap-1">
                  <TeamStamp team={awayFace} size={20} />
                  <TeamStamp team={homeFace} size={20} />
                </span>
                <span className="truncate text-body-sm font-semibold text-ink">Part of {game.name}</span>
              </span>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-3">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ) : null}

          {endedBody}

          {state === "draft" ? details : null}

          {state === "open" ? (
            <>
              {stage}
              {sparkline}
              {mine ? (
                whosIn
              ) : (
                // Before you're in (3.38): who is in and no number, with the lock glyph; where they landed shows once you are.
                <section className="flex items-center justify-between gap-3" data-friends-in="">
                  <div className="flex flex-col gap-1">
                    <AvatarStack people={whosInPeople} size={28} ring="var(--ground)" />
                    <p className="text-caption text-ink-2">{positions.length === 1 ? "One friend is in. Where they landed shows once you are." : `${positions.length} friends are in. Where they landed shows once you are.`}</p>
                  </div>
                  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-3">
                    <rect x="5" y="11" width="14" height="9" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                </section>
              )}
              {/* The asker's close, under the row and never the primary while the close is still ahead (3.42): it asks once, naming who it leaves out. Who is in without an account is the asker's to remove from who's in, behind the stack. */}
              {mine && d.creatorId === me.id && positions.length >= 2 ? <LockButton dareId={d.id} count={positions.length} leftOut={holdouts} variant="tertiary" /> : null}
              {/* The nudge (3.42, amended 2026-09-27; restored in Round B): the only way someone in reaches the people asked who are not in, with the relay for anyone no device reaches. */}
              {mine ? <Nudge dareId={d.id} names={waitingNames} url={`${appUrl}/m/${d.id}`} relay={relayWords} /> : null}
            </>
          ) : null}

          {state === "locked" ? (
            <>
              {claim ?? sourceCard}
              {/* Where everyone landed (3.38, Voting): the picture, for someone in it through the stage and for anyone else in the group as the line, ruler or rows. No sentence names the state (3.23), and no list repeats each person's number: the picture is where they landed. */}
              {mine ? (
                stage
              ) : (
                <section className="flex flex-col gap-3" data-everyone-landed="">
                  <SectionLabel>Where everyone landed</SectionLabel>
                  {pickAnswers ? (
                    <PickOneRows answers={pickAnswers} pickers={pickers} shares={pickShares} outcome={null} />
                  ) : numberUnit ? (
                    rulerData ? <Ruler ruler={rulerData} size="screen" surface="var(--ground)" /> : null
                  ) : (
                    <CallLine pins={pins} state="in" size="screen" surface="var(--ground)" ends={teams} />
                  )}
                </section>
              )}
              {sparkline}
              {mine ? whosIn : null}
              {/* Once locked, the same nudge reaches whoever in the quorum has not called it (restored in Round B). */}
              {mine ? <Nudge dareId={d.id} names={waitingNames} url={`${appUrl}/m/${d.id}`} relay={relayWords} /> : null}
            </>
          ) : null}


          {state !== "draft" ? details : null}
          {openPhotos}

          {/* The tiebreaker's ruling, word for word (3.38); a final score's ending is the one caption line under the outcome (3.35), never a card. */}
          {d.rulingText && d.resolvedBy !== "feed" && (state === "resolved" || state === "voided") ? (
            <section className="flex flex-col gap-2 rounded-card border border-line bg-surface px-4 py-[14px]" data-ruling={d.resolvedBy ?? ""}>
              <h2 className="text-body-strong text-ink">Settled by the tiebreaker everyone agreed to</h2>
              <p className="text-body-sm text-ink-2">{d.rulingText}</p>
              <p className="text-caption text-ink-3">On the permanent record, word for word.</p>
            </section>
          ) : null}


          {state === "draft" ? stage : null}
          {callSheet}
          {headsUp}
          {/* A market in voting goes stale on screen: a light poll of Postgres, never the indexer, while it is locked and this screen is visible. */}
          {state === "locked" ? <VotePoll dareId={d.id} pulse={pulseOf({ votes, statements, resolvedAt: d.resolvedAt, aiProposedAt: d.aiProposedAt, evidence: media.evidence.map((e) => e.id), feedOutcomeAt: d.feedOutcomeAt })} /> : null}
        </div>
      </Screen>
      </PhotoAdding>
    </div>
  );
}
