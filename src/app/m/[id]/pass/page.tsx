import { notFound, redirect } from "next/navigation";
import { MarkRefStamp } from "@/components/ledger/mark-stamp";
import { Screen } from "@/components/ledger/screen";
import { StateMark } from "@/components/ledger/state-mark";
import { When } from "@/components/ledger/when";
import { HandOver } from "@/components/markets/hand-over";
import type { StakeUnit } from "@/components/markets/market-actions";
import type { PickOneAnswer } from "@/components/markets/pick-one-bars";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth/session";
import { denominationById } from "@/lib/ledger/denominations";
import { askerLine } from "@/lib/ledger/groups";
import { canHandOver, handOverCandidates } from "@/lib/ledger/hand-over";
import { answersOf, marketById, positionsOf, stateOf, unitOf } from "@/lib/ledger/markets";
import { participantsOf, pidOf } from "@/lib/ledger/participants";
import { farOffThreshold } from "@/lib/ledger/scale";
import { templateOfMarket } from "@/lib/sports";
import { CONSENT, DRIVE_CONSENT, SLIDER_REACH } from "@/lib/sports/templates";
import type { Sport } from "@/lib/sports/types";
import { closesClock, firstName, untilLabel } from "@/lib/ui/copy";
import { hueFor } from "@/lib/ui/hue";
import { inkOf } from "@/lib/ui/ink";
import { InkRoot } from "@/components/ledger/ink-root";
import { markRefOf } from "@/lib/ui/mark";
import type { TeamFace } from "@/lib/ui/team";
import { viewerClock } from "@/lib/ui/zone";

export const dynamic = "force-dynamic";

/**
 * Handing the phone over (docs/design.md 3.45): the host's session, the friend's screen. Reached from the fourth
 * icon on the who's-in row, for someone who is in while the market is open. What it shows is what the link page
 * shows before anyone is in: the band, the details, and the entry sheet; no who's-in row, no weight line, no
 * number of anyone's, the host's included, blind or open. The friend's entry is sent by `HandOver` with the
 * friend's PIN and signed by the friend's own delegated share on the server. Nothing of the friend's stays here.
 */
export default async function HandOverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await currentUser();
  if (!me) redirect("/");
  const d = /^[0-9a-f-]{36}$/i.test(id) ? await marketById(id) : null;
  if (!d) notFound();
  if (!(await canHandOver(d.id, me.id))) redirect(`/m/${d.id}`);
  const clock = await viewerClock();
  const now = new Date(clock.now);
  const ink = inkOf(d);
  const [positions, group, denomination, fromTemplate, candidates] = await Promise.all([positionsOf(d.id), db.select({ name: schema.groups.name }).from(schema.groups).where(eq(schema.groups.id, d.groupId)).limit(1).then((r) => r[0] ?? null), denominationById(d.denomId), templateOfMarket(d), handOverCandidates(d.id, me.id)]);
  if (!denomination) notFound();
  const answers = answersOf(d);
  const person = await participantsOf([d.creatorId, ...(answers?.flatMap((a) => (a.userId ? [a.userId] : [])) ?? [])]);
  const first = (pid: string) => firstName(person.get(pid)?.displayName ?? "Someone");
  const pickAnswers: PickOneAnswer[] | null = answers ? answers.map((a) => ({ index: a.index, text: a.userId ? first(a.userId) : a.text, person: a.userId ? { name: person.get(a.userId)?.displayName ?? a.text, hue: hueFor(a.userId) } : null })) : null;
  const game = fromTemplate?.game ?? null;
  const decidedByFeed = fromTemplate?.template.decidedByFeed === true;
  const firstDrive = fromTemplate?.template.key === "first_drive";
  const twoTeams = fromTemplate?.template.key === "home_wins" || fromTemplate?.template.key === "margin";
  const teams: { away: TeamFace; home: TeamFace; reach: number } | null = game && twoTeams ? { away: { abbr: game.awayAbbr, name: game.awayShort, color: game.awayColor }, home: { abbr: game.homeAbbr, name: game.homeShort, color: game.homeColor }, reach: SLIDER_REACH[game.sport as Sport] ?? 35 } : null;
  const numberUnit = ((u) => (u && fromTemplate?.template.key === "margin" && fromTemplate.template.shift !== null && game ? { ...u, margin: { shift: fromTemplate.template.shift.toString(), home: game.homeShort, away: game.awayShort } } : u))(unitOf(d));
  const unit: StakeUnit = { monetary: denomination.monetary, quantifiable: denomination.quantifiable, singular: denomination.template === "next_time" ? "next time" : denomination.label, plural: denomination.pluralLabel };
  const howItWorks = d.pace === "argument" ? "Two sides. Whoever’s right has got the other." : pickAnswers ? "Everyone picks one. The right pick does best." : numberUnit ? "Everyone puts in a number. Closest does best." : "Everyone puts in their odds. Closest does best.";
  const until = d.resolvesBy ? untilLabel(d.resolvesBy, now, clock.zone) : "until it closes";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://dareful.app";
  // An argument's second side is the first's opposite; nothing else of the first entry reaches this screen.
  const firstIn = positions[0] ?? null;
  const argument = d.pace === "argument" ? { defaultPercent: firstIn ? (firstIn.value >= 5000n ? 0 : 100) : 100, otherSays: firstIn ? { name: first(pidOf(firstIn)), side: firstIn.value >= 5000n ? ("yes" as const) : ("no" as const) } : null } : null;
  void stateOf;

  const band = (
    <section className="-mx-2 flex flex-col gap-3 rounded-card bg-field p-4 pb-[18px]" data-pass-band="">
      <div className="flex items-center justify-between gap-3">
        {markRefOf(d) ? <MarkRefStamp mark={markRefOf(d)} size={44} onGround /> : <span />}
        <span className="flex items-center gap-2 text-label text-ink-2">
          <StateMark state="open" ink="var(--market-ink)" />
          {d.resolvesBy ? <span>{closesClock(d.resolvesBy, now, clock.zone)}</span> : null}
        </span>
      </div>
      <h1 className="text-serif-l text-ink">{d.title}</h1>
      <p className="text-caption text-ink-2">
        {/* A named set as a sentence names it (3.17, 3.38); nothing of the host's, so never "You", and no names for a set nobody named. */}
        {askerLine({ id: d.creatorId, displayName: person.get(d.creatorId)?.displayName ?? "Someone" }, { name: group?.name ?? null, members: [] }, null)}
      </p>
    </section>
  );
  const details = (
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
  );

  return (
    <div className="flex flex-1 flex-col" data-pass-screen="">
      <InkRoot ink={ink} />
      <Screen>
        <HandOver
          dareId={d.id}
          host={{ name: me.displayName }}
          question={d.title}
          mark={markRefOf(d)}
          url={`${appUrl}/m/${d.id}`}
          candidates={candidates.map((c) => ({ ...c, hue: hueFor(c.id) }))}
          changeUntil={until}
          blind={d.revealMode === "blind"}
          band={band}
          details={details}
          stage={{
            dareId: d.id,
            signing: null,
            unit,
            state: "open",
            me: { name: "You", hue: "stone" },
            mine: null,
            blind: d.revealMode === "blind",
            picture: null,
            numberUnit,
            teams,
            consent: decidedByFeed ? (firstDrive ? DRIVE_CONSENT : CONSENT) : null,
            pickOne: pickAnswers ? { answers: pickAnswers } : null,
            mark: d.markKind === "emoji" ? d.markValue : null,
            argument,
            lockedLine: null,
            changeUntil: until,
            farOff: numberUnit && farOffThreshold(d) !== null ? { threshold: (farOffThreshold(d) as bigint).toString(), scale: d.rangeSource === "asker" && d.range !== null ? d.range.toString() : null } : null,
          }}
        />
      </Screen>
    </div>
  );
}
