import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { asc, and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { SignInButton } from "@/components/auth/sign-in-button";
import { Avatar } from "@/components/ledger/avatar";
import { Chip } from "@/components/ledger/chip";
import { InviteShare } from "@/components/ledger/invite-share";
import { MarkStamp } from "@/components/ledger/mark-stamp";
import { Screen, SectionLabel, TopBar } from "@/components/ledger/screen";
import { When } from "@/components/ledger/when";
import { CallLine } from "@/components/markets/call-line";
import { Leaderboard, Transfers } from "@/components/markets/leaderboard";
import { InvitePreview } from "@/components/markets/invite-preview";
import { RoomCode } from "@/components/markets/room-code";
import { Arbitration } from "@/components/markets/arbitration";
import { RefreshWhile } from "@/components/ui/refresh-while";
import { AfterVote } from "@/components/notify/after-vote";
import { arbitrationOpen, expireMarket, proposeForArgument } from "@/lib/ledger/settle";
import { Nudge } from "@/components/notify/nudge";
import { relayText } from "@/lib/notify/messages";
import { Ballot, LockButton, WhatHappened, type Signing, type StakeUnit } from "@/components/markets/market-actions";
import { NumberStage, type StagePicture } from "@/components/markets/number-stage";
import { SetupSheet } from "@/components/markets/setup-sheet";
import { Sparkline } from "@/components/markets/sparkline";
import { buckets, countWord, groupsNumberBps, showsMarker, sparkEligible, tenthOf, weightCaption } from "@/lib/ledger/weight";
import { currentUser } from "@/lib/auth/session";
import { contracts } from "@/lib/chain/contracts";
import { daresDomain, Stalemate } from "@/lib/chain/typed-data";
import { denominationById } from "@/lib/ledger/denominations";
import { isMember } from "@/lib/ledger/groups";
import { dareOnchainId } from "@/lib/ledger/ids";
import { numbersVisible } from "@/lib/ledger/market-view";
import { createTypedData, marketById, positionsOf, reconcileFromIndexer, stateOf, tally, VOID_OUTCOME, votesOf } from "@/lib/ledger/markets";
import { marketShare } from "@/lib/ledger/share";
import { closesLabel, dayLabel, firstName, lockedLabel } from "@/lib/ui/copy";
import { hueFor } from "@/lib/ui/hue";
import { formatMoney, unitWords } from "@/lib/ui/units";
import { viewerClock } from "@/lib/ui/zone";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const share = await marketShare(id);
  return { title: share.title, description: share.description, robots: { index: false, follow: false }, openGraph: { title: share.title, description: share.description } };
}

const word = (o: bigint | null) => (o === null ? null : o === VOID_OUTCOME ? ("void" as const) : o === 1n ? ("yes" as const) : ("no" as const));

export default async function MarketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ side?: string }> }) {
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
          <h1 className="text-question text-ink">{share.question ?? "Nothing to see here yet."}</h1>
          <p className="text-body text-ink-2">{share.question ? "Sign in to put your number on it." : "If a friend sent you this, sign in and it will be there."}</p>
          <SignInButton label="Sign in" />
        </div>
      </Screen>
    );
  }

  let d = await marketById(id);
  if (!d) notFound();
  const member = await isMember(d.groupId, me.id);
  // A locked market the chain has already decided, whose result never got written here: take the chain's word.
  if (d.lockedAt && !d.resolvedAt && member && (await reconcileFromIndexer(d.id))) d = (await marketById(id)) ?? d;
  // The scheduler's jobs are all reachable without it: opening a question that was set to go unsettled, after
  // its time, settles that here and now.
  if (d.lockedAt && !d.resolvedAt && d.stalemate === "void" && d.resolvesBy && d.resolvesBy.getTime() < clock.now && member) {
    if (await expireMarket(d.id).catch(() => false)) d = (await marketById(id)) ?? d;
  }
  // An argument whose proposal never arrived (the model was down when it locked) asks again, off the critical path.
  if (d.pace === "argument" && d.lockedAt && !d.resolvedAt && !d.aiProposedAt && clock.now - d.lockedAt.getTime() > 20_000) after(() => proposeForArgument(id).catch(() => undefined));
  const state = stateOf(d);
  if (state === "draft" && d.creatorId !== me.id) notFound();

  const [group] = await db.select().from(schema.groups).where(eq(schema.groups.id, d.groupId)).limit(1);
  if (!member) {
    // Someone signed in, holding the link, and not in yet: the invitation, and nothing it could cost (3.17).
    const [creator] = await db.select({ id: schema.users.id, displayName: schema.users.displayName }).from(schema.users).where(eq(schema.users.id, d.creatorId)).limit(1);
    const inCount = (await positionsOf(d.id)).length;
    const COUNT = ["", "One friend is in", "Two friends are in", "Three friends are in", "Four friends are in", "Five friends are in", "Six friends are in"];
    return (
      <Screen>
        <TopBar back title="dareful" />
        <div className="py-2">
          <InvitePreview
            viewerName={firstName(me.displayName)}
            data={{
              dareId: d.id,
              inviter: { name: firstName(creator?.displayName ?? "A friend"), hue: hueFor(d.creatorId) },
              groupLabel: group?.name ?? null,
              question: d.title,
              mark: d.markKind === "emoji" ? d.markValue : null,
              countLine: inCount === 0 ? null : (COUNT[inCount] ?? "A lot of friends are in"),
              decidesLine: d.resolvesBy ? `Decided ${closesLabel(d.resolvesBy, new Date(clock.now), clock.zone)}, by the people in it.` : null,
              criterionLine: d.criterion ? `Decided ${d.criterion}, and by nothing else.` : null,
              stalemateLine: d.stalemate === "void" ? "If nobody can agree how it came out, it goes unsettled." : "If nobody can agree how it came out, the app hears both sides and calls it. Being in means you’re fine with that.",
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
    db.select({ userId: schema.dareStatements.userId, statement: schema.dareStatements.statement, statedAt: schema.dareStatements.statedAt }).from(schema.dareStatements).where(and(eq(schema.dareStatements.dareId, d.id), eq(schema.dareStatements.kind, "update"))).orderBy(asc(schema.dareStatements.statedAt)),
    db.select({ userId: schema.groupMembers.userId }).from(schema.groupMembers).where(and(eq(schema.groupMembers.groupId, d.groupId), isNotNull(schema.groupMembers.userId), isNull(schema.groupMembers.leftAt))),
  ]);
  const ids = Array.from(new Set([d.creatorId, ...positions.map((p) => p.userId as string), ...votes.map((v) => v.userId), ...statements.map((s) => s.userId)]));
  const users = await db.select({ id: schema.users.id, displayName: schema.users.displayName }).from(schema.users).where(inArray(schema.users.id, ids));
  const person = new Map(users.map((u) => [u.id, u]));
  const nameOf = (uid: string) => (uid === me.id ? "You" : (person.get(uid)?.displayName ?? "Someone"));

  const mine = positions.find((p) => p.userId === me.id) ?? null;
  const show = numbersVisible(d, mine !== null);
  const others = positions.filter((p) => p.userId !== me.id);
  const pins = positions.map((p) => ({ id: p.userId as string, name: person.get(p.userId as string)?.displayName ?? "Someone", percent: Number(p.value) / 100 }));

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
    signing.create = { groupId: c.groupId, kind: c.kind, pace: c.pace, termsHash: c.termsHash, denomId: c.denomId, range: "0", options: 0, resolvesBy: c.resolvesBy.toString() };
  }
  const unit: StakeUnit = { monetary: denomination.monetary, quantifiable: denomination.quantifiable, singular: denomination.template === "next_time" ? "next time" : denomination.label, plural: denomination.pluralLabel };
  const stakeWords = (s: bigint) => (denomination.monetary ? formatMoney(s) : unitWords(denomination, s));
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://dareful.app";
  // The picture of where everyone landed, for someone who is in. Weights when numbers may be seen (an open
  // question once you have picked, or any question once locked); otherwise who is in and nothing about where.
  const entries = positions.map((p) => ({ id: p.userId as string, stake: p.stake, valueBps: p.value }));
  const number = groupsNumberBps(entries);
  const tallest = buckets(entries).reduce((m, b) => (b.stake > m ? b.stake : m), 0n);
  const total = entries.reduce((a, e) => a + e.stake, 0n);
  const picture: StagePicture | null = !mine
    ? null
    : show
      ? {
          kind: "weights",
          buckets: buckets(entries).map((b) => ({ n: b.n, heightPermille: b.heightPermille, noStake: b.noStake })),
          mySharePermille: tallest === 0n ? 0 : Number((mine.stake * 1000n) / tallest),
          groupTenth: showsMarker(entries) && number !== null ? tenthOf(number) : null,
          groupPercent: showsMarker(entries) && number !== null ? Number(number) / 100 : null,
          riding: `${stakeWords(total)} riding, ${entries.length === 1 ? "just you so far" : `${countWord(entries.length)} of you`}`,
          caption: weightCaption({ entries, viewerId: me.id, nameOf: (id) => firstName(person.get(id)?.displayName ?? "Someone"), stakeWords }),
        }
      : { kind: "blind", inCount: positions.length, ofCount: Math.max(seats.length, positions.length) };
  const series = state === "open" || state === "locked" ? await db.select({ at: schema.dareNumberSeries.at, valueBps: schema.dareNumberSeries.valueBps }).from(schema.dareNumberSeries).where(eq(schema.dareNumberSeries.dareId, d.id)).orderBy(asc(schema.dareNumberSeries.at)) : [];
  // Both conditions, checked here and now: a slow question with three in and a fast one with six both exist.
  const spark = show && mine && number !== null && sparkEligible({ openedAt: d.createdAt, now: new Date(clock.now), entries: positions.length, points: series.length });
  const lockedLine = d.lockedAt ? lockedLabel(d.lockedAt, new Date(clock.now), clock.zone) : null;
  // An argument's two numbers default to all the way on opposite sides, so whoever is wrong is out the whole
  // thing; either of them can soften theirs before they're in. The other side is not a secret in an argument:
  // taking the opposite one is the whole act, so the opponent is told which side is taken, never the number.
  const firstIn = d.pace === "argument" ? (others[0] ?? null) : null;
  const argument = d.pace === "argument" ? { defaultPercent: firstIn ? (firstIn.value >= 5000n ? 0 : 100) : (await searchParams).side === "no" ? 0 : 100, otherSays: firstIn ? { name: firstName(person.get(firstIn.userId as string)?.displayName ?? "They"), side: firstIn.value >= 5000n ? ("yes" as const) : ("no" as const) } : null } : null;
  const stage = (
    <NumberStage
      dareId={d.id}
      signing={signing}
      unit={unit}
      state={state === "draft" ? "draft" : state === "locked" ? "locked" : "open"}
      me={{ name: me.displayName, hue: hueFor(me.id) }}
      mine={mine ? { percent: Number(mine.value) / 100, stake: mine.stake.toString(), stakeWords: stakeWords(mine.stake) } : null}
      picture={picture}
      mark={d.markKind === "emoji" ? d.markValue : null}
      suggestion={d.anchorValue !== null ? { percent: Math.round(Number(d.anchorValue) / 100), rationale: d.anchorRationale } : null}
      othersIn={others.map((p) => nameOf(p.userId as string))}
      argument={argument}
      lockedLine={lockedLine}
    />
  );
  const setup = (
    <SetupSheet>
      <p className="text-body-sm-prose text-ink-2">{d.termsText}</p>
      {d.resolvesBy ? (
        <p className="text-body-sm text-ink-2">
          The group calls it together, by <When iso={d.resolvesBy.toISOString()} zone={clock.zone} serverNow={clock.now} style="day" />. {d.stalemate === "void" ? "If you can’t agree by then, it’s called off and nothing changes hands." : "If you can’t agree by then, everyone says their piece and the app calls it. Being in means you’re fine with that."}
        </p>
      ) : null}
      <p className="text-body-sm text-ink-2">{d.revealMode === "blind" ? "Nobody sees where anyone landed until it’s locked." : "Once you’ve picked, you can see where the stake sits."} What’s riding on it is in {denomination.monetary ? "dollars" : unit.plural}, the same for everyone, so it can be weighed.</p>
      {d.anchorValue !== null ? (
        <p className="text-body-sm text-ink-2">
          The app’s starting number was {Math.round(Number(d.anchorValue) / 100)}. {d.anchorRationale ?? ""} It was only ever something to argue with.
        </p>
      ) : null}
      {show && number !== null && showsMarker(entries) ? <p className="text-body-sm text-ink-2">The group’s number, exactly: {(Number(number) / 100).toFixed(1)}%.</p> : null}
    </SetupSheet>
  );
  // One marigold control per screen: getting people in, until everyone is, and then the asker's lock.
  const everyoneIn = positions.length >= seats.length && positions.length > 1;
  const outcome = word(d.resolvedOutcome);
  const leading = tally(votes)[0];
  // Who a nudge would go to, by first name: while open, group members with no number in; once locked, members
  // who have not called it. The server works out the real recipients again; this is only the sentence.
  const doneIds = new Set(state === "locked" ? votes.map((v) => v.userId) : positions.map((p) => p.userId as string));
  const waitingIds = seats.map((x) => x.userId).filter((x): x is string => x !== null && x !== me.id && !doneIds.has(x));
  const waitingUsers = waitingIds.length ? await db.select({ id: schema.users.id, displayName: schema.users.displayName }).from(schema.users).where(inArray(schema.users.id, waitingIds)) : [];
  const waitingNames = waitingUsers.map((u) => firstName(u.displayName));
  const edges = state === "resolved" ? await db.select().from(schema.obligations).where(and(eq(schema.obligations.origin, "dare"), eq(schema.obligations.originId, d.id))) : [];

  const now = new Date(clock.now);
  const canArbitrate = arbitrationOpen(d, now);
  const cases = state === "locked" && d.stalemate === "arbitrate" ? await db.select({ userId: schema.dareStatements.userId, statement: schema.dareStatements.statement }).from(schema.dareStatements).where(and(eq(schema.dareStatements.dareId, d.id), eq(schema.dareStatements.kind, "statement"))).orderBy(asc(schema.dareStatements.statedAt)) : [];
  const myVote = word(votes.find((v) => v.userId === me.id)?.outcome ?? null);
  const soft = d.aiConfidenceBps !== null && d.aiConfidenceBps < 9000 && d.aiOutcome !== null && d.aiOutcome !== VOID_OUTCOME;
  const ballot = (
    <section id="ballot" className="flex scroll-mt-4 flex-col gap-4">
      <h2 className={myVote === null ? "text-question text-ink" : "text-label text-ink-3"}>How did it come out?</h2>
      {d.pace === "dare" ? (
        <div className="flex flex-col gap-3">
          {statements.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {statements.map((s) => (
                <li key={s.userId} className="rounded-card border border-line bg-surface px-4 py-3 text-body-sm text-ink-2">
                  <span className="text-body-strong text-ink">{nameOf(s.userId)}:</span> {s.statement}
                </li>
              ))}
            </ul>
          ) : null}
          <WhatHappened dareId={d.id} mine={statements.find((s) => s.userId === me.id)?.statement ?? null} />
        </div>
      ) : null}
      {d.aiRationale ? (
        <div className="rounded-card border border-dashed border-line-strong px-4 py-3">
          <p className="text-body-strong text-ink">
            {d.aiOutcome === null ? "The app can’t tell yet." : word(d.aiOutcome) === "void" ? "The app thinks the terms don’t settle it." : soft ? `The app leans ${word(d.aiOutcome)}, ${Math.round((d.aiConfidenceBps ?? 0) / 100)} to ${100 - Math.round((d.aiConfidenceBps ?? 0) / 100)}.` : `The app thinks: ${word(d.aiOutcome)}.`}
          </p>
          <p className="pt-1 text-body-sm-prose text-ink-2">{d.aiRationale}</p>
          {d.criterion ? <p className="pt-2 text-caption text-ink-3">Decided {d.criterion}, as the terms say, and by nothing else.</p> : null}
          <p className="pt-2 text-caption text-ink-3">It’s a suggestion. The group decides, and can say otherwise.</p>
        </div>
      ) : d.pace === "argument" ? (
        <p className="text-body-sm text-ink-2">
          The app is weighing it up. It’ll say what it thinks in a moment; you don’t have to wait for it.
          <RefreshWhile />
        </p>
      ) : null}
      <Ballot
        dareId={d.id}
        signing={signing}
        suggested={word(d.aiOutcome)}
        myVote={myVote}
        threshold={d.threshold}
        tallyLine={votes.length === 0 ? `It takes ${d.threshold} of you agreeing to decide it.` : `${votes.length} ${votes.length === 1 ? "has" : "have"} said so far${leading ? `, ${leading.votes} for ${word(leading.outcome) === "void" ? "nobody can tell" : word(leading.outcome)}` : ""}. It takes ${d.threshold} agreeing.`}
      />
      {mine ? <Nudge dareId={d.id} names={waitingNames} url={`${appUrl}/m/${d.id}#ballot`} relay={`We’re waiting on your call: ${d.title}`} /> : null}
      {myVote !== null ? <AfterVote relay={relayText({ title: d.title, cast: votes.length, quorum: seats.length })} url={`${appUrl}/m/${d.id}#ballot`} /> : null}
    </section>
  );

  return (
    <Screen>
      <TopBar back right={group?.name ? <Chip>{group.name}</Chip> : null} />
      <div className="flex flex-col gap-7 py-2">
        <header className="flex flex-col gap-3">
          <h1 className="flex items-start gap-3 text-question text-ink">
            {d.markKind === "emoji" && d.markValue ? <MarkStamp kind="emoji" value={d.markValue} size={28} /> : null}
            <span>{d.title}</span>
          </h1>
          <p className="text-caption text-ink-3">
            {nameOf(d.creatorId)} asked · <When iso={d.createdAt.toISOString()} zone={clock.zone} serverNow={clock.now} />
          </p>
          {mine && (state === "open" || state === "locked") ? null : (
          <details className="rounded-card border border-line bg-surface px-4 py-3" open={state === "draft" || (state === "open" && !mine)}>
            <summary className="cursor-pointer text-body-strong text-ink">How we’ll know</summary>
            <p className="pt-2 text-body-sm-prose text-ink-2">{d.termsText}</p>
            {d.resolvesBy ? (
              <p className="pt-2 text-body-sm text-ink-2">
                The group calls it together, by <When iso={d.resolvesBy.toISOString()} zone={clock.zone} serverNow={clock.now} style="day" />. {d.stalemate === "void" ? "If you can’t agree by then, it’s called off and nothing changes hands." : "If you can’t agree by then, everyone says their piece and the app calls it. Being in means you’re fine with that."}
              </p>
            ) : null}
          </details>
          )}
        </header>

        {state === "resolved" && outcome && outcome !== "void" ? (
          <>
            <section className="flex flex-col gap-4">
              <p className="text-outcome text-ink">{outcome === "yes" ? "Yes." : "No."}</p>
              <CallLine pins={pins} state="resolved" outcome={outcome === "yes" ? 1 : 0} size="screen" surface="var(--ground)" />
            </section>
            <section className="flex flex-col gap-3">
              <SectionLabel>Who was closest</SectionLabel>
              <Leaderboard viewerId={me.id} outcome={outcome === "yes" ? 1 : 0} standings={positions.map((p) => ({ userId: p.userId as string, name: person.get(p.userId as string)?.displayName ?? "Someone", percent: Number(p.value) / 100, score: p.score ?? 0 }))} />
            </section>
            <section className="flex flex-col gap-2">
              <SectionLabel>What changes hands</SectionLabel>
              <Transfers viewerId={me.id} denomination={denomination} people={new Map(users.map((u) => [u.id, u]))} transfers={edges.map((e) => ({ fromId: e.fromUser, toId: e.toUser, quantity: e.quantity ?? 1n }))} />
              <p className="text-caption text-ink-3">Every pair squares on how much closer one was than the other, never for more than the smaller of what the two put on it.</p>
            </section>
          </>
        ) : null}

        {state === "voided" ? (
          <section className="flex flex-col gap-3">
            <p className="text-outcome text-ink">No answer.</p>
            <p className="text-body text-ink-2">Nobody could tell, so it’s void. Nothing changes hands.</p>
            <CallLine pins={pins} state="in" size="screen" surface="var(--ground)" />
          </section>
        ) : null}

        {state === "draft" ? (
          <section className="flex flex-col gap-4">
            <p className="text-body text-ink-2">Only you can see this so far. Put your own number on it and it goes live{group?.name ? ` for ${group.name}` : ""}. Then you send it to whoever should be in.</p>
            {stage}
          </section>
        ) : null}

        {state === "open" ? (
          <>
            {stage}
            {spark ? <Sparkline points={series.map((x) => ({ at: x.at.getTime(), percent: x.valueBps / 100 }))} openedLabel={dayLabel(d.createdAt, clock.zone)} currentTenth={tenthOf(number ?? 0n)} /> : null}
            <section className="flex flex-col gap-3">
              <ul className="flex flex-wrap items-center gap-1.5" aria-label="Who's in">
                {positions.map((p) => (
                  <li key={p.userId}>
                    <Avatar name={person.get(p.userId as string)?.displayName ?? "?"} hue={hueFor(p.userId as string)} size={28} />
                  </li>
                ))}
              </ul>
              <p className="text-body-sm text-ink-2">
                {positions.length === 0 ? "Nobody’s in yet." : mine && positions.length === 1 ? "" : positions.length >= seats.length && seats.length > 1 ? "Everyone’s in." : `${positions.length} of ${Math.max(seats.length, positions.length)} in.`}
                {d.resolvesBy ? ` Closes ${closesLabel(d.resolvesBy, new Date(clock.now), clock.zone)}.` : ""}
              </p>
              {mine ? setup : null}
            </section>
            {mine ? (
              <section className="flex flex-col gap-3">
                {/* Once you are in, the screen's main act is getting other people in (docs/design.md 3.22). */}
                <InviteShare url={`${appUrl}/m/${d.id}`} text={`${d.title} Put your number on it:`} primary={!everyoneIn} />
                <RoomCode dareId={d.id} url={`${appUrl}/m/${d.id}`} />
                <Nudge dareId={d.id} names={waitingNames} url={`${appUrl}/m/${d.id}`} relay={`We’re waiting on you: ${d.title}`} />
                <AfterVote relay={null} url={`${appUrl}/m/${d.id}`} />
              </section>
            ) : null}
            {d.creatorId === me.id ? (
              <section className="flex flex-col gap-3 border-t border-line pt-6">
                <p className="text-body-sm text-ink-2">When everyone who wants in is in, lock it. After that nobody’s number moves, and everyone sees where everyone landed.</p>
                <LockButton dareId={d.id} count={positions.length} primary={everyoneIn || !mine} />
              </section>
            ) : null}
          </>
        ) : null}

        {state === "locked" ? (
          <>
            {/* When it is yours to call and you have not, that is what this screen is for, so it comes first
                and reads as the one thing to do (docs/decisions.md 2026-09-21). Once you have, the picture leads. */}
            {myVote === null ? ballot : null}
            {mine ? stage : null}
            {spark ? <Sparkline points={series.map((x) => ({ at: x.at.getTime(), percent: x.valueBps / 100 }))} openedLabel={dayLabel(d.createdAt, clock.zone)} currentTenth={tenthOf(number ?? 0n)} /> : null}
            <section className="flex flex-col gap-3">
              <SectionLabel>{d.pace === "argument" ? "Where each of you stands" : "Everyone’s in, and numbers are locked"}</SectionLabel>
              {mine ? null : <CallLine pins={pins} state="in" size="screen" surface="var(--ground)" />}
              <ul className="flex flex-col">
                {positions.map((p) => (
                  <li key={p.userId} className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0">
                    <span className="flex items-center gap-2 text-body-sm text-ink">
                      <Avatar name={person.get(p.userId as string)?.displayName ?? "?"} hue={hueFor(p.userId as string)} size={24} />
                      {nameOf(p.userId as string)}
                    </span>
                    <span className="text-body-sm text-ink-2">
                      {Number(p.value) / 100}% · {stakeWords(p.stake)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            {myVote !== null ? ballot : null}
            {d.stalemate === "arbitrate" && mine && canArbitrate ? <Arbitration dareId={d.id} cases={cases.map((c) => ({ name: nameOf(c.userId), said: c.statement }))} mine={cases.find((c) => c.userId === me.id)?.statement ?? null} mayAsk /> : null}
            {setup}
          </>
        ) : null}

        {state === "expired" ? (
          <section className="flex flex-col gap-3">
            <p className="text-outcome text-ink">Never settled.</p>
            <p className="text-body text-ink-2">Nobody called it in time, and it was set up to go unsettled if that happened. Nothing changes hands, and it counts against nobody.</p>
            <CallLine pins={pins} state="in" size="screen" surface="var(--ground)" />
          </section>
        ) : null}

        {d.rulingText && (state === "resolved" || state === "voided") ? (
          <section className="flex flex-col gap-2 rounded-card border border-line bg-surface px-4 py-[14px]">
            <h2 className="text-body-strong text-ink">The app was asked to call it</h2>
            <p className="text-body-sm-prose text-ink-2">{d.rulingText}</p>
            <p className="text-caption text-ink-3">Everyone in it agreed to this going in, before anyone knew which way it would go. The ruling is on the permanent record, word for word.</p>
          </section>
        ) : null}
      </div>
    </Screen>
  );
}
