import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { asc, and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { SignInButton } from "@/components/auth/sign-in-button";
import { Avatar } from "@/components/ledger/avatar";
import { Chip } from "@/components/ledger/chip";
import { MarkStamp } from "@/components/ledger/mark-stamp";
import {
  LiveDot,
  StateMark,
  type MarketMark,
} from "@/components/ledger/state-mark";
import { InkPicker } from "@/components/markets/ink-picker";
import { INKS, inkOf, inkVars } from "@/lib/ui/ink";
import type { CSSProperties } from "react";
import { Screen, SectionLabel, TopBar } from "@/components/ledger/screen";
import { When } from "@/components/ledger/when";
import { CallLine } from "@/components/markets/call-line";
import { CallSheet, type Word } from "@/components/markets/call-sheet";
import { Leaderboard, Transfers } from "@/components/markets/leaderboard";
import { InvitePreview } from "@/components/markets/invite-preview";
import { RoomCode } from "@/components/markets/room-code";
import { AfterVote } from "@/components/notify/after-vote";
import {
  arbitrationOpen,
  expireMarket,
  proposeForArgument,
} from "@/lib/ledger/settle";
import { Nudge } from "@/components/notify/nudge";
import { relayText } from "@/lib/notify/messages";
import {
  type Signing,
  type StakeUnit,
} from "@/components/markets/market-actions";
import {
  MarketStage,
  type StagePicture,
} from "@/components/markets/market-stage";
import { SettledSheet } from "@/components/markets/settled-sheet";
import { SetupSheet } from "@/components/markets/setup-sheet";
import { Sparkline } from "@/components/markets/sparkline";
import {
  buckets,
  groupsNumberBps,
  percentOf,
  showsMarker,
  sparkEligible,
  weightCaption,
} from "@/lib/ledger/weight";
import { currentUser } from "@/lib/auth/session";
import { contracts } from "@/lib/chain/contracts";
import { daresDomain, Stalemate } from "@/lib/chain/typed-data";
import { denominationById } from "@/lib/ledger/denominations";
import { isMember } from "@/lib/ledger/groups";
import { dareOnchainId } from "@/lib/ledger/ids";
import { numbersVisible } from "@/lib/ledger/market-view";
import {
  createTypedData,
  marketById,
  positionsOf,
  reconcileFromIndexer,
  stateOf,
  tally,
  VOID_OUTCOME,
  votesOf,
} from "@/lib/ledger/markets";
import { marketShare } from "@/lib/ledger/share";
import {
  closesLabel,
  dayLabel,
  firstName,
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

const word = (o: bigint | null): Word | null =>
  o === null ? null : o === VOID_OUTCOME ? "void" : o === 1n ? "yes" : "no";
const SAID: Record<Word, string> = {
  yes: "yes",
  no: "no",
  void: "nobody can tell",
};

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
  if (!me) {
    // A pasted link gets its card from this page, so it answers instead of redirecting, and says only the question.
    const share = await marketShare(id);
    return (
      <Screen>
        <TopBar title="dareful" />
        <div className="flex flex-col gap-6 py-10">
          <h1 className="text-serif-l text-ink">
            {share.question ?? "Nothing to see here yet."}
          </h1>
          <p className="text-body text-ink-2">
            {share.question
              ? "Sign in to put your number on it."
              : "If a friend sent you this, sign in and it will be there."}
          </p>
          <SignInButton label="Sign in" />
        </div>
      </Screen>
    );
  }

  let d = await marketById(id);
  if (!d) notFound();
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
        <TopBar back title="dareful" />
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
              mark: d.markKind === "emoji" ? d.markValue : null,
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
                  : "If nobody can agree how it came out, the app hears both sides and calls it. Being in means you’re fine with that.",
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
  const [positions, votes, statements, seats] = await Promise.all([
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
  ]);
  const ids = Array.from(
    new Set([
      d.creatorId,
      ...positions.map((p) => p.userId as string),
      ...votes.map((v) => v.userId),
      ...statements.map((s) => s.userId),
    ]),
  );
  const users = await db
    .select({ id: schema.users.id, displayName: schema.users.displayName })
    .from(schema.users)
    .where(inArray(schema.users.id, ids));
  const person = new Map(users.map((u) => [u.id, u]));
  const nameOf = (uid: string) =>
    uid === me.id ? "You" : (person.get(uid)?.displayName ?? "Someone");
  const first = (uid: string) =>
    uid === me.id
      ? "You"
      : firstName(person.get(uid)?.displayName ?? "Someone");

  const mine = positions.find((p) => p.userId === me.id) ?? null;
  const show = numbersVisible(d, mine !== null);
  const others = positions.filter((p) => p.userId !== me.id);
  const pins = positions.map((p) => ({
    id: p.userId as string,
    name: person.get(p.userId as string)?.displayName ?? "Someone",
    percent: Number(p.value) / 100,
  }));

  const { chainId, dares } = contracts();
  const signing: Signing = {
    domain: daresDomain(chainId, dares.address),
    dareOnchainId: dareOnchainId(d.id),
    stalemate: d.stalemate === "void" ? Stalemate.Void : Stalemate.Arbitrate,
    ledgerWallet: me.ledgerWallet,
    governanceWallet: me.governanceWallet,
  };
  if (state === "draft") {
    const c = createTypedData(d).message;
    signing.create = {
      groupId: c.groupId,
      kind: c.kind,
      pace: c.pace,
      termsHash: c.termsHash,
      denomId: c.denomId,
      range: "0",
      options: 0,
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
  // The picture of where everyone landed, for someone who is in. Weights when numbers may be seen (an open
  // question once you have picked, or any question once locked); otherwise who is in and nothing about where.
  const entries = positions.map((p) => ({
    id: p.userId as string,
    stake: p.stake,
    valueBps: p.value,
  }));
  const number = groupsNumberBps(entries);
  const picture: StagePicture | null = !mine
    ? null
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
      : {
          kind: "blind",
          inCount: positions.length,
          ofCount: Math.max(seats.length, positions.length),
        };
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
                  person.get(firstIn.userId as string)?.displayName ?? "They",
                ),
                side:
                  firstIn.value >= 5000n ? ("yes" as const) : ("no" as const),
              }
            : null,
        }
      : null;
  // One chalk control per screen: getting people in, until everyone is, and then the asker's lock.
  const everyoneIn = positions.length >= seats.length && positions.length > 1;
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
              percent: Number(mine.value) / 100,
              stake: mine.stake.toString(),
              stakeWords: stakeWords(mine.stake),
            }
          : null
      }
      picture={picture}
      mark={d.markKind === "emoji" ? d.markValue : null}
      argument={argument}
      lockedLine={lockedLine}
      changeUntil={until}
      share={
        state === "open"
          ? {
              url: `${appUrl}/m/${d.id}`,
              text: `${d.title} Put your number on it:`,
              joinLine: `Anyone with the link can get in ${until}.`,
            }
          : null
      }
      lock={
        state === "open" && d.creatorId === me.id
          ? { count: positions.length, everyoneIn }
          : null
      }
    />
  );
  const more = (
    <SetupSheet>
      <p className="text-body-sm text-ink-2">
        {d.revealMode === "blind"
          ? "Nobody sees where anyone landed until it’s locked."
          : "Once you’ve picked, you can see where the stake sits."}{" "}
        What’s riding on it is in{" "}
        {denomination.monetary ? "dollars" : unit.plural}, the same for
        everyone, so it can be weighed.
      </p>
      {show && number !== null && showsMarker(entries) ? (
        <p className="text-body-sm text-ink-2">
          The group’s number, exactly: {(Number(number) / 100).toFixed(1)}%.
        </p>
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
        {d.resolvesBy ? (
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
      <dt className="text-label text-ink-3">Stakes</dt>
      <dd className="text-body text-ink">
        {denomination.monetary
          ? "Dollars"
          : unit.plural.charAt(0).toUpperCase() + unit.plural.slice(1)}
        , the same for everyone
      </dd>
      <dt className="text-label text-ink-3">If it’s unclear</dt>
      <dd className="text-body text-ink">
        {d.stalemate === "void"
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
      : positions.map((p) => p.userId as string),
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
  const bandClock =
    state === "open" && d.resolvesBy
      ? `Closes ${closesLabel(d.resolvesBy, now, clock.zone)}`
      : state === "locked" && d.resolvesBy && votes.length === 0
        ? `Resolving ${closesLabel(d.resolvesBy, now, clock.zone)}`
        : state === "locked" && d.resolvesBy
          ? `Voting ends ${closesLabel(d.resolvesBy, now, clock.zone)}`
          : null;
  const bandLive =
    d.resolvesBy !== null &&
    ((state === "open" && !mine) || (state === "locked" && myVote === null));
  const band = (
    <section className="-mx-2 flex flex-col gap-3 rounded-card bg-field p-4 pb-[18px]">
      <div className="flex items-center justify-between gap-3">
        {d.markKind === "emoji" && d.markValue ? (
          <MarkStamp kind="emoji" value={d.markValue} size={44} onGround />
        ) : (
          <span />
        )}
        <span className="flex items-center gap-2 text-label text-ink-2">
          {bandLive ? <LiveDot /> : null}
          <StateMark
            state={bandState}
            hue={bandState === "in" ? hueFor(me.id) : undefined}
            ink={INKS[ink].ink}
          />
          {bandClock ? <span>{bandClock}</span> : null}
        </span>
      </div>
      <h1 className="text-serif-l text-ink">{d.title}</h1>
      <p className="flex items-center gap-2 text-caption text-ink-2">
        <Avatar
          name={person.get(d.creatorId)?.displayName ?? "?"}
          hue={hueFor(d.creatorId)}
          size={22}
        />
        <span>
          {first(d.creatorId)} asked{group?.name ? ` ${group.name}` : ""}
        </span>
      </p>
    </section>
  );
  // The claim card while voting (3.25): who first said how it came out, and what they said happened.
  const claimant = state === "locked" ? (orderedVotes[0] ?? null) : null;
  const claimWord = claimant ? word(claimant.outcome) : null;
  const claimSaid = claimant
    ? (statements.find((s) => s.userId === claimant.userId)?.statement ?? null)
    : null;
  const claim =
    claimant && claimWord ? (
      <section className="flex items-start gap-3 rounded-card border border-line bg-surface px-4 py-3">
        <Avatar
          name={person.get(claimant.userId)?.displayName ?? "?"}
          hue={hueFor(claimant.userId)}
          size={28}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-body-strong text-ink">
            {first(claimant.userId)}{" "}
            {claimant.userId === me.id ? "say" : "says"} {SAID[claimWord]}
          </p>
          {claimSaid ? (
            <p className="text-body-sm text-ink-2">{claimSaid}</p>
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
        proposal={
          d.aiRationale
            ? {
                outcome: word(d.aiOutcome),
                line:
                  d.aiOutcome === null
                    ? "The app can’t tell yet."
                    : word(d.aiOutcome) === "void"
                      ? "The app thinks the terms don’t settle it."
                      : soft
                        ? `The app leans ${word(d.aiOutcome)}, ${Math.round((d.aiConfidenceBps ?? 0) / 100)} to ${100 - Math.round((d.aiConfidenceBps ?? 0) / 100)}.`
                        : `The app thinks: ${word(d.aiOutcome)}.`,
                rationale: d.aiRationale,
              }
            : null
        }
        awaitingProposal={d.pace === "argument" && !d.aiProposedAt}
        split={
          d.stalemate === "arbitrate" && mine && counted.length > 1
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
  const settledSheet =
    state === "resolved" && outcome && outcome !== "void" ? (
      <SettledSheet
        dareId={d.id}
        tileUrl={`/m/${d.id}/opengraph-image`}
        caption={`${outcome === "yes" ? "Yes." : "No."}${closest ? ` ${first(closest.userId as string)} ${closest.userId === me.id ? "were" : "was"} closest, at ${Number(closest.value) / 100}%.` : ""}`}
        url={`${appUrl}/m/${d.id}`}
        text={`How it ended: ${d.title}`}
      />
    ) : null;

  return (
    <div
      className="grain flex flex-1 flex-col"
      style={inkVars(ink) as CSSProperties}
    >
      <Screen>
        <TopBar back right={group?.name ? <Chip>{group.name}</Chip> : null} />
        <div className="flex flex-col gap-7 py-2">
          {band}

          {state === "resolved" && outcome && outcome !== "void" ? (
            <>
              <section className="flex flex-col gap-4">
                <p className="text-serif-l text-ink">
                  {outcome === "yes" ? "Yes." : "No."}
                </p>
                <CallLine
                  pins={pins}
                  state="resolved"
                  outcome={outcome === "yes" ? 1 : 0}
                  size="screen"
                  surface="var(--ground)"
                />
              </section>
              <section className="flex flex-col gap-3">
                <SectionLabel>Who was closest</SectionLabel>
                <Leaderboard
                  viewerId={me.id}
                  outcome={outcome === "yes" ? 1 : 0}
                  standings={positions.map((p) => ({
                    userId: p.userId as string,
                    name:
                      person.get(p.userId as string)?.displayName ?? "Someone",
                    percent: Number(p.value) / 100,
                    score: p.score ?? 0,
                  }))}
                />
              </section>
              <section className="flex flex-col gap-2">
                <SectionLabel>What changes hands</SectionLabel>
                <Transfers
                  viewerId={me.id}
                  denomination={denomination}
                  people={new Map(users.map((u) => [u.id, u]))}
                  transfers={edges.map((e) => ({
                    fromId: e.fromUser,
                    toId: e.toUser,
                    quantity: e.quantity ?? 1n,
                  }))}
                />
              </section>
            </>
          ) : null}

          {state === "voided" ? (
            <section className="flex flex-col gap-3">
              <p className="text-serif-l text-ink">No answer.</p>
              <p className="text-body text-ink-2">
                Nobody could tell, so it’s void. Nothing changes hands.
              </p>
              <CallLine
                pins={pins}
                state="in"
                size="screen"
                surface="var(--ground)"
              />
            </section>
          ) : null}

          {state === "draft" ? (
            <section className="flex flex-col gap-4">
              <p className="text-body text-ink-2">
                Only you can see this so far. Put your own number on it and it
                goes live{group?.name ? ` for ${group.name}` : ""}. Then you
                send it to whoever should be in.
              </p>
              {details}
            </section>
          ) : null}

          {state === "open" ? (
            <>
              {stage}
              {sparkline}
              <section className="flex flex-col gap-3">
                <ul
                  className="flex flex-wrap items-center gap-1.5"
                  aria-label="Who's in"
                >
                  {positions.map((p) => (
                    <li key={p.userId}>
                      <Avatar
                        name={
                          person.get(p.userId as string)?.displayName ?? "?"
                        }
                        hue={hueFor(p.userId as string)}
                        size={28}
                      />
                    </li>
                  ))}
                </ul>
                <p className="text-body-sm text-ink-2">
                  {positions.length} of{" "}
                  {Math.max(seats.length, positions.length)} in
                </p>
              </section>
              {mine ? (
                <section className="flex flex-col gap-3">
                  <RoomCode dareId={d.id} url={`${appUrl}/m/${d.id}`} />
                  <Nudge
                    dareId={d.id}
                    names={waitingNames}
                    url={`${appUrl}/m/${d.id}`}
                    relay={`We’re waiting on you: ${d.title}`}
                  />
                  <AfterVote relay={null} url={`${appUrl}/m/${d.id}`} />
                </section>
              ) : null}
            </>
          ) : null}

          {state === "locked" ? (
            <>
              {claim}
              {mine ? stage : null}
              {sparkline}
              <section className="flex flex-col gap-3">
                <SectionLabel>
                  {d.pace === "argument"
                    ? "Where each of you stands"
                    : "Everyone’s in, and numbers are locked"}
                </SectionLabel>
                {mine ? null : (
                  <CallLine
                    pins={pins}
                    state="in"
                    size="screen"
                    surface="var(--ground)"
                  />
                )}
                <ul className="flex flex-col">
                  {positions.map((p) => (
                    <li
                      key={p.userId}
                      className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0"
                    >
                      <span className="flex items-center gap-2 text-body-sm text-ink">
                        <Avatar
                          name={
                            person.get(p.userId as string)?.displayName ?? "?"
                          }
                          hue={hueFor(p.userId as string)}
                          size={24}
                        />
                        {nameOf(p.userId as string)}
                      </span>
                      <span className="text-body-sm text-ink-2">
                        {Number(p.value) / 100}% · {stakeWords(p.stake)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          ) : null}

          {state === "expired" ? (
            <section className="flex flex-col gap-3">
              <p className="text-serif-l text-ink">Never settled.</p>
              <p className="text-body text-ink-2">
                Nobody called it in time, and it was set up to go unsettled if
                that happened. Nothing changes hands, and it counts against
                nobody.
              </p>
              <CallLine
                pins={pins}
                state="in"
                size="screen"
                surface="var(--ground)"
              />
            </section>
          ) : null}

          {state !== "draft" ? details : null}
          {mine || state !== "open" ? more : null}

          {d.rulingText && (state === "resolved" || state === "voided") ? (
            <section className="flex flex-col gap-2 rounded-card border border-line bg-surface px-4 py-[14px]">
              <h2 className="text-body-strong text-ink">
                Settled by the tiebreaker everyone agreed to
              </h2>
              <p className="text-body-sm text-ink-2">{d.rulingText}</p>
              <p className="text-caption text-ink-3">
                On the permanent record, word for word.
              </p>
            </section>
          ) : null}

          {state === "locked" && mine ? (
            <Nudge
              dareId={d.id}
              names={waitingNames}
              url={`${appUrl}/m/${d.id}`}
              relay={`We’re waiting on your call: ${d.title}`}
            />
          ) : null}
          {state === "locked" && myVote !== null ? (
            <AfterVote
              relay={relayText({
                title: d.title,
                cast: votes.length,
                quorum: seats.length,
              })}
              url={`${appUrl}/m/${d.id}`}
            />
          ) : null}

          {state === "draft" ? stage : null}
          {callSheet}
          {settledSheet}
        </div>
      </Screen>
    </div>
  );
}
