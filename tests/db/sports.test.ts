/**
 * What's on against the real database and the real chain (docs/decisions.md, public markets). The schedule read
 * from a recorded scoreboard (tests/fixtures/sports, the ids prefixed so the rows are this test's own) writes
 * games and the questions for each; a market drafted from one copies the template and closes at the start; a
 * game in progress proposes nothing, a final proposes the score's answer on every locked question it decides
 * and follows a correction; the backstop settles on the chain when both sources agree, voids when they differ,
 * waits without a second source and settles on the scoreboard alone three days on; the final score's ending is
 * counted clean, its void against nobody, and both send the notice after. It costs a little testnet gas per run.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { ensureUsd } from "@/lib/ledger/denominations";
import { createGroup } from "@/lib/ledger/groups";
import * as markets from "@/lib/ledger/markets";
import { arbitrateMarket, cleanResolution, tick, toArbitrate } from "@/lib/ledger/settle";
import { notifyBackstopResult } from "@/lib/notify";
import { DRIVE_RULING, FEED_RULING, POLL_EVERY_MS, feedBackstop, gameMarkets, gameUseCounts, gamesToPoll, pollFinals, pollSummaries, startGame, syncSchedule, templateById, useCounts, whatsOn } from "@/lib/sports";
import { parseScoreboard, parseSummary } from "@/lib/sports/espn";
import { AGREE_AFTER_MS, ALONE_AFTER_MS, CONFIRM_AFTER_MS } from "@/lib/sports/results";
import { CONSENT, SCALES } from "@/lib/sports/templates";
import { DRIVE_ANSWERS, type CheckSource, type FeedGame, type FinalScore, type PlaySource, type ScheduleSource, type Sport } from "@/lib/sports/types";
import { cleanup, tempSigner, testPlays, testSchedule, track, type Signer } from "./fixture";

const H = 3_600_000;
const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`../fixtures/sports/${name}.json`, import.meta.url), "utf8"));
/** The recorded scoreboard, its ids prefixed so these rows are this test's own, and its day moved to when the test wants it. */
const RUN = Math.random().toString(36).slice(2, 8);
function recorded(name: string, sport: Sport, at?: (g: FeedGame) => Date): FeedGame[] {
  return parseScoreboard(sport, fixture(name)).map((g) => ({ ...g, sourceId: `test:${RUN}:${g.sourceId}`, startsAt: at ? at(g) : g.startsAt }));
}
const listing = (games: FeedGame[]): ScheduleSource => testSchedule(games);
const checkOf = (final: FinalScore | null): CheckSource => ({ name: "balldontlie", finalOf: async () => final });
/** The play-by-play as a recorded summary reports it (the Packers game), or nothing yet. */
const playsOf = (name: string | null): PlaySource => testPlays(async () => (name ? parseSummary(fixture(name)).firstDrive : null));
const lockInMirror = (id: string, set: Partial<typeof schema.dares.$inferInsert> = {}) => db.update(schema.dares).set({ lockedAt: new Date(), onchainId: Buffer.from(id.replace(/-/g, "").padEnd(64, "0"), "hex"), ...set }).where(eq(schema.dares.id, id));
const code = async (fn: () => Promise<unknown>) => fn().then(() => null, (e: unknown) => (e instanceof markets.MarketError ? e.code : `other: ${e instanceof Error ? e.message : e}`));
const said = async (fn: () => Promise<unknown>) => fn().then(() => null, (e: unknown) => (e instanceof Error ? e.message : String(e)));

let asker: Signer, friend: Signer, groupId: string, denomId: string;
before(async () => {
  track.gamePrefix(`test:${RUN}:`);
  [asker, friend] = await Promise.all([tempSigner("Priya Raman"), tempSigner("Dev")]);
  const g = await createGroup({ name: "what's on check (temporary)", createdBy: asker.user.id });
  track.group(g.id);
  groupId = g.id;
  await db.insert(schema.groupMembers).values({ groupId: g.id, userId: friend.user.id });
  denomId = (await ensureUsd(g.id, asker.user.id)).id;
});
after(cleanup);

const enter = async (d: markets.DareRow, who: Signer, stake: bigint, value: bigint) => markets.enterMarket({ dareId: d.id, userId: who.user.id, stake, value, signature: await who.ledger.signTypedData(markets.enterTypedData(d, stake, value)) });
const open = async (d: markets.DareRow) => markets.openMarket(d.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(d)));
async function templatesOf(sourceId: string) {
  const [game] = await db.select().from(schema.sportsGames).where(and(eq(schema.sportsGames.source, "espn"), eq(schema.sportsGames.sourceId, sourceId)));
  assert.ok(game, "the game row");
  const rows = await db.select().from(schema.publicQuestions).where(eq(schema.publicQuestions.gameId, game.id));
  return { game, byKey: new Map(rows.map((t) => [t.key, t])) };
}

test("the schedule read writes games and their questions; a market drafted from one copies the template, closes at the start and has the final score as its tiebreaker", async () => {
  const soon = new Date(Date.now() + 2 * H);
  const two = recorded("espn-nfl-scheduled", "nfl", () => soon).slice(0, 2);
  const r = await syncSchedule("nfl", new Date(), listing(two));
  assert.equal(r.games, 2 * 5, "two games, read once a day for five days: the same rows each time");
  const { game, byKey } = await templatesOf(two[0]!.sourceId);
  assert.deepEqual([game.sport, game.status, game.completed, game.timeValid, game.name], ["nfl", "scheduled", false, true, `${two[0]!.away.short} at ${two[0]!.home.short}`]);
  assert.deepEqual([...byKey.keys()].sort(), ["first_drive", "home_wins", "margin", "total"], "four questions: the first drive by coverage, since the recording is the NFL regular season");
  assert.deepEqual([game.homeColor !== null, game.awayColor !== null, game.seasonType], [true, true, 2], "each team's colour and the season, off the scoreboard");
  const wins = byKey.get("home_wins")!;
  const d = await markets.draftFromTemplate({ templateId: wins.id, creatorId: asker.user.id, groupId, denomId });
  assert.deepEqual([d.kind, d.templateId, d.resolvesBy?.getTime(), d.stalemate, d.markKind, d.markValue, d.outcomeWords?.length], ["binary", wins.id, soon.getTime(), "arbitrate", "emoji", "🏈", 4], "the kind, the close at the start, the tiebreaker fixed, the sport's mark, the words");
  assert.equal(d.title, wins.title);
  assert.ok(d.termsText.includes(CONSENT), "the consent, in the terms everyone signs");
  const drive = await markets.draftFromTemplate({ templateId: byKey.get("first_drive")!.id, creatorId: asker.user.id, groupId, denomId });
  assert.deepEqual([drive.kind, drive.outcomeLabels], ["categorical", [...DRIVE_ANSWERS]], "the first drive: a pick-one question with the five answers");
  const margin = await markets.draftFromTemplate({ templateId: byKey.get("margin")!.id, creatorId: asker.user.id, groupId, denomId });
  assert.deepEqual([margin.kind, margin.range, margin.rangeSource, margin.outcomeLabels, margin.typical], ["numeric", SCALES.nfl.margin, "template", ["point", "points"], null], "the template's scale, as the template's");
  const total = await markets.draftFromTemplate({ templateId: byKey.get("total")!.id, creatorId: asker.user.id, groupId, denomId });
  assert.deepEqual([total.range, total.typical], [SCALES.nfl.total, SCALES.nfl.totalTypical]);
  // A game that has started is askable until its final (section 5): the question waits for its first call to set its
  // close, and the first drive is not asked, being over by then. Once the final is in it is too late, in the game's own words.
  const started = recorded("espn-nfl-scheduled", "nfl", () => new Date(Date.now() - H)).slice(2, 3);
  await syncSchedule("nfl", new Date(), listing(started));
  const late = await templatesOf(started[0]!.sourceId);
  const during = await markets.draftFromTemplate({ templateId: late.byKey.get("home_wins")!.id, creatorId: asker.user.id, groupId, denomId });
  assert.deepEqual([during.resolvesBy, during.closesAfterFirst], [null, true], "asked while the game is on: no close until the first call");
  assert.equal(await said(() => markets.draftFromTemplate({ templateId: late.byKey.get("first_drive")!.id, creatorId: asker.user.id, groupId, denomId })), "The first drive is over by now.");
  const ended = parseScoreboard("nfl", fixture("espn-nfl-final")).find((x) => x.completed)!;
  await db.update(schema.sportsGames).set({ finalSeenAt: new Date(), homeScore: ended.homeScore, awayScore: ended.awayScore, completed: true, status: "final" }).where(eq(schema.sportsGames.id, late.game.id));
  // The refusal is the game's, in its own words: the draft's own past-close refusal must not be what answers here.
  assert.equal(await said(() => markets.draftFromTemplate({ templateId: late.byKey.get("total")!.id, creatorId: asker.user.id, groupId, denomId })), "That game is over, so it's too late to ask.", "too late, and said so");
  await db.update(schema.sportsGames).set({ timeValid: false }).where(eq(schema.sportsGames.id, game.id));
  assert.equal(await code(() => markets.draftFromTemplate({ templateId: wins.id, creatorId: friend.user.id, groupId, denomId })), "bad_input", "no confirmed start time");
  await db.update(schema.sportsGames).set({ timeValid: true }).where(eq(schema.sportsGames.id, game.id));
  // The use count: a set counts once a second person is in, and never says who.
  await open(d);
  await enter(d, asker, 500n, 8000n);
  assert.equal((await useCounts([wins.id])).get(wins.id), 0, "one person in is not a group arguing yet");
  await enter(d, friend, 500n, 3000n);
  assert.equal((await useCounts([wins.id])).get(wins.id), 1);
  assert.equal((await gameUseCounts([game.id])).get(game.id), 1, "and once per game, however many questions the set runs");
  assert.equal((await templateById(wins.id))?.game.id, game.id);
  // Starting a game (3.33): one market per chosen question, all with the same people, all closing at kickoff, in the menu's order; a question already running is refused.
  const begun = await startGame({ gameId: game.id, keys: ["margin", "total"], creatorId: friend.user.id, groupId, denomId, zone: "America/New_York" });
  assert.deepEqual(begun.map((x) => [x.kind, x.resolvesBy?.getTime(), x.stalemate, x.creatorId]), [["numeric", soon.getTime(), "arbitrate", friend.user.id], ["numeric", soon.getTime(), "arbitrate", friend.user.id]]);
  assert.equal(await code(() => startGame({ gameId: game.id, keys: ["home_wins"], creatorId: friend.user.id, groupId, denomId, zone: null })), "wrong_state", "who wins is already running with these people");
  const page = await gameMarkets(game.id, groupId);
  assert.deepEqual(page.map((p) => p.template.key), ["home_wins", "margin", "total", "first_drive"], "the group's questions on the game, in the menu's order, drafts included");
  // The tab (3.32): the game listed under its day with the count below the floor kept to itself, and this asker's own use named.
  const on = await whatsOn({ id: asker.user.id, displayName: asker.user.displayName }, new Date(), "America/New_York");
  const listed = on.days.flatMap((day) => day.games).find((x) => x.game.id === game.id);
  assert.ok(listed, "listed under its day");
  assert.deepEqual([listed!.asked, listed!.yours[0]?.groupId, on.mostAsked.some((x) => x.game.id === game.id)], [null, groupId, false], "one group is below the floor of ten, so no count and no Most asked; the asker's own set is named on the row");
});

test("a game in progress proposes nothing; a final puts the score's answer on every locked question it decides, follows a correction, and stands once read again", async () => {
  // A market on a game the recording caught in progress: asked while the game was ahead, then the game's start and
  // expected end move behind us (as time would), so the tick reads it.
  const live = recorded("espn-mlb-today", "mlb", () => new Date(Date.now() + 2 * H)).filter((g) => g.status === "in_progress").slice(0, 1);
  assert.equal(live.length, 1, "the recording has a game in progress");
  await syncSchedule("mlb", new Date(), listing(live));
  const { game, byKey } = await templatesOf(live[0]!.sourceId);
  const ids: string[] = [];
  for (const key of ["home_wins", "margin", "total"] as const) {
    const d = await markets.draftFromTemplate({ templateId: byKey.get(key)!.id, creatorId: asker.user.id, groupId, denomId });
    await open(d);
    await enter(d, asker, 500n, key === "home_wins" ? 7000n : key === "margin" ? 6n : 9n);
    await enter(d, friend, 500n, key === "home_wins" ? 2000n : key === "margin" ? 2n : 7n);
    await lockInMirror(d.id, { resolvesBy: new Date(Date.now() - 4 * H) });
    ids.push(d.id);
  }
  await db.update(schema.sportsGames).set({ startsAt: new Date(Date.now() - 4 * H), expectedEndAt: new Date(Date.now() - H), polledAt: null }).where(eq(schema.sportsGames.id, game.id));
  live[0]!.startsAt = new Date(Date.now() - 4 * H);
  const running = await pollFinals(new Date(), { source: listing(live), onlyIds: ids });
  assert.deepEqual([running.polled.length, running.proposed], [1, []], "read, and nothing proposed: the game is in progress whatever the scores say");
  assert.equal((await markets.marketById(ids[0]!))?.feedOutcome, null);
  // The final: the same game, complete. The recorded final of a different game stands in with this game's id, since one
  // recording cannot hold one game in both states; its scores are the recording's own.
  const finalGame = recorded("espn-mlb-final", "mlb", () => new Date(Date.now() - 4 * H))[0]!;
  const final = { ...finalGame, sourceId: live[0]!.sourceId, home: live[0]!.home, away: live[0]!.away };
  const t1 = new Date(Date.now() + 11 * 60_000);
  await db.update(schema.sportsGames).set({ polledAt: null }).where(eq(schema.sportsGames.id, game.id));
  const first = await pollFinals(t1, { source: listing([final]), onlyIds: ids });
  assert.equal(first.proposed.length, 3, "the score's answer on every locked question it decides");
  const g1 = (await db.select().from(schema.sportsGames).where(eq(schema.sportsGames.id, game.id)))[0]!;
  assert.deepEqual([g1.completed, g1.homeScore, g1.awayScore, g1.finalSeenAt?.getTime(), g1.finalConfirmedAt], [true, final.homeScore, final.awayScore, t1.getTime(), null], "the final, its clock started, not yet read again");
  const won = (await markets.marketById(ids[0]!))!;
  assert.equal(won.feedOutcome, final.homeScore! > final.awayScore! ? 1n : 0n, "who wins: the home side's win is yes");
  assert.equal((await markets.marketById(ids[1]!))!.feedOutcome, BigInt(final.homeScore! - final.awayScore!) + (byKey.get("margin")!.shift ?? 0n), "the margin, signed and shifted");
  assert.equal((await markets.marketById(ids[2]!))!.feedOutcome, BigInt(final.homeScore! + final.awayScore!), "the total");
  // A correction: the proposal follows the feed until the quorum is reached, and the clock restarts.
  const corrected = { ...final, homeScore: final.homeScore! + 3 };
  const t2 = new Date(t1.getTime() + CONFIRM_AFTER_MS + 60_000);
  const second = await pollFinals(t2, { source: listing([corrected]), onlyIds: ids });
  assert.equal(second.proposed.length, 2, "the total and the margin move with the score; who wins did not change");
  const g2 = (await db.select().from(schema.sportsGames).where(eq(schema.sportsGames.id, game.id)))[0]!;
  assert.deepEqual([g2.homeScore, g2.finalSeenAt?.getTime(), g2.finalConfirmedAt], [corrected.homeScore, t2.getTime(), null], "a changed final restarts the clock");
  assert.equal((await markets.marketById(ids[2]!))!.feedOutcome, BigInt(corrected.homeScore! + corrected.awayScore!));
  // Read again, unchanged: confirmed, and polling stops.
  const t3 = new Date(t2.getTime() + CONFIRM_AFTER_MS + 60_000);
  await pollFinals(t3, { source: listing([corrected]), onlyIds: ids });
  const g3 = (await db.select().from(schema.sportsGames).where(eq(schema.sportsGames.id, game.id)))[0]!;
  assert.equal(g3.finalConfirmedAt?.getTime(), t3.getTime(), "the one confirmation re-read");
  const t4 = new Date(t3.getTime() + CONFIRM_AFTER_MS + 60_000);
  assert.deepEqual((await pollFinals(t4, { source: listing([corrected]), onlyIds: ids })).polled, [], "then it is not read again");
  // The warning before the final score acts: once, nineteen hours after the final, and never again.
  await db.update(schema.sportsGames).set({ finalSeenAt: new Date(Date.now() - 19 * H), finalConfirmedAt: new Date(Date.now() - 18 * H) }).where(eq(schema.sportsGames.id, game.id));
  const warned: string[] = [];
  // The second source is asked once at warning time, so the warning can say which ending is coming: both agree, so the final score acts a day on.
  const w1 = await tick(new Date(), async () => undefined, { onlyIds: ids, notifyWarning: async (id, flavour) => void warned.push(`${flavour}:${id}`), check: checkOf({ home: corrected.homeScore!, away: corrected.awayScore! }) });
  assert.deepEqual(w1.warned.map((w) => w.flavour), ["score", "score", "score"], "the final score's warning, on each question the score decides");
  assert.deepEqual(w1.arbitrated, [], "the tiebreaker everyone agreed to is the final score, so the model is never asked");
  const gw = (await db.select().from(schema.sportsGames).where(eq(schema.sportsGames.id, game.id)))[0]!;
  assert.deepEqual([gw.checkHomeScore, gw.checkedAt !== null], [corrected.homeScore, true], "the second source's answer kept on the row for the backstop");
  const w2 = await tick(new Date(), async () => undefined, { onlyIds: ids, notifyWarning: async (id, flavour) => void warned.push(`${flavour}:${id}`), check: checkOf({ home: corrected.homeScore!, away: corrected.awayScore! }) });
  assert.deepEqual([w2.warned, warned.length], [[], 3], "never a second");
});

test("the backstop on the chain: both sources agreeing settles a day on and counts clean, two different finals void with no toll, and without a second source it waits, then settles on the scoreboard alone three days on", async () => {
  // The close is signed into the chain's copy at lock, and `arbitrate` needs it behind the block: a game starting
  // in under a minute, locked at once, then the minute waited out.
  const soon = new Date(Date.now() + 45_000);
  const one = recorded("espn-nfl-scheduled", "nfl", () => soon).slice(3, 4);
  await syncSchedule("nfl", new Date(), listing(one));
  const { game, byKey } = await templatesOf(one[0]!.sourceId);
  const made: Record<string, markets.DareRow> = {};
  for (const key of ["home_wins", "margin", "total", "first_drive"] as const) {
    const d = await markets.draftFromTemplate({ templateId: byKey.get(key)!.id, creatorId: asker.user.id, groupId, denomId });
    await open(d);
    await enter(d, asker, 500n, key === "home_wins" ? 8000n : key === "margin" ? 21n : key === "total" ? 44n : 3n);
    await enter(d, friend, 500n, key === "home_wins" ? 3000n : key === "margin" ? 10n : key === "total" ? 38n : 0n);
    made[key] = d;
  }
  // Locked on the real chain, then the game is over: the recorded final, seen a day and a bit ago and read again since.
  for (const d of Object.values(made)) await markets.lockMarket(d.id, asker.user.id);
  while (Date.now() < soon.getTime() + 15_000) await new Promise((r) => setTimeout(r, 1000));
  await db.update(schema.sportsGames).set({ startsAt: new Date(Date.now() - 30 * H), expectedEndAt: new Date(Date.now() - 27 * H) }).where(eq(schema.sportsGames.id, game.id));
  // A question the score decides never gets the model, even asked by hand by someone in it.
  assert.deepEqual(await toArbitrate(new Date(Date.now() + 72 * H), inArray(schema.dares.id, Object.values(made).map((d) => d.id)), 3), [], "the final score's questions never take the tiebreaker's places, however long they wait");
  assert.equal(await code(() => arbitrateMarket(made.total!.id, asker.user.id)), "wrong_state", "the final score is the tiebreaker everyone agreed to");
  const final = { ...recorded("espn-nfl-final", "nfl")[0]!, sourceId: one[0]!.sourceId, home: one[0]!.home, away: one[0]!.away };
  const seen = new Date(Date.now() - AGREE_AFTER_MS - H);
  await db.update(schema.sportsGames).set({ polledAt: null }).where(eq(schema.sportsGames.id, game.id));
  await pollFinals(seen, { source: listing([final]), onlyIds: Object.values(made).map((d) => d.id) });
  await db.update(schema.sportsGames).set({ finalSeenAt: seen, finalConfirmedAt: new Date(seen.getTime() + CONFIRM_AFTER_MS) }).where(eq(schema.sportsGames.id, game.id));
  const score: FinalScore = { home: final.homeScore!, away: final.awayScore! };
  const ids = (k: string) => [made[k]!.id];

  // 1. Both sources report the same final: settled, as `feed`, counted clean, with the notice after.
  const agree = await feedBackstop(new Date(), { check: checkOf(score), onlyIds: ids("home_wins") });
  assert.deepEqual([agree.settled, agree.voided, agree.failed], [ids("home_wins"), [], []], "settled on the chain");
  const won = (await markets.marketById(made.home_wins!.id))!;
  assert.deepEqual([won.resolvedBy, won.resolvedOutcome, markets.stateOf(won)], ["feed", score.home > score.away ? 1n : 0n, "resolved"]);
  assert.ok(won.rulingText?.startsWith(FEED_RULING), "the ruling the chain carries, word for word");
  const positions = await markets.positionsOf(won.id);
  assert.ok(positions.every((p) => p.score !== null && p.net !== null), "scored and settled like any resolution");
  assert.deepEqual(await cleanResolution(asker.user.id), { ended: 1, clean: 1 }, "counted clean");
  await notifyBackstopResult(won.id);
  const told = await db.select({ userId: schema.notificationLog.userId, kind: schema.notificationLog.kind }).from(schema.notificationLog).where(and(eq(schema.notificationLog.dareId, won.id), eq(schema.notificationLog.kind, "backstop_result")));
  assert.deepEqual(told.map((t) => t.userId).sort(), [asker.user.id, friend.user.id].sort(), "everyone in it hears, once");
  await notifyBackstopResult(won.id);
  assert.equal((await db.select().from(schema.notificationLog).where(and(eq(schema.notificationLog.dareId, won.id), eq(schema.notificationLog.kind, "backstop_result")))).length, 2, "and only once");

  // 2. Two different finals: void, with the ruling saying why, and no toll against the asker.
  await db.update(schema.sportsGames).set({ checkHomeScore: null, checkAwayScore: null, checkedAt: null }).where(eq(schema.sportsGames.id, game.id));
  const differ = await feedBackstop(new Date(), { check: checkOf({ home: score.home, away: score.away + 3 }), onlyIds: ids("margin") });
  assert.deepEqual([differ.settled, differ.voided, differ.failed], [[], ids("margin"), []], "voided on the chain");
  const voided = (await markets.marketById(made.margin!.id))!;
  assert.deepEqual([voided.resolvedBy, voided.resolvedOutcome, markets.stateOf(voided)], ["feed", markets.VOID_OUTCOME, "voided"]);
  assert.ok(voided.rulingText?.includes("different finals"));
  assert.deepEqual(await cleanResolution(asker.user.id), { ended: 1, clean: 1 }, "a conflict counts against nobody: in neither number");

  // 3. No second source: it waits at a day, and settles on the scoreboard alone three days on, its final unchanged.
  await db.update(schema.sportsGames).set({ checkHomeScore: null, checkAwayScore: null, checkedAt: null }).where(eq(schema.sportsGames.id, game.id));
  const waits = await feedBackstop(new Date(), { check: checkOf(null), onlyIds: ids("total") });
  assert.deepEqual([waits.settled, waits.voided, waits.failed], [[], [], []], "hockey, or a second source that is down or late: nothing yet");
  assert.equal(markets.stateOf((await markets.marketById(made.total!.id))!), "locked");
  const later = new Date(seen.getTime() + ALONE_AFTER_MS + 60_000);
  const alone = await feedBackstop(later, { check: checkOf(null), onlyIds: ids("total") });
  assert.deepEqual([alone.settled, alone.voided, alone.failed], [ids("total"), [], []], "settled on the scoreboard alone");
  const total = (await markets.marketById(made.total!.id))!;
  assert.deepEqual([total.resolvedBy, total.resolvedOutcome, total.feedEnding], ["feed", BigInt(score.home + score.away), "alone"]);
  assert.deepEqual([won.feedEnding, voided.feedEnding], ["agreed", "conflict"], "each ending kept on the row for the settled screen's line");
  assert.deepEqual(await cleanResolution(asker.user.id), { ended: 2, clean: 2 });

  // 4. The first drive, from the play-by-play: read once the game has it, proposed on the ballot, read again unchanged, and settled three days on, on one source.
  const drive = made.first_drive!;
  // Production's tick reads every game in the shared database once a minute, and a summary it cannot fetch (this
  // run's made-up game) marks the game read for ten minutes; the mark is cleared here as the finals' is above.
  await db.update(schema.sportsGames).set({ summaryPolledAt: null }).where(eq(schema.sportsGames.id, game.id));
  const noPlays = await pollSummaries(new Date(), { play: playsOf("espn-nfl-summary-scheduled"), onlyIds: [drive.id] });
  assert.deepEqual([noPlays.read, noPlays.proposed], [[game.id], []], "a summary with no play-by-play yet: read, nothing proposed");
  await db.update(schema.sportsGames).set({ summaryPolledAt: null }).where(eq(schema.sportsGames.id, game.id));
  const readAt = new Date(seen.getTime() - 2 * H);
  const first = await pollSummaries(readAt, { play: playsOf("espn-nfl-summary-final"), onlyIds: [drive.id] });
  assert.deepEqual(first.proposed, [drive.id], "the Packers game's first drive, an interception, proposed as a turnover");
  assert.equal((await markets.marketById(drive.id))!.feedOutcome, 3n);
  const g4 = (await db.select().from(schema.sportsGames).where(eq(schema.sportsGames.id, game.id)))[0]!;
  assert.deepEqual([g4.firstDriveResult, g4.firstDriveRaw, g4.firstDriveSeenAt?.getTime(), g4.firstDriveConfirmedAt], ["Turnover", "INT", readAt.getTime(), null]);
  assert.deepEqual(await feedBackstop(new Date(seen.getTime() + ALONE_AFTER_MS), { check: checkOf(null), onlyIds: [drive.id] }), { settled: [], voided: [], failed: [] }, "never on a drive that has not stood a re-read");
  await pollSummaries(new Date(readAt.getTime() + CONFIRM_AFTER_MS + 60_000), { play: playsOf("espn-nfl-summary-final"), onlyIds: [drive.id] });
  assert.ok((await db.select().from(schema.sportsGames).where(eq(schema.sportsGames.id, game.id)))[0]!.firstDriveConfirmedAt, "read again, unchanged");
  const settledDrive = await feedBackstop(new Date(readAt.getTime() + ALONE_AFTER_MS + 60_000), { check: checkOf(null), onlyIds: [drive.id] });
  assert.deepEqual([settledDrive.settled, settledDrive.voided, settledDrive.failed], [[drive.id], [], []], "settled on the play-by-play alone, three days on");
  const done = (await markets.marketById(drive.id))!;
  assert.deepEqual([done.resolvedBy, done.resolvedOutcome, done.feedEnding], ["feed", 3n, "drive"]);
  assert.ok(done.rulingText?.startsWith(DRIVE_RULING) && done.rulingText.includes("Turnover"));
  assert.deepEqual(await cleanResolution(asker.user.id), { ended: 3, clean: 3 });
});

test("the tick's two feed queues give places up: with one place, a question waiting on its second source does not hold it against one that can settle, and a listing that fails leaves its games to wait their turn", async () => {
  // Three games of this run's own, each with a question asked on it. None of the three goes near the chain: a question locked here alone is settled here.
  const three = recorded("espn-nfl-scheduled", "nfl", () => new Date(Date.now() + 2 * H)).slice(6, 9);
  assert.equal(three.length, 3);
  await syncSchedule("nfl", new Date(), listing(three));
  const made: Array<{ d: markets.DareRow; gameId: string; feed: FeedGame }> = [];
  for (const g of three) {
    const { game, byKey } = await templatesOf(g.sourceId);
    const d = await markets.draftFromTemplate({ templateId: byKey.get("home_wins")!.id, creatorId: asker.user.id, groupId, denomId });
    await open(d);
    await enter(d, asker, 500n, 8000n);
    await enter(d, friend, 500n, 3000n);
    await db.update(schema.sportsGames).set({ startsAt: new Date(Date.now() - 30 * H), expectedEndAt: new Date(Date.now() - 27 * H), polledAt: null }).where(eq(schema.sportsGames.id, game.id));
    made.push({ d, gameId: game.id, feed: g });
  }
  const [waiting, ready, down] = made as [typeof made[number], typeof made[number], typeof made[number]];

  // 1. The backstop. Two locked questions whose finals have stood a day; the older one's second source has nothing yet, so it waits up to three days.
  for (const m of [waiting, ready]) await db.update(schema.dares).set({ lockedAt: new Date(), resolvesBy: new Date(Date.now() - 30 * H) }).where(eq(schema.dares.id, m.d.id));
  const finalFor = (g: FeedGame): FeedGame => ({ ...recorded("espn-nfl-final", "nfl")[0]!, sourceId: g.sourceId, home: g.home, away: g.away });
  const finals = [finalFor(waiting.feed), finalFor(ready.feed)];
  const seen = new Date(Date.now() - AGREE_AFTER_MS - 2 * H);
  await pollFinals(seen, { source: listing(finals), onlyIds: [waiting.d.id, ready.d.id] });
  await db.update(schema.sportsGames).set({ finalSeenAt: seen, finalConfirmedAt: new Date(seen.getTime() + CONFIRM_AFTER_MS) }).where(eq(schema.sportsGames.id, waiting.gameId));
  await db.update(schema.sportsGames).set({ finalSeenAt: new Date(seen.getTime() + H), finalConfirmedAt: new Date(seen.getTime() + H + CONFIRM_AFTER_MS) }).where(eq(schema.sportsGames.id, ready.gameId));
  const score: FinalScore = { home: finals[1]!.homeScore!, away: finals[1]!.awayScore! };
  const asked: string[] = [];
  const check: CheckSource = { name: "balldontlie", finalOf: async (q) => (asked.push(q.homeAbbr), q.homeAbbr === ready.feed.home.abbr ? score : null) };
  const one = await feedBackstop(new Date(), { check, onlyIds: [waiting.d.id, ready.d.id], limit: 1 });
  assert.deepEqual([one.settled, one.voided, one.failed], [[ready.d.id], [], []], "the one place goes to the question that can settle, though the waiting one is older");
  assert.deepEqual(asked, [waiting.feed.home.abbr, ready.feed.home.abbr], "read in order, the waiting one first");
  assert.equal(markets.stateOf((await markets.marketById(waiting.d.id))!), "locked", "and the waiting one still waits");
  assert.deepEqual([(await markets.marketById(ready.d.id))!.resolvedBy, (await markets.marketById(ready.d.id))!.feedEnding], ["feed", "agreed"]);

  // 2. The finals poll. A listing that throws leaves the result as it was and marks its games read, so they wait the usual interval and hold no place meanwhile.
  const now = new Date();
  assert.deepEqual((await gamesToPoll(now, [down.d.id])).map((g) => g.id), [down.gameId], "due: its end is behind us and it has never been read");
  const source = `test:${RUN}`;
  const failing = { name: source, listGames: async () => { throw new Error("the scoreboard is down"); } } as unknown as ScheduleSource;
  try {
    const r = await pollFinals(now, { source: failing, onlyIds: [down.d.id] });
    assert.deepEqual([r.polled, r.proposed], [[], []], "nothing read and nothing proposed");
    const after = (await db.select().from(schema.sportsGames).where(eq(schema.sportsGames.id, down.gameId)))[0]!;
    assert.deepEqual([after.polledAt?.getTime(), after.completed, after.homeScore], [now.getTime(), false, null], "marked read at that moment, its result untouched");
    assert.deepEqual(await gamesToPoll(new Date(now.getTime() + 60_000), [down.d.id]), [], "a minute on it holds no place");
    assert.deepEqual((await gamesToPoll(new Date(now.getTime() + POLL_EVERY_MS + 60_000), [down.d.id])).map((g) => g.id), [down.gameId], "and it is due again after the usual interval");
    const [read] = await db.select().from(schema.sportsFeedReads).where(and(eq(schema.sportsFeedReads.source, source), eq(schema.sportsFeedReads.sport, "nfl")));
    assert.equal(read?.lastError, "the scoreboard is down", "the failure is on the record");
  } finally {
    await db.delete(schema.sportsFeedReads).where(eq(schema.sportsFeedReads.source, source));
  }
});

test("the backstop reads each question's own answer: a second scoreboard with the loser's score wrong still settles who wins, and voids the margin", async () => {
  const one = recorded("espn-nfl-scheduled", "nfl", () => new Date(Date.now() + 2 * H)).slice(9, 10);
  assert.equal(one.length, 1);
  await syncSchedule("nfl", new Date(), listing(one));
  const { game, byKey } = await templatesOf(one[0]!.sourceId);
  const made: Record<string, markets.DareRow> = {};
  for (const key of ["home_wins", "margin"] as const) {
    const d = await markets.draftFromTemplate({ templateId: byKey.get(key)!.id, creatorId: asker.user.id, groupId, denomId });
    await open(d);
    await enter(d, asker, 500n, key === "home_wins" ? 7000n : 20n);
    await enter(d, friend, 500n, key === "home_wins" ? 3000n : 10n);
    await db.update(schema.dares).set({ lockedAt: new Date(), resolvesBy: new Date(Date.now() - 30 * H) }).where(eq(schema.dares.id, d.id));
    made[key] = d;
  }
  await db.update(schema.sportsGames).set({ startsAt: new Date(Date.now() - 30 * H), expectedEndAt: new Date(Date.now() - 27 * H), polledAt: null }).where(eq(schema.sportsGames.id, game.id));
  const final = { ...recorded("espn-nfl-final", "nfl")[0]!, sourceId: one[0]!.sourceId, home: one[0]!.home, away: one[0]!.away };
  const seen = new Date(Date.now() - AGREE_AFTER_MS - H);
  const ids = [made.home_wins!.id, made.margin!.id];
  await pollFinals(seen, { source: listing([final]), onlyIds: ids });
  await db.update(schema.sportsGames).set({ finalSeenAt: seen, finalConfirmedAt: new Date(seen.getTime() + CONFIRM_AFTER_MS) }).where(eq(schema.sportsGames.id, game.id));
  // The second source has the winner right and the loser's score off by three.
  const winnerHome = final.homeScore! > final.awayScore!;
  const off: FinalScore = winnerHome ? { home: final.homeScore!, away: Math.max(0, final.awayScore! - 3) } : { home: Math.max(0, final.homeScore! - 3), away: final.awayScore! };
  const r = await feedBackstop(new Date(), { check: checkOf(off), onlyIds: ids });
  assert.deepEqual([r.settled, r.voided, r.failed], [[made.home_wins!.id], [made.margin!.id], []], "who wins settles on the winner both name; the margin, answered differently, voids");
  const won = (await markets.marketById(made.home_wins!.id))!;
  assert.deepEqual([won.resolvedOutcome, won.feedEnding], [winnerHome ? 1n : 0n, "agreed"]);
});
