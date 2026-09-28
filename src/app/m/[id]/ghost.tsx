import type { CSSProperties } from "react";
import { SignInButton } from "@/components/auth/sign-in-button";
import { Avatar, AvatarStack } from "@/components/ledger/avatar";
import { MarkRefStamp } from "@/components/ledger/mark-stamp";
import { Screen, TopBar } from "@/components/ledger/screen";
import { LiveDot, StateMark, type MarketMark } from "@/components/ledger/state-mark";
import { When } from "@/components/ledger/when";
import { MarketStage, type StagePicture } from "@/components/markets/market-stage";
import { WhosInRow } from "@/components/markets/whos-in-row";
import { DeadLink } from "@/components/markets/dead-link";
import type { StakeUnit } from "@/components/markets/market-actions";
import type { PickOneAnswer, PickOneBar } from "@/components/markets/pick-one-bars";
import { PinnedSheet } from "@/components/ui/pinned-sheet";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { readClaimTokens } from "@/lib/auth/claim-cookie";
import { denominationById } from "@/lib/ledger/denominations";
import { ghostPositionFor } from "@/lib/ledger/ghost-entry";
import { answersOf, marketById, positionsOf, stateOf, unitOf } from "@/lib/ledger/markets";
import { numbersVisible } from "@/lib/ledger/market-view";
import { numberAxis, serialiseAxis } from "@/lib/ledger/number-axis";
import { participantsOf, pidOf } from "@/lib/ledger/participants";
import { pickOneCaption } from "@/lib/ledger/pick-one";
import { farOffThreshold } from "@/lib/ledger/scale";
import { buckets, groupsNumberBps, percentOf, showsMarker, weightCaption } from "@/lib/ledger/weight";
import { templateOfMarket } from "@/lib/sports";
import { CONSENT, DRIVE_CONSENT, SLIDER_REACH } from "@/lib/sports/templates";
import type { Sport } from "@/lib/sports/types";
import { clockOf, closesLabel, firstName, untilLabel } from "@/lib/ui/copy";
import { hueFor } from "@/lib/ui/hue";
import { INKS, inkOf, inkVars } from "@/lib/ui/ink";
import { markRefOf } from "@/lib/ui/mark";
import type { TeamFace } from "@/lib/ui/team";
import { formatMoney, unitWords } from "@/lib/ui/units";
import type { viewerClock } from "@/lib/ui/zone";

const COUNT = ["", "One friend is in", "Two friends are in", "Three friends are in", "Four friends are in", "Five friends are in", "Six friends are in", "Seven friends are in", "Eight friends are in"];
const friendsIn = (n: number) => (n === 0 ? "Nobody’s in yet" : (COUNT[n] ?? "A lot of friends are in"));

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
export async function GhostMarketPage({ id, clock }: { id: string; clock: Awaited<ReturnType<typeof viewerClock>> }) {
  const d = /^[0-9a-f-]{36}$/i.test(id) ? await marketById(id) : null;
  // A revoked or malformed link (3.17): the code screen with a form-level message, and nothing about any market.
  if (!d || stateOf(d) === "draft") return <DeadLink signedIn={false} />;
  const state = stateOf(d);
  const now = new Date(clock.now);
  const ink = inkOf(d);
  const [positions, group, denomination, tokens, fromTemplate] = await Promise.all([positionsOf(d.id), db.select({ name: schema.groups.name }).from(schema.groups).where(eq(schema.groups.id, d.groupId)).limit(1).then((r) => r[0] ?? null), denominationById(d.denomId), readClaimTokens(), templateOfMarket(d)]);
  if (!denomination) return null;
  const ghostMine = await ghostPositionFor(d.id, tokens);
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
          ? { kind: "numbers", axis: serialiseAxis(axis), caption: positions.length <= 1 ? "You’re first in. Height is how much is riding on each number, not how many people picked it." : "Height is how much is riding on each number, not how many people picked it." }
          : null
        : show
          ? { kind: "weights", buckets: buckets(entries).map((b) => ({ n: b.n, stake: b.stake.toString(), noStake: b.noStake })), group: showsMarker(entries) && number !== null ? { percent: percentOf(number) } : null, caption: weightCaption({ entries, viewerId, nameOf: first, stakeWords }) }
          : null;

  const bandState: MarketMark = state === "open" ? (mine ? "in" : "open") : state === "locked" ? "locked" : state;
  const bandClock = state === "open" && d.resolvesBy ? `Closes ${closesLabel(d.resolvesBy, now, clock.zone)}` : null;
  const howItWorks = d.pace === "argument" ? "Two sides. Whoever’s right has got the other." : pickAnswers ? "Everyone picks one. The right pick does best." : numberUnit ? "Everyone puts in a number. Closest does best." : "Everyone puts in their odds. Closest does best.";
  const until = d.resolvesBy ? untilLabel(d.resolvesBy, now, clock.zone) : "until it closes";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://dareful.app";
  const stack = positions.map((p) => ({ name: firstName(person.get(pidOf(p))?.displayName ?? "?"), hue: hueFor(pidOf(p)), ghost: person.get(pidOf(p))?.ghost === true }));

  const stage =
    state === "open" ? (
      <MarketStage
        dareId={d.id}
        signing={null}
        ghost={{ known: ghostMine ? { name: ghostMine.displayName } : null }}
        unit={unit}
        state="open"
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
        lockedLine={null}
        changeUntil={until}
        farOff={numberUnit && farOffThreshold(d) !== null ? { threshold: (farOffThreshold(d) as bigint).toString(), scale: d.rangeSource === "asker" && d.range !== null ? d.range.toString() : null } : null}
      />
    ) : state === "locked" ? (
      <PinnedSheet label="Closed" low={<p className="text-body text-ink-2">This one closed{d.lockedAt ? ` at ${clockOf(d.lockedAt, clock.zone)}` : ""}, so you can watch but not enter.</p>} />
    ) : (
      <PinnedSheet label="Finished" low={<p className="text-body text-ink-2">This one’s finished.</p>} />
    );

  return (
    <div className="grain flex flex-1 flex-col" style={inkVars(ink) as CSSProperties}>
      <Screen>
        <TopBar title="dareful" />
        <div className="flex flex-col gap-7 py-2">
          <section className="-mx-2 flex flex-col gap-3 rounded-card bg-field p-4 pb-[18px]">
            <div className="flex items-center justify-between gap-3">
              {markRefOf(d) ? <MarkRefStamp mark={markRefOf(d)} size={44} onGround /> : <span />}
              <span className="flex items-center gap-2 text-label text-ink-2">
                {state === "open" && d.resolvesBy && !mine ? <LiveDot /> : null}
                <StateMark state={bandState} hue={bandState === "in" && ghostMine ? hueFor(ghostMine.claimId) : undefined} ink={INKS[ink].ink} />
                {bandClock ? <span>{bandClock}</span> : null}
              </span>
            </div>
            <h1 className="text-serif-l text-ink">{d.title}</h1>
            <p className="flex items-center gap-2 text-caption text-ink-2">
              <Avatar name={firstName(person.get(d.creatorId)?.displayName ?? "?")} hue={hueFor(d.creatorId)} size={22} />
              <span>
                {firstName(person.get(d.creatorId)?.displayName ?? "Someone")} asked{group?.name ? ` ${group.name}` : ""}
              </span>
            </p>
          </section>
          {mine ? (
            // In (3.17, frame 6): the who's-in row with its icons. The code is the asker's to make, so share and copy alone here.
            <WhosInRow people={stack} count={positions.length === 1 ? "Just you so far" : `${positions.length} of you in`} share={{ url: `${appUrl}/m/${d.id}`, title: d.title }} code={null} />
          ) : (
            <section className="flex items-center gap-3" data-friends-in="">
              {/* The avatars carry initials, and their accessible names are first names: the asker's is the only name on this screen (3.17). */}
              {positions.length > 0 ? <AvatarStack people={stack} size={28} ring="var(--ground)" /> : null}
              <p className="text-caption text-ink-2">{friendsIn(positions.length)}</p>
            </section>
          )}
          <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-card border border-line bg-surface px-4 py-[14px]">
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
          </dl>
          {mine ? (
            <div className="flex flex-col items-start gap-2">
              <SignInButton variant="tertiary" label="Sign in" />
            </div>
          ) : null}
        </div>
        {stage}
      </Screen>
    </div>
  );
}
