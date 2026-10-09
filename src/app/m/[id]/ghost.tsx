import { SignInButton } from "@/components/auth/sign-in-button";
import { GuestLineFor } from "@/components/guest/guest-line";
import { Avatar, AvatarStack } from "@/components/ledger/avatar";
import { MarkRefStamp } from "@/components/ledger/mark-stamp";
import { Screen, TopBar } from "@/components/ledger/screen";
import { LiveDot, StateMark, type MarketMark } from "@/components/ledger/state-mark";
import { When } from "@/components/ledger/when";
import { MarketStage, type StagePicture } from "@/components/markets/market-stage";
import { VotePoll } from "@/components/markets/vote-poll";
import { WhosInRow } from "@/components/markets/whos-in-row";
import { DeadLink } from "@/components/markets/dead-link";
import type { StakeUnit } from "@/components/markets/market-actions";
import type { PickOneAnswer, PickOneBar } from "@/components/markets/pick-one-bars";
import { PinnedSheet } from "@/components/ui/pinned-sheet";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { readClaimTokens } from "@/lib/auth/claim-cookie";
import { denominationById } from "@/lib/ledger/denominations";
import { claimsForBrowserTokens } from "@/lib/ledger/claims";
import { ghostPositionFor } from "@/lib/ledger/ghost-entry";
import { askerLine } from "@/lib/ledger/groups";
import { answersOf, marketById, pastItsClose, positionsOf, stateOf, unitOf, VOID_OUTCOME } from "@/lib/ledger/markets";
import { numbersVisible } from "@/lib/ledger/market-view";
import { numberAxis, serialiseAxis, unitPhrase } from "@/lib/ledger/number-axis";
import { participantsOf, pidOf } from "@/lib/ledger/participants";
import { RulingSheet } from "@/components/markets/ruling-sheet";
import { agreementsOf, disputesOf, rulingStage, STAGE_WORDS } from "@/lib/ledger/rulings";
import { sealedText } from "@/lib/ledger/seal";
import { bufferToHex } from "@/lib/ledger/ids";
import { pickOneCaption } from "@/lib/ledger/pick-one";
import { pulseFor } from "@/lib/ledger/pulse";
import { farOffThreshold } from "@/lib/ledger/scale";
import { buckets, groupsNumberBps, numberCaption, percentOf, showsMarker, weightCaption } from "@/lib/ledger/weight";
import { templateOfMarket } from "@/lib/sports";
import { CONSENT, DRIVE_CONSENT, SLIDER_REACH } from "@/lib/sports/templates";
import type { Sport } from "@/lib/sports/types";
import { clockOf, firstName, friendsIn, lockedLabel, untilLabel } from "@/lib/ui/copy";
import { bandClock as bandClockWords } from "@/lib/ui/band";
import { hueFor } from "@/lib/ui/hue";
import { inkOf, inkRoomStyleText } from "@/lib/ui/ink";
import { CallsAreInSheet, CloseSheet } from "@/components/markets/market-actions";
import { callsAreIn, callsNeeded, votingOpen } from "@/lib/ledger/calls";
import { rollCallWords } from "@/lib/ui/calls-words";
import { InkRoot } from "@/components/ledger/ink-root";
import { markRefOf } from "@/lib/ui/mark";
import type { TeamFace } from "@/lib/ui/team";
import { outcomeLine } from "@/lib/ui/outcome-words";
import { formatMoney, unitWords } from "@/lib/ui/units";
import type { viewerClock } from "@/lib/ui/zone";
import { LinkOpened } from "@/components/ui/usage";

/**
 * Arriving from a link with no account (docs/design.md 3.17; PLANNING.md section 4): the market's own screen in
 * its ink, the wordmark where back would be, the question band, the participant stack with a plain count, two
 * facts, and the sheet at rest with the line untouched. What someone sees before joining is what it is and who
 * asked, never what it could cost: no stakes, no amounts, no leaderboard, no obligations, and no names beyond
 * the asker's and the avatars'. Sliding raises the sheet, which asks who they are, and the entry goes in with no
 * account, no wallet and no signature; the browser keeps a token for it, so the number is theirs to change until
 * lock and binds to whoever signs in here, or with that number. The one line the design gave this sheet, "We
 * text a code", is not said: nothing is sent, and the caption says what is true instead.
 */
export async function GhostMarketPage({ id, clock, embedded = false }: { id: string; clock: Awaited<ReturnType<typeof viewerClock>>; /** The open card on a game page (section 4; 3.33): the page has the chrome and the band. */ embedded?: boolean }) {
  const d = /^[0-9a-f-]{36}$/i.test(id) ? await marketById(id) : null;
  // A revoked or malformed link (3.17): the code screen with a form-level message, and nothing about any market.
  if (!d || stateOf(d) === "draft") return embedded ? null : <DeadLink signedIn={false} />;
  const state = stateOf(d);
  const now = new Date(clock.now);
  const ink = inkOf(d);
  const [positions, group, denomination, tokens, fromTemplate] = await Promise.all([positionsOf(d.id), db.select({ name: schema.groups.name }).from(schema.groups).where(eq(schema.groups.id, d.groupId)).limit(1).then((r) => r[0] ?? null), denominationById(d.denomId), readClaimTokens(), templateOfMarket(d)]);
  if (!denomination) return null;
  const ghostMine = await ghostPositionFor(d.id, tokens);
  // A phone that remembers a ghost joins as them (`claimFor` takes the browser's token before any typed name), so the sheet says so rather than ask a name it would not use.
  const remembered = ghostMine ? null : ((await claimsForBrowserTokens(tokens))[0] ?? null);
  // While it is being called, a ghost who is in follows the vote as a member does (the poll, Phase 5).
  const pulse = state === "locked" && ghostMine ? await pulseFor(d.id) : null;
  const answers = answersOf(d);
  const person = await participantsOf([d.creatorId, ...positions.map((p) => pidOf(p)), ...(answers?.flatMap((a) => (a.userId ? [a.userId] : [])) ?? [])]);
  const viewerId = ghostMine?.claimId ?? "";
  const first = (pid: string) => (pid === viewerId ? "You" : firstName(person.get(pid)?.displayName ?? "Someone"));
  const pickAnswers: PickOneAnswer[] | null = answers ? answers.map((a) => ({ index: a.index, text: a.userId ? first(a.userId) : a.text, person: a.userId ? { name: person.get(a.userId)?.displayName ?? a.text, hue: hueFor(a.userId) } : null })) : null;

  // A What's on question (3.33, 3.40): the two teams as stamps, and the margin's shift, exactly as the member's screen has them.
  const game = fromTemplate?.game ?? null;
  const decidedByFeed = fromTemplate?.template.decidedByFeed === true;
  const firstDrive = fromTemplate?.template.key === "first_drive";
  const twoTeams = fromTemplate?.template.key === "home_wins" || fromTemplate?.template.key === "margin";
  const teams: { away: TeamFace; home: TeamFace; reach: number } | null = game && twoTeams ? { away: { abbr: game.awayAbbr, name: game.awayShort, color: game.awayColor }, home: { abbr: game.homeAbbr, name: game.homeShort, color: game.homeColor }, reach: SLIDER_REACH[game.sport as Sport] ?? 35 } : null;
  const numberUnit = ((u) => (u && fromTemplate?.template.key === "margin" && fromTemplate.template.shift !== null && game ? { ...u, margin: { shift: fromTemplate.template.shift.toString(), home: game.homeShort, away: game.awayShort } } : u))(unitOf(d));

  const unit: StakeUnit = { monetary: denomination.monetary, quantifiable: denomination.quantifiable, singular: denomination.template === "next_time" ? "next time" : denomination.label, plural: denomination.pluralLabel };
  const stakeWords = (s: bigint) => (denomination.monetary ? formatMoney(s) : unitWords(denomination, s));
  const mine = ghostMine?.position ?? null;
  const show = numbersVisible(d, mine !== null);
  const entries = positions.map((p) => ({ id: pidOf(p), stake: p.stake, valueBps: p.value }));
  const number = groupsNumberBps(entries);
  const axis = numberUnit && show && mine ? numberAxis(positions.map((p) => ({ id: pidOf(p), stake: p.stake, value: p.value })), numberUnit) : null;
  const pickBars: PickOneBar[] = pickAnswers ? pickAnswers.map((a) => ({ stake: positions.filter((p) => Number(p.value) === a.index).reduce((sum, p) => sum + (p.stake > 0n ? p.stake : 0n), 0n).toString(), noStake: positions.filter((p) => Number(p.value) === a.index && p.stake <= 0n).length })) : [];
  // The picture, once they are in (3.13, 3.22): the same one a member sees, with this ghost as "you".
  const picture: StagePicture | null = !mine
    ? null
    : show && pickAnswers
      ? { kind: "picks", bars: pickBars, entries: positions.length, caption: pickOneCaption({ entries: positions.map((p) => ({ id: pidOf(p), stake: p.stake, pick: Number(p.value) })), answers: pickAnswers.map((a) => a.text), viewerId, nameOf: first, stakeWords }) }
      : show && numberUnit
        ? axis
          ? { kind: "numbers", axis: serialiseAxis(axis), caption: numberCaption({ entries: positions.map((p) => ({ id: pidOf(p), stake: p.stake, value: p.value })), viewerId, nameOf: first, stakeWords, valueWords: (v) => unitPhrase(v, numberUnit) }) }
          : null
        : show
          ? { kind: "weights", buckets: buckets(entries).map((b) => ({ n: b.n, stake: b.stake.toString(), noStake: b.noStake })), group: showsMarker(entries) && number !== null ? { percent: percentOf(number) } : null, caption: weightCaption({ entries, viewerId, nameOf: first, stakeWords }) }
          : null;

  // Who said what, from the close, for a guest who is in as for anyone in (calls are in; 3.6, 3.22, 3.31).
  if (state === "locked" && picture) {
    // Someone without an account wears stone, on their share as on their avatar (6.4: the stone dashed avatar everywhere).
    const who = (p: (typeof positions)[number]) => ({ id: pidOf(p), name: person.get(pidOf(p))?.displayName ?? "Someone", hue: person.get(pidOf(p))?.ghost === true ? ("stone" as const) : hueFor(pidOf(p)), ghost: person.get(pidOf(p))?.ghost === true, stake: p.stake.toString() });
    if (picture.kind === "weights") picture.everyone = positions.map((p) => ({ ...who(p), percent: Number(p.value) / 100 }));
    if (picture.kind === "numbers") picture.everyone = positions.map((p) => ({ ...who(p), value: p.value.toString() }));
    if (picture.kind === "picks") picture.everyone = positions.map((p) => ({ ...who(p), pick: Number(p.value) }));
    if (picture.kind !== "picks") picture.rollCall = positions.map((p) => ({ ...who(p), ...rollCallWords({ kind: numberUnit ? "numeric" : "binary", value: p.value, teams: teams ? { away: teams.away.name, home: teams.home.name } : null, margin: numberUnit?.margin ? { shift: BigInt(numberUnit.margin.shift), away: numberUnit.margin.away, home: numberUnit.margin.home } : null }), you: pidOf(p) === viewerId }));
  }
  const votingIsOpen = state === "locked" && votingOpen(d, game ? { finalSeenAt: game.finalSeenAt, expectedEndAt: game.expectedEndAt } : null, now);
  const bandState: MarketMark = state === "open" ? (mine ? "in" : "open") : state === "locked" ? (votingIsOpen ? "voting" : "locked") : state;
  // The band's clock as the member's screen has it (`bandClock`): a visitor never sees votes.
  // An argument after its close names its ruling's stage, never "It's happened" (the touch-ups round).
  const bandClock = d.pace === "argument" && state === "locked" ? STAGE_WORDS[rulingStage({ ruled: d.aiOutcome !== null && d.aiProposedAt !== null, disputes: (await disputesOf(d.id)).length, settledBy: d.settledBy, said: 0, weighing: false })] : bandClockWords({ state, resolvesBy: d.resolvesBy, resolvedAt: d.resolvedAt, resolvedBy: d.resolvedBy, votes: 0, now, zone: clock.zone, votingOpen: votingIsOpen, firstCall: d.closesAfterFirst });
  // The close and the stretch after it, for a guest who is in (the games-and-the-reveal round): calls are in, by name, and "It's happened"; a guest has no vote.
  const calls = state === "open" && mine && positions.length >= 2 ? await callsAreIn(d.id) : [];
  const saidIt = new Set(calls.map((c) => c.userId ?? c.claimId));
  const closer =
    state === "open" && mine && positions.length >= 2 ? (
      <CloseSheet
        dareId={d.id}
        count={positions.length}
        asker={false}
        stuck={pastItsClose(d, now)}
        sayers={calls.map((c) => ((cid) => ({ name: cid === viewerId ? "You" : firstName(person.get(cid)?.displayName ?? "Someone"), avatarName: firstName(person.get(cid)?.displayName ?? "Someone"), hue: hueFor(cid), ghost: person.get(cid)?.ghost === true }))((c.userId ?? c.claimId) as string))}
        could={positions.filter((p) => !saidIt.has(pidOf(p)) && pidOf(p) !== d.creatorId).map((p) => (pidOf(p) === viewerId ? "you" : firstName(person.get(pidOf(p))?.displayName ?? "Someone")))}
        need={Math.max(0, callsNeeded(positions.length) - calls.length)}
        meSaid={saidIt.has(viewerId)}
      />
    ) : null;
  const howItWorks = d.pace === "argument" ? "Two sides. Whoever’s right has got the other." : pickAnswers ? "Everyone picks one. The right pick does best." : numberUnit ? "Everyone puts in a number. Closest does best." : "Everyone puts in their odds. Closest does best.";
  const until = d.resolvesBy ? untilLabel(d.resolvesBy, now, clock.zone) : "until it closes";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://dareful.app";
  const stack = positions.map((p) => ({ name: firstName(person.get(pidOf(p))?.displayName ?? "?"), hue: hueFor(pidOf(p)), ghost: person.get(pidOf(p))?.ghost === true }));

  // Once in, the market as anyone in sees it (3.17, frame 6): open, and locked with the clock alone on the entry line. The
  // "Closed" sheet is for a visitor who never got in.
  const ended = state === "resolved" || state === "voided" || state === "expired";
  const settledWithAnOutcome = state === "resolved" && d.resolvedOutcome !== null && d.resolvedOutcome !== VOID_OUTCOME;
  // How it ended, for a ghost who was in (the member's settled line, 3.37): the outcome in the question's words, the number, the pick, or the ending.
  const endedLine = !ended
    ? null
    : state === "expired"
      ? "Never settled."
      : state === "voided" || d.resolvedOutcome === null || d.resolvedOutcome === VOID_OUTCOME
        ? d.resolvedBy === "removed"
          ? "Called off."
          : "Nobody could tell."
        : pickAnswers
          ? `${pickAnswers.find((a) => a.index === Number(d.resolvedOutcome))?.text ?? "Decided"}.`
          : numberUnit
            ? `${unitPhrase(d.resolvedOutcome, numberUnit)}.`
            : outcomeLine(d, d.resolvedOutcome === 1n);
  // One place in the tree before and after the entry, so the sheet's next step (keeping the call in an account) survives
  // the refresh that brings the entry line in (the first-contact round): before you're in it draws nothing in the flow.
  const stage =
    state === "open" || (state === "locked" && mine) ? (
      <MarketStage
        pastClose={state === "open" && pastItsClose(d, new Date())}
        dareId={d.id}
        signing={null}
        ghost={{ known: ghostMine ? { name: ghostMine.displayName } : remembered ? { name: remembered.displayName } : null }}
        unit={unit}
        state={state === "locked" ? "locked" : "open"}
        me={{ name: ghostMine?.displayName ?? "You", hue: "stone", ghost: true }}
        mine={mine ? { percent: numberUnit || pickAnswers ? 0 : Number(mine.value) / 100, ...(numberUnit ? { number: mine.value.toString() } : {}), ...(pickAnswers ? { pick: Number(mine.value) } : {}), stake: mine.stake.toString(), stakeWords: stakeWords(mine.stake), final: d.revealMode === "blind" } : null}
        blind={d.revealMode === "blind"}
        picture={picture}
        numberUnit={numberUnit}
        teams={teams}
        consent={decidedByFeed ? (firstDrive ? DRIVE_CONSENT : CONSENT) : null}
        pickOne={pickAnswers ? { answers: pickAnswers } : null}
        mark={d.markKind === "emoji" ? d.markValue : null}
        argument={d.pace === "argument" ? { defaultPercent: positions[0] ? (positions[0].value >= 5000n ? 0 : 100) : 100, otherSays: positions[0] ? { name: first(pidOf(positions[0])), side: positions[0].value >= 5000n ? "yes" : "no" } : null } : null}
        lockedLine={d.lockedAt ? lockedLabel(d.lockedAt, now, clock.zone) : null}
        closer={closer}
        changeUntil={until}
        farOff={numberUnit && farOffThreshold(d) !== null ? { threshold: (farOffThreshold(d) as bigint).toString(), scale: d.rangeSource === "asker" && d.range !== null ? d.range.toString() : null } : null}
      />
    ) : state === "locked" ? (
      <PinnedSheet label="Closed" low={<p className="text-body text-ink-2">This one closed{d.lockedAt ? ` at ${clockOf(d.lockedAt, clock.zone)}` : ""}, so you can watch but not enter.</p>} />
    ) : (
      <PinnedSheet label="Finished" low={<p className="text-body text-ink-2">This one’s finished.</p>} />
    );

  // The stretch after the close for a guest who is in (the games-and-the-reveal round): "It's happened" opens the vote for the people with accounts in it.
  // An argument's ruling after its close (the touch-ups round, section 2): a guest in it agrees, or sees it differently in words; a photo needs an account.
  const rulingFlow = d.pace === "argument" && d.stalemate === "arbitrate" && state === "locked" && mine;
  const [agreements, disputes] = rulingFlow ? await Promise.all([agreementsOf(d.id), disputesOf(d.id)]) : [[], []];
  const rulingPeople = rulingFlow ? await participantsOf([...agreements.map((a) => a.pid), ...disputes.map((x) => x.pid)]) : new Map();
  const rulingPerson = (pid: string) => ({ name: firstName(rulingPeople.get(pid)?.displayName ?? "Someone"), hue: rulingPeople.get(pid)?.kind === "user" ? hueFor(pid) : null, me: pid === viewerId });
  const ruled = d.aiOutcome !== null && d.aiProposedAt !== null;
  const rulingAt = rulingFlow ? rulingStage({ ruled, disputes: disputes.length, settledBy: d.settledBy, said: 0, weighing: false }) : null;
  const answerTexts = answersOf(d)?.map((a) => a.text) ?? null;
  const verdict = d.aiOutcome === null ? "" : d.aiOutcome === VOID_OUTCOME ? "The app finds the facts can’t settle it." : `The app’s ruling: ${answerTexts ? (answerTexts[Number(d.aiOutcome)] ?? "") : d.aiOutcome === 1n ? "yes" : "no"}.`;
  const stretch = rulingFlow && rulingAt ? (
    <RulingSheet
      dareId={d.id}
      stage={rulingAt}
      ruling={ruled ? { line: verdict, rationale: d.aiRationale ?? "" } : null}
      agreed={agreements.filter((a) => a.outcome === d.aiOutcome).map((a) => rulingPerson(a.pid))}
      disputes={disputes.map((x) => ({ ...rulingPerson(x.pid), said: x.text }))}
      mine={{ agreed: agreements.some((a) => a.pid === viewerId && a.outcome === d.aiOutcome), disputed: disputes.some((x) => x.pid === viewerId) }}
      canAttach={false}
      canSay={false}
      seal={d.sealHash && d.sealSalt && d.sealedRationale !== null && d.sealedOutcome !== null ? { seal: bufferToHex(d.sealHash), salt: bufferToHex(d.sealSalt), text: sealedText(d.sealedOutcome, d.sealedRationale, answerTexts) } : null}
    />
  ) : state === "locked" && mine && !votingIsOpen ? <CallsAreInSheet dareId={d.id} byScore={fromTemplate?.template.decidedByScore === true} /> : null;
  const inner = (
    <>
          {/* In (3.17, frame 6): the entry line and the picture first, as anyone in sees them, then who's in and the facts. */}
          {pulse ? <VotePoll dareId={d.id} pulse={pulse.pulse} /> : null}
          {mine && endedLine ? <p className="text-serif-l text-ink">{endedLine}</p> : null}
          {state === "open" || (state === "locked" && mine) ? stage : null}
          {mine && ended && !settledWithAnOutcome ? null : mine ? (
            // In (3.17, frame 6): the who's-in row with its icons. The code is the asker's to make, so share and copy alone here. A void or an expiry has no row (3.42), as on the member's screen.
            <WhosInRow people={stack} count={positions.length === 1 ? "Just you so far" : `${positions.length} in`} share={{ url: game ? `${appUrl}/on/${game.id}/${d.groupId}` : `${appUrl}/m/${d.id}`, title: game ? game.name : d.title }} code={null} />
          ) : (
            <section className="flex items-center gap-3" data-friends-in="">
              {/* The avatars carry initials, and their accessible names are first names: the asker's is the only name on this screen (3.17). */}
              {positions.length > 0 ? <AvatarStack people={stack} size={28} ring="var(--ground)" /> : null}
              <p className="text-caption text-ink-2">{friendsIn(positions.length, "words")}</p>
            </section>
          )}
          {embedded ? null : <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-card border border-line bg-surface px-4 py-[14px]">
            <dt className="text-label text-ink-3">Decided</dt>
            <dd className="text-body text-ink">
              {decidedByFeed ? (
                firstDrive ? "By the play-by-play, once the game is over" : "By the final score, once the game is over"
              ) : d.resolvesBy ? (
                <>
                  by <When iso={d.resolvesBy.toISOString()} zone={clock.zone} serverNow={clock.now} style="day" />, by the people in it
                </>
              ) : (
                "the moment both sides are in"
              )}
              {d.criterion ? `, ${d.criterion}` : ""}
            </dd>
            <dt className="text-label text-ink-3">How it works</dt>
            <dd className="text-body text-ink">{howItWorks}</dd>
          </dl>}
          {mine ? (
            <div className="flex flex-col items-start gap-2">
              <SignInButton variant="tertiary" label="Sign in" />
            </div>
          ) : null}
      {stretch}
    </>
  );
  if (embedded)
    return (
      <div data-ink-room={ink} className="flex flex-col gap-7" data-open-card={d.id}>
        {/* The card wears the question's ink, the page staying the neutral room (3.33). */}
        <style dangerouslySetInnerHTML={{ __html: inkRoomStyleText(ink) }} />
        <LinkOpened link="market" dareId={d.id} signedIn={false} />
        {inner}
        {mine || state === "open" ? null : stage}
      </div>
    );

  return (
    <div className="flex flex-1 flex-col">
      <InkRoot ink={ink} />
      {/* The guest line (3.46): once this guest is in, never on the link page before. */}
      <GuestLineFor dareId={d.id} />
      <Screen>
        <LinkOpened link="market" dareId={d.id} signedIn={false} />
        <TopBar wordmark info="market-link" tipsWait={mine === null} />
        <div className="flex flex-col gap-7 py-2">
          <section className="-mx-2 flex flex-col gap-3 rounded-card bg-field p-4 pb-[18px]">
            <div className="flex items-center justify-between gap-3">
              {markRefOf(d) ? <MarkRefStamp mark={markRefOf(d)} size={44} onGround /> : <span />}
              <span className="flex items-center gap-2 text-label text-ink-2">
                {state === "open" && d.resolvesBy && !mine ? <LiveDot /> : null}
                <StateMark state={bandState} hue={bandState === "in" && ghostMine ? hueFor(ghostMine.claimId) : undefined} ink="var(--market-ink)" />
                {bandClock ? <span>{bandClock}</span> : null}
              </span>
            </div>
            <h1 className="text-serif-l text-ink">{d.title}</h1>
            <p className="flex items-center gap-2 text-caption text-ink-2">
              <Avatar name={firstName(person.get(d.creatorId)?.displayName ?? "?")} hue={hueFor(d.creatorId)} size={22} />
              <span>
                {/* A named set as a sentence names it (3.17, 3.38); one nobody named says nothing after "asked", since a visitor may see no names. */}
                {askerLine({ id: d.creatorId, displayName: person.get(d.creatorId)?.displayName ?? "Someone" }, { name: group?.name ?? null, members: [] }, null)}
              </span>
            </p>
          </section>
          {inner}
        </div>
        {mine || state === "open" ? null : stage}
      </Screen>
    </div>
  );
}
