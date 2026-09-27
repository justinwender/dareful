import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { SignInButton } from "@/components/auth/sign-in-button";
import { InviteShare } from "@/components/ledger/invite-share";
import { MarkRefStamp } from "@/components/ledger/mark-stamp";
import { MediaFrame } from "@/components/ledger/media-frame";
import { Screen, SectionLabel, TopBar } from "@/components/ledger/screen";
import { LiveDot, StateMark } from "@/components/ledger/state-mark";
import { TeamStamp } from "@/components/ledger/team-stamp";
import { WhoHasWho } from "@/components/markets/leaderboard";
import { PhotoAdding } from "@/components/markets/photo-adding";
import { SetupSheet } from "@/components/markets/setup-sheet";
import { LinkPending } from "@/components/ui/link-pending";
import { GameHeader, StartGame, type MenuItem } from "@/components/on/start-game";
import { EmptySlot } from "@/components/markets/empty-slot";
import { currentUser } from "@/lib/auth/session";
import { contracts } from "@/lib/chain/contracts";
import { daresDomain } from "@/lib/chain/typed-data";
import { denominationsByIds, denominationsForGroup } from "@/lib/ledger/denominations";
import { peopleForUser, peopleSetsFor } from "@/lib/ledger/groups";
import { marketCards, numbersVisible } from "@/lib/ledger/market-view";
import { answersOf, openInksByGroup, positionsOf, recentCompanions, stateOf, unitOf, VOID_OUTCOME } from "@/lib/ledger/markets";
import { nightHeading, restOfThatNight } from "@/lib/ledger/night";
import { groupsNumberBps, percentOf } from "@/lib/ledger/weight";
import { unitPhrase, weightedMedian } from "@/lib/ledger/number-axis";
import { frameOnMarkets } from "@/lib/media";
import { storageConfigured } from "@/lib/media/storage";
import { cardMeta, lineT, type CardInput } from "@/lib/sports/cards";
import { gameById, gameGroupsFor, gameMarkets } from "@/lib/sports";
import { scoreLine } from "@/lib/sports/results";
import { SLIDER_REACH, templatesFor, type TemplateKey } from "@/lib/sports/templates";
import type { Sport } from "@/lib/sports/types";
import { clockWithDay } from "@/lib/notify/messages";
import { startLabel } from "@/components/on/game-row";
import { clockOf, dateLabel, firstName, fromThatNight, setCaption } from "@/lib/ui/copy";
import { hueFor, hueVar } from "@/lib/ui/hue";
import { inkOf, INKS } from "@/lib/ui/ink";
import { markRefOf } from "@/lib/ui/mark";
import { outcomeLine } from "@/lib/ui/outcome-words";
import type { TeamFace } from "@/lib/ui/team";
import { viewerClock } from "@/lib/ui/zone";

/**
 * The game page (docs/design.md 3.33): an index, never a new kind of market screen. A header with the two teams
 * and the time, then one collapsed card per question the group is running, each opening its ordinary market
 * screen. It belongs to one set of people: from What's on, a game you are on with one group opens that group's
 * page; with two or more, the most recent, with the groups as context chips to switch; with none, the start.
 * "Add another" rows offer the rest of the menu until kickoff. Once the game is over, the page is the night (3.37).
 */
export async function GamePage({ id, g, add, start }: { id: string; g: string | null; add: string | null; start: boolean }) {
  const clock = await viewerClock();
  const now = new Date(clock.now);
  const found = await gameById(id);
  if (!found) notFound();
  const { game } = found;
  const me = await currentUser();
  const away: TeamFace = { abbr: game.awayAbbr, name: game.awayShort, color: game.awayColor };
  const home: TeamFace = { abbr: game.homeAbbr, name: game.homeShort, color: game.homeColor };
  const header = { id: game.id, name: game.name, away, home, start: startLabel(game.startsAt, clock.zone) };
  if (!me) {
    // A pasted link: the game, and the questions the link's own set asked on it, each opening its market screen, where
    // someone without an account can put a number on it (docs/design.md 3.17). Nothing about any other group (3.32).
    const asked = g && /^[0-9a-f-]{36}$/i.test(g) ? (await gameMarkets(game.id, g)).filter((r) => r.dare.creatorSignature) : [];
    return (
      <Screen>
        <TopBar title="dareful" />
        <div className="flex flex-col gap-6 py-6">
          <GameHeader game={header} caption="Everything closes at kickoff." />
          {asked.length > 0 ? (
            <div className="overflow-hidden rounded-card border border-line bg-surface" data-game-questions="">
              {asked.map((r, i) => (
                <Link prefetch={false} key={r.dare.id} href={`/m/${r.dare.id}`} className={`relative flex items-center justify-between gap-3 px-4 py-[14px] ${i > 0 ? "border-t border-line" : ""}`}>
                  <LinkPending />
                  <span className="text-body-strong text-ink">{r.dare.title}</span>
                  <span className="link-row">Open</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-body text-ink-2">Sign in to get in on it.</p>
          )}
          <SignInButton label="Sign in" variant={asked.length > 0 ? "tertiary" : "primary"} />
        </div>
      </Screen>
    );
  }
  const groups = await gameGroupsFor(game.id, me);
  const chosen = (g && groups.find((x) => x.groupId === g)) || groups[0] || null;
  const ahead = game.startsAt.getTime() > now.getTime() && game.status !== "postponed" && game.status !== "canceled";
  const menu = templatesFor({ sport: game.sport as Sport, home: { short: game.homeShort }, away: { short: game.awayShort }, seasonType: game.seasonType });
  const menuItems: MenuItem[] = menu.map((m) => ({ key: m.key, name: m.name, kindLabel: m.kindLabel, title: m.title, rows: m.rows }));
  const closes = `${game.startsAt.toLocaleDateString("en-US", { timeZone: clock.zone, weekday: "short" })} ${clockOf(game.startsAt, clock.zone)}`;
  const { chainId, dares } = contracts();
  const signing = { domain: daresDomain(chainId, dares.address), ledgerWallet: me.ledgerWallet };

  // Starting, or adding one: the who's-in step needs the same sets and people the ask flow offers (3.20).
  async function setsAndPeople() {
    const [sets, known, recent] = await Promise.all([peopleSetsFor(me!.id, me!.displayName), peopleForUser(me!.id), recentCompanions(me!.id)]);
    const rank = new Map(recent.map((id, i) => [id, i]));
    const people = [...known].sort((a, b) => (rank.get(a.user.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.user.id) ?? Number.MAX_SAFE_INTEGER) || a.user.displayName.localeCompare(b.user.displayName));
    const taken = await openInksByGroup(sets.slice(0, 6).map((s) => s.groupId));
    const options = await Promise.all(
      sets.slice(0, 6).map(async (s, i) => ({
        takenInks: taken.get(s.groupId) ?? [],
        groupId: s.groupId,
        label: s.label,
        caption: setCaption({ size: s.members.length, lastAskedAt: s.lastAskedAt, isMostRecent: i === 0, now, timeZone: clock.zone }),
        avatars: s.members.filter((m) => m.userId !== me!.id).map((m) => ({ name: m.displayName, hue: m.userId ? hueFor(m.userId) : ("stone" as const) })),
        offerName: s.offerName,
        size: s.members.length,
        units: (await denominationsForGroup(s.groupId)).filter((u) => !u.monetary).map((u) => ({ id: u.id, label: u.label, template: u.template })),
      })),
    );
    return { sets: options, people: people.map((p) => ({ id: p.user.id, name: p.user.displayName, hue: hueFor(p.user.id) })) };
  }

  if (ahead && (start || !chosen)) {
    const { sets, people } = await setsAndPeople();
    return <StartGame game={header} menu={menuItems} sets={sets} people={people} chrome={<TopBar back title="Start a game" />} signing={signing} mode={{ kind: "start" }} closes={closes} />;
  }
  if (!chosen) {
    // The game has started and this person is on it with nobody: nothing to show but the game.
    return (
      <Screen>
        <TopBar back />
        <div className="flex flex-col gap-6 py-2">
          <GameHeader game={header} caption="This one has started, so it’s too late to ask." />
        </div>
      </Screen>
    );
  }
  const running = await gameMarkets(game.id, chosen.groupId);
  const runningKeys = new Set(running.filter((r) => r.dare.creatorSignature || r.dare.creatorId === me.id).map((r) => r.template.key));
  if (ahead && add && menu.some((m) => m.key === add) && !runningKeys.has(add as TemplateKey)) {
    // Adding one (3.33): the terms step alone, with the same people already chosen.
    const { sets: all, people } = await setsAndPeople();
    let sets = all.filter((s) => s.groupId === chosen.groupId);
    if (sets.length === 0) sets = [{ takenInks: [], groupId: chosen.groupId, label: chosen.label, caption: "", avatars: [], offerName: false, size: 0, units: (await denominationsForGroup(chosen.groupId)).filter((u) => !u.monetary).map((u) => ({ id: u.id, label: u.label, template: u.template })) }];
    return <StartGame game={header} menu={menuItems.filter((m) => m.key === add)} sets={sets} people={people} chrome={<TopBar back title="Add another" />} signing={signing} mode={{ kind: "add", groupId: chosen.groupId, groupLabel: chosen.label, key: add as TemplateKey }} closes={closes} />;
  }

  // The cards: the group's questions on this game, with the viewer's own value and the group's number where numbers may be shown.
  const ids = running.map((r) => r.dare.id);
  const [cards, positionsAll, seats, denoms] = await Promise.all([
    marketCards({ viewerId: me.id, groupId: chosen.groupId, limit: 60 }),
    Promise.all(ids.map((d) => positionsOf(d))),
    db.select({ userId: schema.groupMembers.userId }).from(schema.groupMembers).where(and(eq(schema.groupMembers.groupId, chosen.groupId), isNull(schema.groupMembers.leftAt))),
    denominationsByIds(Array.from(new Set(running.map((r) => r.dare.denomId)))),
  ]);
  const cardOf = new Map(cards.map((c) => [c.dare.id, c]));
  const positionsOfMarket = new Map(ids.map((d, i) => [d, positionsAll[i] ?? []]));
  const userIds = Array.from(new Set([...positionsAll.flat().map((p) => p.userId as string), ...running.map((r) => r.dare.creatorId)]));
  const users = userIds.length ? await db.select({ id: schema.users.id, displayName: schema.users.displayName }).from(schema.users).where(inArray(schema.users.id, userIds)) : [];
  const nameOf = (uid: string) => (uid === me.id ? "You" : firstName(users.find((u) => u.id === uid)?.displayName ?? "Someone"));
  const reach = SLIDER_REACH[game.sport as Sport] ?? 35;
  const first = [...running].filter((r) => r.dare.creatorSignature).sort((a, b) => a.dare.createdAt.getTime() - b.dare.createdAt.getTime())[0] ?? running[0];
  const askerLine = first ? `${first.dare.creatorId === me.id ? "You" : nameOf(first.dare.creatorId)} asked ${chosen.label}.` : "";
  const feedFinal = game.finalSeenAt && game.homeScore !== null && game.awayScore !== null ? { home: game.homeScore, away: game.awayScore } : null;
  const over = !ahead && (game.completed || running.every((r) => ["resolved", "voided", "expired"].includes(stateOf(r.dare))));

  const cardRows = running.map(({ dare, template }) => {
    const state = stateOf(dare);
    const card = cardOf.get(dare.id) ?? null;
    const positions = positionsOfMarket.get(dare.id) ?? [];
    const mine = positions.find((p) => p.userId === me.id) ?? null;
    const unit = ((u) => (u && template.key === "margin" && template.shift !== null ? { ...u, margin: { shift: template.shift.toString(), home: game.homeShort, away: game.awayShort } } : u))(unitOf(dare));
    const answers = answersOf(dare)?.map((a) => a.text) ?? null;
    const teams = template.key === "home_wins" ? { away: game.awayShort, home: game.homeShort } : null;
    const resolved = state === "resolved" && dare.resolvedOutcome !== null && dare.resolvedOutcome !== VOID_OUTCOME;
    const outcomeWords = !resolved ? null : answers ? (answers[Number(dare.resolvedOutcome)] ?? "Decided") : unit ? unitPhrase(dare.resolvedOutcome as bigint, unit) : outcomeLine(dare, dare.resolvedOutcome === 1n).replace(/\.$/, "");
    const best = resolved ? positions.reduce<(typeof positions)[number] | null>((m, p) => (p.score !== null && (m === null || (m.score ?? -1) < p.score) ? p : m), null) : null;
    const off = best && unit && dare.resolvedOutcome !== null ? (best.value > dare.resolvedOutcome ? best.value - dare.resolvedOutcome : dare.resolvedOutcome - best.value).toString() : null;
    const callers = answers && resolved ? positions.filter((p) => Number(p.value) === Number(dare.resolvedOutcome)) : [];
    const closest = answers ? (callers.length ? { name: callers.some((p) => p.userId === me.id) ? "You" : nameOf(callers[0]!.userId as string), off: null } : null) : best ? { name: nameOf(best.userId as string), off } : null;
    const votingEnds = state === "locked" && game.finalSeenAt ? clockWithDay(new Date(game.finalSeenAt.getTime() + 24 * 3_600_000), now, clock.zone).replace(/^at /, "") : null;
    const input: CardInput = {
      key: template.key as TemplateKey,
      state,
      viewerIn: mine !== null,
      mine: mine?.value ?? null,
      inCount: positions.length,
      groupSize: Math.max(seats.length, positions.length),
      votesCast: card?.votesCast ?? 0,
      proposed: dare.feedOutcome !== null,
      voted: false,
      teams,
      unit,
      answers,
      outcomeWords,
      feedEnding: (dare.feedEnding as CardInput["feedEnding"]) ?? null,
      resolvedBy: dare.resolvedBy,
      closest,
      votingEnds,
    };
    const meta = cardMeta(input);
    // The line under a slider card (3.33): the two 20px stamps, a 6px track on the question's field with a tick at the middle, and once you're in a dot at your value and a tick at the group's number.
    const slider = template.key === "home_wins" || template.key === "margin";
    const show = numbersVisible(dare, mine !== null);
    const myT = mine && slider ? lineT({ key: template.key as TemplateKey, value: mine.value, shift: template.shift, reach }) : null;
    const groupValue = slider && show && mine && positions.length >= 3 ? (template.key === "home_wins" ? ((n) => (n === null ? null : BigInt(percentOf(n)) * 100n))(groupsNumberBps(positions.map((p) => ({ id: p.userId as string, stake: p.stake, valueBps: p.value })))) : weightedMedian(positions.map((p) => ({ stake: p.stake, value: p.value })))) : null;
    const groupT = groupValue === null ? null : lineT({ key: template.key as TemplateKey, value: groupValue, shift: template.shift, reach });
    return { dare, template, meta, slider, myT, groupT, ink: inkOf(dare), state, mine };
  });
  const firstOpenNotIn = cardRows.find((c) => c.state === "open" && !c.mine)?.dare.id ?? null;
  const toAdd = ahead ? menu.filter((m) => !runningKeys.has(m.key)) : [];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://dareful.app";
  const shareUrl = `${appUrl}/on/${game.id}/${chosen.groupId}`;

  const chips =
    groups.length > 1 ? (
      <div className="flex flex-wrap items-center gap-2" aria-label="Which set of people">
        {groups.map((x) => {
          const on = x.groupId === chosen.groupId;
          return (
            <Link key={x.groupId} prefetch={false} scroll={false} href={`/on/${game.id}?g=${x.groupId}`} aria-current={on ? "true" : undefined} className="relative -my-1 inline-flex h-11 max-w-full items-center">
              <LinkPending />
              <span className={`inline-flex h-9 max-w-full items-center gap-1.5 rounded-pill border px-[14px] chip-context text-ink-2 ${on ? "border-ink-3 bg-surface-2" : "border-line-strong"} ${x.unnamed && !on ? "border-dashed" : ""}`}>
                <span className="truncate">{x.label}</span>
              </span>
            </Link>
          );
        })}
      </div>
    ) : null;

  const cardsList = (
    <div className="flex flex-col gap-2" data-game-cards="">
      {cardRows.map((c) => {
        const live = c.dare.id === firstOpenNotIn && ahead;
        return (
          <Link key={c.dare.id} prefetch={false} href={`/m/${c.dare.id}`} className="relative flex flex-col gap-2 rounded-card border border-line bg-surface px-3 py-3" data-game-card={c.template.key} data-card-state={c.state}>
            <LinkPending />
            <span className="grid grid-cols-[40px_minmax(0,1fr)_18px] items-center gap-3">
              {markRefOf(c.dare) ? <MarkRefStamp mark={markRefOf(c.dare)} size={40} ink={c.ink} /> : <span />}
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-body-strong text-ink">{c.dare.title}</span>
                <span className="flex items-center gap-2 text-caption text-ink-3">
                  {live ? <LiveDot /> : null}
                  <StateMark state={c.meta.mark} hue={c.meta.mark === "in" ? hueFor(me.id) : undefined} ink={c.meta.mark === "resolved" ? INKS[c.ink].ink : undefined} />
                  <span className="truncate">{c.meta.text}</span>
                </span>
              </span>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-3">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </span>
            {c.slider ? (
              <span aria-hidden="true" className="flex h-5 items-center gap-2">
                <TeamStamp team={away} size={20} />
                <span className="relative h-[6px] min-w-0 flex-1 rounded-[3px]" style={{ background: INKS[c.ink].field }}>
                  <span className="absolute top-1/2 left-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-line-strong" />
                  {c.groupT !== null ? <span className="absolute top-1/2 h-3 w-[2px] -translate-x-1/2 -translate-y-1/2 bg-ink" style={{ left: `${c.groupT * 100}%` }} /> : null}
                  {c.myT !== null ? <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-pill" style={{ left: `${c.myT * 100}%`, background: hueVar(hueFor(me.id)) }} /> : null}
                </span>
                <TeamStamp team={home} size={20} />
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );

  if (over) {
    // The night (3.37, frame D): the final score as the title, the photos from every question in one frame, the settled cards, who's got who across the night, and the rest of that night.
    const frames = await frameOnMarkets(ids);
    const clips = ids.flatMap((d) => (frames.get(d) ?? []).filter((m) => m.role === "evidence"));
    const memories = ids.flatMap((d) => (frames.get(d) ?? []).filter((m) => m.role === "memory")).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const items = [...clips, ...memories].map((m) => ({ id: m.id, author: { name: m.author.displayName, hue: hueFor(m.author.id) }, removable: m.role === "memory" && m.author.id === me.id }));
    const edges = ids.length ? await db.select().from(schema.obligations).where(and(eq(schema.obligations.origin, "dare"), inArray(schema.obligations.originId, ids))) : [];
    // Who's got who across the night: one row per pair and unit, summed over the questions; the obligations underneath stay separate.
    const summed = new Map<string, { fromId: string; toId: string; denomId: string; quantity: bigint }>();
    for (const e of edges) {
      const key = `${e.fromUser}:${e.toUser}:${e.denomId}`;
      const s = summed.get(key) ?? { fromId: e.fromUser, toId: e.toUser, denomId: e.denomId, quantity: 0n };
      s.quantity += e.quantity ?? 1n;
      summed.set(key, s);
    }
    const byDenom = new Map<string, Array<{ fromId: string; toId: string; quantity: bigint }>>();
    for (const s of summed.values()) byDenom.set(s.denomId, [...(byDenom.get(s.denomId) ?? []), { fromId: s.fromId, toId: s.toId, quantity: s.quantity }]);
    const participants = Array.from(new Set(positionsAll.flat().map((p) => p.userId as string)));
    const people = new Map(users.map((u) => [u.id, u]));
    const inAny = participants.includes(me.id);
    const endedAt = running.map((r) => r.dare.resolvedAt ?? r.dare.lockedAt ?? r.dare.createdAt).sort((a, b) => b.getTime() - a.getTime())[0] ?? game.startsAt;
    const rest = await restOfThatNight({ dareId: first?.dare.id ?? ids[0] ?? "", excludeIds: ids, groupIds: [chosen.groupId], people: participants, viewerId: me.id, closedAt: game.startsAt, endedAt }).catch(() => []);
    const night = fromThatNight(endedAt, now, clock.zone);
    return (
      <PhotoAdding dareId={first?.dare.id ?? ids[0] ?? ""} night={night} canAdd={inAny && storageConfigured() && Boolean(first)} capture={false} viewer={{ name: me.displayName, hue: hueFor(me.id) }}>
        <Screen>
          <TopBar back />
          <div className="flex flex-col gap-7 py-2">
            <section className="-mx-2 flex flex-col gap-3 rounded-card bg-surface-2 p-4 pb-[18px]" data-game-header={game.id} data-game-night="">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <TeamStamp team={away} size={44} />
                  <TeamStamp team={home} size={44} />
                </span>
                <span className="text-label text-ink-2">{dateLabel(endedAt, clock.zone)}</span>
              </div>
              <h1 className="text-serif-l text-ink">{feedFinal ? `${scoreLine(feedFinal, game.homeShort, game.awayShort)}.` : game.name}</h1>
              <p className="text-caption text-ink-2">{askerLine}</p>
            </section>
            {chips}
            {items.length > 0 ? <MediaFrame items={items} height={260} inset add={inAny && storageConfigured() && first ? { night } : null} /> : inAny && storageConfigured() && first ? <EmptySlot /> : null}
            <section className="flex flex-col gap-[10px]">
              <SectionLabel>Questions</SectionLabel>
              {cardsList}
            </section>
            {byDenom.size > 0 ? (
              <section className="flex flex-col gap-3">
                <SectionLabel>Who’s got who</SectionLabel>
                {Array.from(byDenom, ([denomId, transfers]) => {
                  const denomination = denoms.get(denomId);
                  return denomination ? (
                    <div key={denomId} className="rounded-card border border-line bg-surface px-4 py-[14px]">
                      <WhoHasWho transfers={transfers} people={people} participants={participants} denomination={denomination} viewerId={me.id} />
                    </div>
                  ) : null;
                })}
                <p className="text-caption text-ink-3">Added up across the game. Each question’s own screen has its part.</p>
              </section>
            ) : null}
            {rest.length > 0 ? (
              <section className="flex flex-col gap-3">
                <SectionLabel>{nightHeading(game.startsAt, clock.zone)}</SectionLabel>
                <div className="overflow-hidden rounded-card border border-line bg-surface">
                  {rest.map((r, i) => (
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
          </div>
        </Screen>
      </PhotoAdding>
    );
  }

  const more = (
    <SetupSheet>
      {running.map(({ dare, template }) => (
        <div key={dare.id} className="flex flex-col gap-1">
          <p className="text-label text-ink-3">{template.title}</p>
          <p className="text-body-sm text-ink-2">{dare.termsText}</p>
        </div>
      ))}
    </SetupSheet>
  );

  return (
    <Screen>
      <TopBar back right={more} />
      <div className="flex flex-col gap-7 py-2">
        <GameHeader game={header} caption={`${askerLine} ${ahead ? "Everything closes at kickoff." : "Everything closed at kickoff."}`.trim()} right={ahead ? undefined : feedFinal ? scoreLine(feedFinal, game.homeShort, game.awayShort) : "Started"} />
        {chips}
        <section className="flex flex-col gap-[10px]">
          <SectionLabel>Questions</SectionLabel>
          {cardsList}
        </section>
        {toAdd.length > 0 ? (
          <section className="flex flex-col gap-[10px]" data-add-another="">
            <SectionLabel>Add another</SectionLabel>
            <div className="flex flex-col gap-2">
              {toAdd.map((m) => (
                <Link key={m.key} prefetch={false} href={`/on/${game.id}?g=${chosen.groupId}&add=${m.key}`} className="relative grid h-16 grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-card border-[1.5px] border-dashed border-line-strong px-3">
                  <LinkPending />
                  <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-button border-[1.5px] border-dashed border-line-strong text-ink-2">
                    +
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-body-strong text-ink">{m.name}</span>
                    <span className="text-caption text-ink-3">{m.kindLabel}</span>
                  </span>
                  <span className="link-tertiary">Add</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
        {ahead ? (
          // The link sent to the chat is the game page's when more than one question runs (3.33); someone arriving from it lands here and enters each question from its card.
          <InviteShare url={shareUrl} text={game.name} label="Send it to the chat" />
        ) : null}
      </div>
    </Screen>
  );
}


