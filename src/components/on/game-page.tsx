import { GuestLineFor } from "@/components/guest/guest-line";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { SignInButton } from "@/components/auth/sign-in-button";
import { MarkRefStamp } from "@/components/ledger/mark-stamp";
import { MediaFrame } from "@/components/ledger/media-frame";
import { Screen, SectionLabel, TopBar } from "@/components/ledger/screen";
import { LiveDot, StateMark } from "@/components/ledger/state-mark";
import { TeamStamp } from "@/components/ledger/team-stamp";
import { WhoHasWho } from "@/components/markets/leaderboard";
import { PhotoAdding } from "@/components/markets/photo-adding";
import { PhotoProblem } from "@/components/markets/photo-problem";
import { SetupSheet } from "@/components/markets/setup-sheet";
import { WhosInRow } from "@/components/markets/whos-in-row";
import { LinkPending } from "@/components/ui/link-pending";
import { GameHeader, StartGame, type AlreadyAsked, type MenuItem } from "@/components/on/start-game";
import { LiveScore } from "@/components/on/live-score";
import { OpenCardScroll } from "@/components/on/open-card-scroll";
import { EmptySlot } from "@/components/markets/empty-slot";
import { MarketScreen } from "@/app/m/[id]/market-screen";
import { GhostMarketPage } from "@/app/m/[id]/ghost";
import { currentUser } from "@/lib/auth/session";
import { contracts } from "@/lib/chain/contracts";
import { daresDomain } from "@/lib/chain/typed-data";
import { denominationsByIds, denominationsForGroup } from "@/lib/ledger/denominations";
import { askerLine, membersOfGroups, setFacts, type SetFacts } from "@/lib/ledger/groups";
import { marketCards, numbersVisible } from "@/lib/ledger/market-view";
import { answersOf, gameIsOver, positionsOf, stateOf, unitOf, VOID_OUTCOME, type DareRow } from "@/lib/ledger/markets";
import { nightHeading, restOfThatNight } from "@/lib/ledger/night";
import { participantsOf, pidOf } from "@/lib/ledger/participants";
import { groupsNumberBps, percentOf } from "@/lib/ledger/weight";
import { unitPhrase, weightedMedian } from "@/lib/ledger/number-axis";
import { votingOpen } from "@/lib/ledger/voting-open";
import { frameOnMarkets } from "@/lib/media";
import { storageConfigured } from "@/lib/media/storage";
import { alreadyAskedLine, cardMeta, gameWhosIn, lineT, type CardInput } from "@/lib/sports/cards";
import { nightPhotoTarget } from "@/lib/sports/night-photo";
import { gameById, gameGroupsFor, gameMarkets, type TemplateRow } from "@/lib/sports";
import { startWord } from "@/lib/sports/types";
import { scoreLine } from "@/lib/sports/results";
import { liveLine, storedLive } from "@/lib/sports/live-words";
import { SLIDER_REACH, templatesFor, type TemplateKey } from "@/lib/sports/templates";
import type { Sport } from "@/lib/sports/types";
import { clockWithDay } from "@/lib/notify/messages";
import { startLabel } from "@/components/on/game-row";
import { clockOf, dateLabel, FIRST_CALL_CLOSE, firstName, fromThatNight } from "@/lib/ui/copy";
import { hueFor, hueVar } from "@/lib/ui/hue";
import { inkColorVar, inkFieldVar, inkOf } from "@/lib/ui/ink";
import { markRefOf } from "@/lib/ui/mark";
import { outcomeLine } from "@/lib/ui/outcome-words";
import type { TeamFace } from "@/lib/ui/team";
import { viewerClock } from "@/lib/ui/zone";

type Question = { dare: DareRow; template: TemplateRow; set: { groupId: string; facts: SetFacts } };

/**
 * The game page (docs/design.md 3.33, as the fifteenth session drew it and the games-and-the-reveal round built it):
 * one page per game per person, listing every question on the game they are in or were sent, from every set they are
 * on it with, so a game played with two groups is one page. Each card is collapsed to the question and where it
 * stands, and one opens at a time, in place: the question's own screen from under its band down, with that question's
 * sheet the page's one sheet. A link to any question on a game lands here with that question open, and the game's
 * own link with its set's first question open. A card names its people only when the page holds more than one set.
 * Someone not in a link's set, signed in or not, gets that set's page with the question open in it, where they get in.
 * "Add another" offers the rest of the menu until the final; a question already on the page is offered first. Once
 * the game is over, the page is the night (3.37).
 */
export async function GamePage({ id, g, q, add, start }: { id: string; g: string | null; q: string | null; add: string | null; start: boolean }) {
  const clock = await viewerClock();
  const now = new Date(clock.now);
  const found = await gameById(id);
  if (!found) notFound();
  const { game } = found;
  const me = await currentUser();
  const away: TeamFace = { abbr: game.awayAbbr, name: game.awayShort, color: game.awayColor };
  const home: TeamFace = { abbr: game.homeAbbr, name: game.homeShort, color: game.homeColor };
  const header = { id: game.id, name: game.name, away, home, start: startLabel(game.startsAt, clock.zone), sport: game.sport };
  const off = game.status === "postponed" || game.status === "canceled";
  const ahead = game.startsAt.getTime() > now.getTime() && !off;
  // Anyone can start a question until the final (section 5); once it has started, a new one closes five minutes after its first call.
  const askable = !off && !gameIsOver(game);
  const live = !ahead && !off && game.finalSeenAt === null && !game.completed;
  const word = startWord(game.sport);
  // While it is being played a question can still be started on it, closing after its first call (section 5), so nothing says everything closed.
  const closesCaption = ahead ? `Everything closes at ${word}.` : live ? "" : `Everything closed at ${word}.`;
  const liveScore = live ? <LiveScore gameId={game.id} away={away} home={home} initial={storedLive(game, now)} /> : null;
  const linked = g && /^[0-9a-f-]{36}$/i.test(g) ? g : null;
  const asked = q && /^[0-9a-f-]{36}$/i.test(q) ? q : null;

  // The questions a set has opened on this game, with the asker's own unopened ones for the asker alone.
  const questionsOf = async (groupId: string, facts: SetFacts): Promise<Question[]> => (await gameMarkets(game.id, groupId)).filter((r) => r.dare.creatorSignature || r.dare.creatorId === me?.id).map((r) => ({ ...r, set: { groupId, facts } }));
  const factsOf = async (groupId: string): Promise<SetFacts> => {
    const [row] = await db.select({ name: schema.groups.name }).from(schema.groups).where(eq(schema.groups.id, groupId)).limit(1);
    return setFacts(row?.name ?? null, (await membersOfGroups([groupId])).get(groupId) ?? []);
  };

  // Whose page: the viewer's sets on this game; or, for someone not in the set a link or a question names, that set's page.
  // A question the viewer asked and has not sent yet (a send whose signature never came) is theirs to see, so its set is
  // theirs here too; and a named set with nothing sent is no page to be shown from the outside.
  const mySets = me ? await gameGroupsFor(game.id, me) : [];
  const askedRow = asked ? ((await db.select({ groupId: schema.dares.groupId, creatorId: schema.dares.creatorId }).from(schema.dares).where(eq(schema.dares.id, asked)).limit(1))[0] ?? null) : null;
  const namedSet = askedRow?.groupId ?? linked;
  const theirDraft = me !== null && askedRow !== null && askedRow.creatorId === me.id && !mySets.some((s) => s.groupId === askedRow.groupId);
  let outsider = namedSet !== null && !mySets.some((s) => s.groupId === namedSet) && !theirDraft;
  const setsFor = async (asOutsider: boolean): Promise<Array<{ groupId: string; facts: SetFacts }>> =>
    asOutsider && namedSet ? [{ groupId: namedSet, facts: await factsOf(namedSet) }] : [...mySets.map((s) => ({ groupId: s.groupId, facts: s.set })), ...(theirDraft && askedRow ? [{ groupId: askedRow.groupId, facts: await factsOf(askedRow.groupId) }] : [])];
  let sets = await setsFor(outsider);
  const questions: Question[] = [];
  for (const s of sets) questions.push(...(await questionsOf(s.groupId, s.facts)).filter((x) => !outsider || x.dare.creatorSignature));
  if (outsider && me && questions.length === 0) {
    outsider = false;
    sets = await setsFor(false);
    for (const s of sets) questions.push(...(await questionsOf(s.groupId, s.facts)));
  }
  // The menu's order, and within one menu row the most recent set first (3.33).
  const menuOrder = (key: string) => found.templates.find((t) => t.key === key)?.sort ?? 99;
  questions.sort((a, b) => menuOrder(a.template.key) - menuOrder(b.template.key) || b.dare.createdAt.getTime() - a.dare.createdAt.getTime());

  const menu = templatesFor({ sport: game.sport as Sport, home: { short: game.homeShort }, away: { short: game.awayShort }, seasonType: game.seasonType }).filter((m) => ahead || m.key !== "first_drive");
  const menuItems: MenuItem[] = menu.map((m) => ({ key: m.key, name: m.name, kindLabel: m.kindLabel, title: m.title, rows: m.rows }));
  const closes = ahead ? `${game.startsAt.toLocaleDateString("en-US", { timeZone: clock.zone, weekday: "short" })} ${clockOf(game.startsAt, clock.zone)}` : FIRST_CALL_CLOSE;

  if (!me) {
    // Signed out: the set a link or a question names, its questions as cards, the linked one open with the arriving step in it (3.17, 3.33).
    const open = asked && questions.some((x) => x.dare.id === asked) ? asked : (questions[0]?.dare.id ?? null);
    return (
      <>
        <GuestLineFor dareId={open ?? undefined} />
        <Screen>
          <TopBar wordmark info="game-link" />
          <div className="flex flex-col gap-6 py-2" data-game-link="">
            <GameHeader game={header} caption={closesCaption} right={ahead ? undefined : game.finalSeenAt && game.homeScore !== null && game.awayScore !== null ? scoreLine({ home: game.homeScore, away: game.awayScore }, game.homeShort, game.awayShort) : "Started"} />
            {liveScore}
            {questions.length > 0 ? (
              <div className="flex flex-col gap-2" data-game-cards="">
                {questions.map((x) => (
                  <GuestCard key={x.dare.id} question={x} open={x.dare.id === open} gameId={game.id} base={namedSet ? `/on/${game.id}/${namedSet}` : `/on/${game.id}`}>
                    {x.dare.id === open ? <GhostMarketPage id={x.dare.id} clock={clock} embedded /> : null}
                  </GuestCard>
                ))}
              </div>
            ) : (
              <>
                <p className="text-body text-ink-2">Sign in to get in on it.</p>
                <SignInButton label="Sign in" variant="primary" />
              </>
            )}
          </div>
        </Screen>
      </>
    );
  }

  const { chainId, dares } = contracts();
  const signing = { domain: daresDomain(chainId, dares.address), ledgerWallet: me.ledgerWallet };
  const groupLabel = (facts: SetFacts) => facts.name ?? "your friends";
  // A question already on the page from another set, by its menu row: offered first when starting the same one (3.33, "Asking what's already asked").
  const people = await participantsOf([...new Set(questions.flatMap((x) => [x.dare.creatorId]))]);
  const positionsByQuestion = new Map(await Promise.all(questions.map(async (x) => [x.dare.id, await positionsOf(x.dare.id)] as const)));
  const inPeople = await participantsOf([...new Set([...positionsByQuestion.values()].flat().map((p) => pidOf(p)))]);
  const nameIn = (pid: string) => (pid === me.id ? "you" : firstName(inPeople.get(pid)?.displayName ?? people.get(pid)?.displayName ?? "Someone"));
  const existing: Partial<Record<TemplateKey, AlreadyAsked>> = {};
  for (const x of questions) {
    if (!x.dare.creatorSignature || existing[x.template.key as TemplateKey]) continue;
    const others = (positionsByQuestion.get(x.dare.id) ?? []).map((p) => pidOf(p)).filter((pid) => pid !== x.dare.creatorId).sort((a, b) => (a === me.id ? -1 : b === me.id ? 1 : 0)).map(nameIn);
    const asker = x.dare.creatorId === me.id ? "You" : firstName(people.get(x.dare.creatorId)?.displayName ?? "Someone");
    const menuName = menu.find((m) => m.key === x.template.key)?.name ?? x.template.title;
    existing[x.template.key as TemplateKey] = { dareId: x.dare.id, asker: { name: people.get(x.dare.creatorId)?.displayName ?? asker, hue: hueFor(x.dare.creatorId) }, line: alreadyAskedLine(asker, menuName, others) };
  }

  // Starting: from What's on with nothing of theirs on it, or asked to; until the final (section 5).
  if (askable && !outsider && (start || questions.length === 0)) {
    return <StartGame game={header} menu={menuItems} sets={[]} chrome={<TopBar back title="Start a game" info="game-start" />} signing={signing} mode={{ kind: "start" }} closes={closes} existing={existing} />;
  }
  if (questions.length === 0) {
    // Over, or off, with nothing of theirs on it: nothing to show but the game.
    return (
      <Screen>
        <TopBar back />
        <div className="flex flex-col gap-6 py-2">
          <GameHeader game={header} caption={off ? "This one is off." : "This one is over, so it’s too late to ask."} />
        </div>
      </Screen>
    );
  }
  const open = asked && questions.some((x) => x.dare.id === asked) ? asked : null;
  const openQuestion = open ? (questions.find((x) => x.dare.id === open) ?? null) : null;
  // Adding one (3.33): the terms step for that question with the people of the open card's set, or of the page's most recent set.
  const addTo = openQuestion?.set ?? sets[0] ?? null;
  const mineAsked = new Set(questions.filter((x) => x.dare.creatorId === me.id).map((x) => x.template.key));
  if (askable && !outsider && add && addTo && menu.some((m) => m.key === add) && !mineAsked.has(add as TemplateKey)) {
    const units = (await denominationsForGroup(addTo.groupId)).filter((u) => !u.monetary).map((u) => ({ id: u.id, label: u.label, template: u.template }));
    const set = { takenInks: [], groupId: addTo.groupId, label: groupLabel(addTo.facts), caption: "", avatars: [], offerName: false, size: 0, units };
    const key = add as TemplateKey;
    // The one already on the page is offered first, from either set (3.33). A set runs each question once, so asking your own
    // where that set already runs it goes to whoever you send it to, as every question does (the games-and-the-reveal round).
    const taken = questions.some((x) => x.set.groupId === addTo.groupId && x.template.key === key && x.dare.creatorSignature !== null);
    return <StartGame game={header} menu={menuItems.filter((m) => m.key === add)} sets={[set]} chrome={<TopBar back title="Add another" info="game-start" />} signing={signing} mode={{ kind: "add", groupId: taken ? null : addTo.groupId, groupLabel: groupLabel(addTo.facts), key }} closes={closes} existing={existing} />;
  }

  // The cards: each question's meta line by its state (3.33), with the viewer's own value and the group's number where numbers may be shown.
  const many = sets.length > 1;
  const ids = questions.map((x) => x.dare.id);
  const cardData = new Map((await Promise.all(sets.map((s) => marketCards({ viewerId: me.id, groupId: s.groupId, limit: 60 })))).flat().map((c) => [c.dare.id, c]));
  const reach = SLIDER_REACH[game.sport as Sport] ?? 35;
  const askers = await participantsOf(questions.map((x) => x.dare.creatorId));
  const feedFinal = game.finalSeenAt && game.homeScore !== null && game.awayScore !== null ? { home: game.homeScore, away: game.awayScore } : null;
  const liveNow = storedLive(game, now);
  const over = !askable && questions.every((x) => ["resolved", "voided", "expired"].includes(stateOf(x.dare)));
  const cards = questions.map((x) => {
    const { dare, template } = x;
    const state = stateOf(dare);
    const card = cardData.get(dare.id) ?? null;
    const positions = positionsByQuestion.get(dare.id) ?? [];
    const mine = positions.find((p) => p.userId === me.id) ?? null;
    const unit = ((u) => (u && template.key === "margin" && template.shift !== null ? { ...u, margin: { shift: template.shift.toString(), home: game.homeShort, away: game.awayShort } } : u))(unitOf(dare));
    const answers = answersOf(dare)?.map((a) => a.text) ?? null;
    const teams = template.key === "home_wins" ? { away: game.awayShort, home: game.homeShort } : null;
    const resolved = state === "resolved" && dare.resolvedOutcome !== null && dare.resolvedOutcome !== VOID_OUTCOME;
    const outcomeWords = !resolved ? null : answers ? (answers[Number(dare.resolvedOutcome)] ?? "Decided") : unit ? unitPhrase(dare.resolvedOutcome as bigint, unit) : outcomeLine(dare, dare.resolvedOutcome === 1n).replace(/\.$/, "");
    const best = resolved ? positions.reduce<(typeof positions)[number] | null>((m, p) => (p.score !== null && (m === null || (m.score ?? -1) < p.score) ? p : m), null) : null;
    const offBy = best && unit && dare.resolvedOutcome !== null ? (best.value > dare.resolvedOutcome ? best.value - dare.resolvedOutcome : dare.resolvedOutcome - best.value).toString() : null;
    const callers = answers && resolved ? positions.filter((p) => Number(p.value) === Number(dare.resolvedOutcome)) : [];
    const closest = answers ? (callers.length ? { name: callers.some((p) => p.userId === me.id) ? "You" : firstName(inPeople.get(pidOf(callers[0]!))?.displayName ?? "Someone"), off: null } : null) : best ? { name: best.userId === me.id ? "You" : firstName(inPeople.get(pidOf(best))?.displayName ?? "Someone"), off: offBy } : null;
    const votingEnds = state === "locked" && game.finalSeenAt ? clockWithDay(new Date(game.finalSeenAt.getTime() + 24 * 3_600_000), now, clock.zone).replace(/^at /, "") : null;
    const input: CardInput = {
      key: template.key as TemplateKey,
      state,
      viewerIn: mine !== null,
      mine: mine?.value ?? null,
      inCount: positions.length,
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
      closes: dare.closesAfterFirst ? (dare.resolvesBy ? `Closes at ${clockOf(dare.resolvesBy, clock.zone)}` : FIRST_CALL_CLOSE) : `Closes at ${word}`,
      votingOpen: state === "locked" ? votingOpen(dare, { finalSeenAt: game.finalSeenAt, expectedEndAt: game.expectedEndAt }, now) : undefined,
      live: liveNow && !liveNow.final ? `${liveLine(liveNow, game.awayShort, game.homeShort)}${liveNow.where ? ` · ${liveNow.where.charAt(0).toLowerCase()}${liveNow.where.slice(1)}` : ""}` : null,
      gameOver: game.expectedEndAt.getTime() <= now.getTime() && game.finalSeenAt === null,
    };
    const meta = cardMeta(input);
    // The line under a slider card (3.33): the two 20px stamps, a 6px track on the question's field with a tick at the middle, and once you're in a dot at your value and a tick at the group's number.
    const slider = template.key === "home_wins" || template.key === "margin";
    const show = numbersVisible(dare, mine !== null);
    const myT = mine && slider ? lineT({ key: template.key as TemplateKey, value: mine.value, shift: template.shift, reach }) : null;
    const groupValue = slider && show && mine && positions.length >= 3 ? (template.key === "home_wins" ? ((n) => (n === null ? null : BigInt(percentOf(n)) * 100n))(groupsNumberBps(positions.map((p) => ({ id: pidOf(p), stake: p.stake, valueBps: p.value })))) : weightedMedian(positions.map((p) => ({ stake: p.stake, value: p.value })))) : null;
    const groupT = groupValue === null ? null : lineT({ key: template.key as TemplateKey, value: groupValue, shift: template.shift, reach });
    // Named only when the page holds more than one set (3.33), as the asker line names one (3.38).
    const whose = many ? askerLine({ id: dare.creatorId, displayName: askers.get(dare.creatorId)?.displayName ?? "Someone" }, x.set.facts, me.id) : null;
    return { ...x, meta, slider, myT, groupT, ink: inkOf(dare), state, mine, whose };
  });
  const firstOpenNotIn = cards.find((c) => c.state === "open" && !c.mine)?.dare.id ?? null;
  // The base address the cards toggle on: the page's own, or the link's set's.
  const base = outsider && namedSet ? `/on/${game.id}/${namedSet}` : `/on/${game.id}`;

  const cardsList = (
    <div className="flex flex-col gap-2" data-game-cards="">
      {cards.map((c) => {
        const isOpen = c.dare.id === open;
        const dot = c.dare.id === firstOpenNotIn && askable && !isOpen;
        return (
          <section key={c.dare.id} className={`flex flex-col gap-4 rounded-card border bg-surface px-3 py-3 ${isOpen ? "border-line-strong" : "border-line"}`} data-game-card={c.template.key} data-card-state={c.state} data-card-open={isOpen ? "" : undefined}>
            {/* The card's head: a tap opens it in place and closes whichever was open; a tap on an open card's head closes it (3.33). */}
            <Link prefetch={false} replace scroll={false} href={isOpen ? base : `${base}?q=${c.dare.id}`} data-press="row" aria-expanded={isOpen} data-open-card-head={c.dare.id} className="press-row relative flex flex-col gap-2">
              <LinkPending />
              <span className="grid grid-cols-[40px_minmax(0,1fr)_18px] items-center gap-3">
                {markRefOf(c.dare) ? <MarkRefStamp mark={markRefOf(c.dare)} size={40} ink={c.ink} /> : <span />}
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-body-strong text-ink">{c.dare.title}</span>
                  {c.whose ? <span className="text-caption text-ink-2">{c.whose}</span> : null}
                  <span className="flex items-center gap-2 text-caption text-ink-3">
                    {dot ? <LiveDot /> : null}
                    <StateMark state={c.meta.mark} hue={c.meta.mark === "in" ? hueFor(me.id) : undefined} ink={c.meta.mark === "resolved" ? inkColorVar(c.ink) : undefined} />
                    {/* Wraps rather than cutting the count off a long close ("Closes 5 minutes after the first call · nobody's in yet", on the simulator). */}
                    <span className="min-w-0">{c.meta.text}</span>
                  </span>
                </span>
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-ink-3 ${isOpen ? "rotate-90" : ""}`}>
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </span>
              {c.slider && !isOpen ? (
                <span aria-hidden="true" className="flex h-5 items-center gap-2">
                  <TeamStamp team={away} size={20} />
                  <span className="relative h-[6px] min-w-0 flex-1 rounded-[3px]" style={{ background: inkFieldVar(c.ink) }}>
                    <span className="absolute top-1/2 left-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-line-strong" />
                    {c.groupT !== null ? <span className="absolute top-1/2 h-3 w-[2px] -translate-x-1/2 -translate-y-1/2 bg-ink" style={{ left: `${c.groupT * 100}%` }} /> : null}
                    {c.myT !== null ? <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-pill" style={{ left: `${c.myT * 100}%`, background: hueVar(hueFor(me.id)) }} /> : null}
                  </span>
                  <TeamStamp team={home} size={20} />
                </span>
              ) : null}
            </Link>
            {/* The open card is the question's own screen from under its band down, with its sheet the page's one sheet (3.33). */}
            {isOpen ? <MarketScreen id={c.dare.id} search={{}} embedded /> : null}
          </section>
        );
      })}
      {open ? <OpenCardScroll id={open} /> : null}
    </div>
  );

  if (over) {
    // The night (3.37, frame D): the final score as the title, the photos from every question in one frame, the settled cards, who's got who across the night, and the rest of that night.
    const frames = await frameOnMarkets(ids);
    const clips = ids.flatMap((d) => (frames.get(d) ?? []).filter((m) => m.role === "evidence"));
    const memories = ids.flatMap((d) => (frames.get(d) ?? []).filter((m) => m.role === "memory")).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const items = [...clips, ...memories].map((m) => ({ id: m.id, author: { name: m.author.displayName, hue: hueFor(m.author.id) }, removable: m.role === "memory" && m.author.id === me.id }));
    const edges = ids.length ? await db.select().from(schema.obligations).where(and(eq(schema.obligations.origin, "dare"), inArray(schema.obligations.originId, ids))) : [];
    const denoms = await denominationsByIds(Array.from(new Set(questions.map((x) => x.dare.denomId))));
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
    const participants = Array.from(new Set([...positionsByQuestion.values()].flat().sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime()).map((p) => pidOf(p))));
    // A photo from the night goes on the earliest question this person is in (`nightPhotoTarget`), since the server admits it only from someone in that question; the strip reads every question either way. Nobody in none of them gets a plus.
    const photoTarget = nightPhotoTarget(questions, positionsByQuestion, me.id);
    const canAddPhoto = photoTarget !== null && storageConfigured();
    const endedAt = questions.map((x) => x.dare.resolvedAt ?? x.dare.lockedAt ?? x.dare.createdAt).sort((a, b) => b.getTime() - a.getTime())[0] ?? game.startsAt;
    const first = [...questions].sort((a, b) => a.dare.createdAt.getTime() - b.dare.createdAt.getTime())[0];
    const rest = await restOfThatNight({ dareId: first?.dare.id ?? ids[0] ?? "", excludeIds: ids, groupIds: sets.map((s) => s.groupId), people: participants, viewerId: me.id, closedAt: game.startsAt, endedAt }).catch(() => []);
    const night = fromThatNight(endedAt, now, clock.zone);
    const whoAsked = !many && first ? `${askerLine({ id: first.dare.creatorId, displayName: askers.get(first.dare.creatorId)?.displayName ?? "Someone" }, first.set.facts, me.id)}.` : "";
    const allPeople = await participantsOf(participants);
    return (
      <PhotoAdding dareId={photoTarget?.dare.id ?? ids[0] ?? ""} night={night} canAdd={canAddPhoto} capture={false} viewer={{ name: me.displayName, hue: hueFor(me.id) }}>
        <Screen>
          <TopBar back info="game-night" />
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
              {whoAsked ? <p className="text-caption text-ink-2">{whoAsked}</p> : null}
            </section>
            {items.length > 0 ? <MediaFrame items={items} height={260} inset add={canAddPhoto ? { night } : null} stickers={storageConfigured()} /> : canAddPhoto ? <EmptySlot /> : null}
            {/* A photo that did not go up is said under the photos (3.8, Principle 9), with the failed ones sent again from Try again. */}
            {canAddPhoto ? <PhotoProblem /> : null}
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
                      <WhoHasWho transfers={transfers} people={allPeople} participants={participants} denomination={denomination} viewerId={me.id} />
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

  // With one set, the header's caption names it once and its who's-in row shares the game's link for it (3.33, 3.42); with more, each open card's row shares its own.
  const only = !many ? (sets[0] ?? null) : null;
  const firstOfOnly = only ? [...questions].filter((x) => x.dare.creatorSignature).sort((a, b) => a.dare.createdAt.getTime() - b.dare.createdAt.getTime())[0] : undefined;
  const whoAsked = only && firstOfOnly ? `${askerLine({ id: firstOfOnly.dare.creatorId, displayName: askers.get(firstOfOnly.dare.creatorId)?.displayName ?? "Someone" }, only.facts, me.id)}. ` : "";
  const inIds = only ? Array.from(new Set(questions.flatMap((x) => (positionsByQuestion.get(x.dare.id) ?? []).map((p) => pidOf(p))))) : [];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://dareful.app";
  const whosIn = gameWhosIn({ inIds, viewerId: me.id, startedBy: firstOfOnly?.dare.creatorId ?? null });
  const toAdd = askable && !outsider ? menu.filter((m) => !mineAsked.has(m.key)) : [];
  const more = (
    <SetupSheet>
      {questions.map(({ dare, template }) => (
        <div key={dare.id} className="flex flex-col gap-1">
          <p className="text-label text-ink-3">{template.title}</p>
          <p className="text-body-sm text-ink-2">{dare.termsText}</p>
        </div>
      ))}
    </SetupSheet>
  );

  return (
    <Screen>
      <TopBar back right={more} info="game" />
      <div className="flex flex-col gap-7 py-2">
        <GameHeader game={header} caption={`${whoAsked}${closesCaption}`.trim()} right={ahead ? undefined : feedFinal ? scoreLine(feedFinal, game.homeShort, game.awayShort) : "Started"} />
        {/* With a card open the score stands in it, above who said what (3.24); with none, under the header. */}
        {open ? null : liveScore}
        {only && askable && !outsider ? (
          // The who's-in row with the game as the unit (3.42): everyone in on any of its questions, and the one place the game is shared from, under the header so sharing a new game is on screen without scrolling (the second-pass round). The link is the game page's for this set (3.33); a code is one question's, so there is none here.
          <WhosInRow people={inIds.map((pid) => ({ name: inPeople.get(pid)?.displayName ?? "Someone", hue: hueFor(pid), ghost: inPeople.get(pid)?.ghost === true }))} holdouts={[]} count={whosIn.count} share={{ url: `${appUrl}/on/${game.id}/${only.groupId}`, title: game.name }} code={null} chalk={whosIn.chalk} />
        ) : null}
        <section className="flex flex-col gap-[10px]">
          <SectionLabel>Questions</SectionLabel>
          {cardsList}
        </section>
        {toAdd.length > 0 ? (
          <section className="flex flex-col gap-[10px]" data-add-another="">
            <SectionLabel>Add another</SectionLabel>
            <div className="flex flex-col gap-2">
              {toAdd.map((m) => (
                <Link key={m.key} prefetch={false} href={`/on/${game.id}?add=${m.key}${open ? `&q=${open}` : ""}`} className="relative grid h-16 grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-card border-[1.5px] border-dashed border-line-strong px-3">
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
      </div>
    </Screen>
  );
}

/** A card on a link's game page for someone signed out (3.17, 3.33): its head, and the question's own screen in it once open, where they get in. */
function GuestCard({ question, open, base, children }: { question: Question; open: boolean; gameId: string; base: string; children: React.ReactNode }) {
  const d = question.dare;
  return (
    <section className={`flex flex-col gap-4 rounded-card border bg-surface px-3 py-3 ${open ? "border-line-strong" : "border-line"}`} data-game-card={question.template.key} data-card-open={open ? "" : undefined}>
      <Link prefetch={false} replace scroll={false} href={open ? base : `${base}?q=${d.id}`} data-press="row" aria-expanded={open} data-open-card-head={d.id} className="press-row relative grid grid-cols-[40px_minmax(0,1fr)_18px] items-center gap-3">
        <LinkPending />
        {markRefOf(d) ? <MarkRefStamp mark={markRefOf(d)} size={40} ink={inkOf(d)} /> : <span />}
        <span className="text-body-strong text-ink">{d.title}</span>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-ink-3 ${open ? "rotate-90" : ""}`}>
          <path d="M9 5l7 7-7 7" />
        </svg>
      </Link>
      {children}
      {open ? <OpenCardScroll id={d.id} /> : null}
    </section>
  );
}
