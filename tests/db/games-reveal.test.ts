/**
 * The games-and-the-reveal round (2026-10-07) against the real database: a question closes when its asker says so,
 * or once as many of the people in say calls are in as it takes to settle a vote among them, guests included; the
 * vote waits until it has happened, and anyone in can say so; a question started while a game is on closes five
 * minutes after its first call or at the final, and takes nothing after the final; the live score reads the feed
 * once per interval however many ask; and a question asked elsewhere finds the game it names. A guest in every
 * question here keeps it off the chain, so nothing costs gas. Rows are the temporary people's and removed after.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ensureUsd } from "@/lib/ledger/denominations";
import { enterAsGhost } from "@/lib/ledger/ghost-entry";
import { createGroup } from "@/lib/ledger/groups";
import * as markets from "@/lib/ledger/markets";
import { callsAreIn, sayCallsAreIn, sayItHappened, takeBackCallsAreIn } from "@/lib/ledger/calls";
import { isProvisional } from "@/lib/ledger/provisional";
import { tick } from "@/lib/ledger/settle";
import { gameNamedIn, syncSchedule } from "@/lib/sports";
import { parseScoreboard } from "@/lib/sports/espn";
import { LIVE_EVERY_MS, LIVE_FRESH_MS, liveScoreFor } from "@/lib/sports/live";
import type { FeedGame, ScheduleSource, Sport } from "@/lib/sports/types";
import { cleanup, codeOf, tempSigner, track, type Signer } from "./fixture";

const H = 3_600_000;
const RUN = Math.random().toString(36).slice(2, 8);
const PREFIX = `test:reveal:${RUN}:`;
const fixture = (path: string): unknown => JSON.parse(readFileSync(new URL(`../fixtures/sports/${path}.json`, import.meta.url), "utf8"));
/** A recorded scoreboard's games, their ids prefixed so the rows are this test's own, starting when the test says. */
const recorded = (path: string, sport: Sport, startsAt: Date): FeedGame[] => parseScoreboard(sport, fixture(path)).map((g) => ({ ...g, sourceId: `${PREFIX}${g.sourceId}`, startsAt }));
const listing = (games: FeedGame[]): ScheduleSource => ({ name: "espn", listGames: async () => games });
/** A recorded final's score, for a game the test ends. */
const finalScore = parseScoreboard("nfl", fixture("espn-nfl-final")).find((x) => x.completed)!;
const gameRow = async (sourceId: string) => (await db.select().from(schema.sportsGames).where(and(eq(schema.sportsGames.source, "espn"), eq(schema.sportsGames.sourceId, sourceId))).limit(1))[0]!;

let ana: Signer, ben: Signer, cy: Signer, dee: Signer;
before(async () => {
  track.gamePrefix(PREFIX);
  [ana, ben, cy, dee] = await Promise.all(["Ana", "Ben", "Cy", "Dee"].map((n) => tempSigner(n)));
});
after(cleanup);

async function question(over: Partial<markets.DraftInput> = {}) {
  const g = await createGroup({ name: "reveal check (temporary)", createdBy: ana.user.id });
  track.group(g.id);
  await db.insert(schema.groupMembers).values([ben, cy, dee].map((p) => ({ groupId: g.id, userId: p.user.id })));
  const usd = await ensureUsd(g.id, ana.user.id);
  const d0 = await markets.draftMarket({ creatorId: ana.user.id, groupId: g.id, denomId: usd.id, title: "Does John fall asleep during the movie?", termsText: "Yes if John is asleep at any point before the credits. No if he makes it.", resolvesBy: new Date(Date.now() + 3 * 86_400_000), stalemate: "void", ...over });
  const d = await markets.openMarket(d0.id, ana.user.id, await ana.ledger.signTypedData(markets.createTypedData(d0)));
  const enter = async (who: Signer, value: bigint, stake = 1000n) => markets.enterMarket({ dareId: d.id, userId: who.user.id, stake, value, signature: await who.ledger.signTypedData(markets.enterTypedData(d, stake, value)), questionSignature: await who.ledger.signTypedData(markets.questionCreateTypedData(d)) });
  const guest = (name: string, value: bigint) => enterAsGhost({ dareId: d.id, who: { name, phoneHash: null, memberClaimId: null }, tokens: [], stake: 1000n, value });
  const vote = async (who: Signer, outcome: bigint) => markets.castVote({ dareId: d.id, userId: who.user.id, outcome, signature: await who.governance.signTypedData(markets.voteTypedData((await markets.marketById(d.id))!, outcome)) });
  return { d, g: g.id, enter, guest, vote };
}

test("calls are in closes a question once as many of the people in say so as it takes to settle a vote among them: named, taken back, a guest's counting like anyone's, and nobody outside", async () => {
  const { d, enter, guest } = await question();
  await enter(ana, 7000n);
  assert.equal(await codeOf(() => sayCallsAreIn(d.id, { userId: ana.user.id })), "wrong_state", "it takes two to close it");
  await enter(ben, 3000n);
  await enter(cy, 6000n);
  const gabe = await guest("Gabe", 5000n);
  // Four in: it takes three.
  assert.deepEqual(await sayCallsAreIn(d.id, { userId: ben.user.id }), { closed: false });
  assert.deepEqual(await sayCallsAreIn(d.id, { userId: ben.user.id }), { closed: false }, "saying it twice is one say");
  assert.equal(await codeOf(() => sayCallsAreIn(d.id, { userId: dee.user.id })), "not_member", "someone in the set who is not in the question has no say");
  assert.deepEqual(await sayCallsAreIn(d.id, { claimId: gabe.claimId }), { closed: false });
  await takeBackCallsAreIn(d.id, { userId: ben.user.id });
  assert.deepEqual((await callsAreIn(d.id)).map((c) => c.claimId ?? c.userId), [gabe.claimId], "Ben took his back: only the guest's stands");
  assert.deepEqual(await sayCallsAreIn(d.id, { userId: ben.user.id }), { closed: false });
  assert.equal((await markets.marketById(d.id))!.lockedAt, null, "two of four is not enough");
  assert.deepEqual(await sayCallsAreIn(d.id, { userId: cy.user.id }), { closed: true }, "the third of four closes it");
  const closed = (await markets.marketById(d.id))!;
  assert.ok(closed.lockedAt && isProvisional(closed), "closed, and decided here since a guest is in it");
  assert.deepEqual(await sayCallsAreIn(d.id, { userId: ana.user.id }), { closed: true }, "a say after it closed is answered as done");
  assert.equal(await codeOf(() => takeBackCallsAreIn(d.id, { userId: ben.user.id })), "wrong_state", "and nothing can be taken back once it has closed");
  const told = await db.select().from(schema.usageEvents).where(and(eq(schema.usageEvents.name, "closed"), eq(schema.usageEvents.dareId, d.id)));
  assert.deepEqual(told.map((r) => (r.props as { by?: string }).by), ["calls"], "counted as closed by calls");
});

test("the vote waits until it has happened: closed early, nobody can vote or say what happened, until anyone in says it has, guest or not; the first to say it is named", async () => {
  const { d, enter, guest, vote } = await question();
  await enter(ana, 7000n);
  await enter(ben, 3000n);
  const gabe = await guest("Gabe", 5000n);
  assert.equal(await codeOf(() => sayItHappened(d.id, { userId: ana.user.id })), "wrong_state", "nothing has happened before it closes");
  await markets.lockMarket(d.id, ana.user.id);
  const refused = await vote(ben, 1n).catch((e: unknown) => e);
  assert.ok(refused instanceof markets.MarketError && refused.message === markets.VOTING_WAITS, "the vote waits, in the sheet's own words");
  assert.equal(await codeOf(() => markets.sayWhatHappened(d.id, ben.user.id, "Out cold by the second act.")), "wrong_state");
  assert.equal(await codeOf(() => vote(dee, 1n)), "not_member", "someone outside is refused as outside, whatever the vote is waiting on");
  assert.equal(await codeOf(() => sayItHappened(d.id, { userId: dee.user.id })), "not_member");
  assert.equal(await markets.votingOpenNow((await markets.marketById(d.id))!), false);
  assert.equal(await sayItHappened(d.id, { claimId: gabe.claimId }), true, "the guest says it first");
  assert.equal(await sayItHappened(d.id, { userId: ana.user.id }), false, "a second say changes nothing");
  const row = (await markets.marketById(d.id))!;
  assert.deepEqual([row.happenedClaim, row.happenedUser, row.happenedAt !== null], [gabe.claimId, null, true], "the guest is named as the one who said it");
  assert.equal(await markets.votingOpenNow(row), true);
  assert.equal((await vote(ben, 1n)).resolved, false, "the vote is open for everyone at once");
});

test("a question started while a game is on waits for its first call, closes five minutes after it or at the final, takes nothing after the final, and ends with nothing scored when fewer than two called it", async () => {
  const [game] = recorded("espn-nfl-scheduled", "nfl", new Date(Date.now() - H)).slice(0, 1);
  await syncSchedule("nfl", new Date(), listing([game!]));
  const row = await gameRow(game!.sourceId);
  const templates = await db.select().from(schema.publicQuestions).where(eq(schema.publicQuestions.gameId, row.id));
  const wins = templates.find((t) => t.key === "home_wins")!;
  const total = templates.find((t) => t.key === "total")!;
  const g = await createGroup({ name: "reveal game check (temporary)", createdBy: ana.user.id });
  track.group(g.id);
  await db.insert(schema.groupMembers).values([ben, cy].map((p) => ({ groupId: g.id, userId: p.user.id })));
  const usd = await ensureUsd(g.id, ana.user.id);
  const openOne = async (templateId: string) => {
    const d0 = await markets.draftFromTemplate({ templateId, creatorId: ana.user.id, groupId: g.id, denomId: usd.id });
    assert.deepEqual([d0.resolvesBy, d0.closesAfterFirst, markets.createTypedData(d0).message.resolvesBy], [null, true, 0n], "no close time until the first call, signed as due at once");
    return markets.openMarket(d0.id, ana.user.id, await ana.ledger.signTypedData(markets.createTypedData(d0)));
  };
  const d = await openOne(wins.id);
  const before = Date.now();
  await markets.enterMarket({ dareId: d.id, userId: ben.user.id, stake: 1000n, value: 6000n, signature: await ben.ledger.signTypedData(markets.enterTypedData(d, 1000n, 6000n)), questionSignature: await ben.ledger.signTypedData(markets.questionCreateTypedData(d)) });
  const clock = (await markets.marketById(d.id))!.resolvesBy;
  // Five minutes as the words say it ("Closes 5 minutes after the first call"), never the constant the code reads.
  const FIVE_MINUTES = 5 * 60_000;
  assert.ok(clock && clock.getTime() >= before + FIVE_MINUTES && clock.getTime() <= Date.now() + FIVE_MINUTES, "the first call sets the close five minutes on");
  await enterAsGhost({ dareId: d.id, who: { name: "Gabe", phoneHash: null, memberClaimId: null }, tokens: [], stake: 1000n, value: 3000n });
  assert.equal((await markets.marketById(d.id))!.resolvesBy?.getTime(), clock.getTime(), "a later call never moves it");
  const lonely = await openOne(total.id);
  await markets.enterMarket({ dareId: lonely.id, userId: cy.user.id, stake: 1000n, value: 41n, signature: await cy.ledger.signTypedData(markets.enterTypedData(lonely, 1000n, 41n)), questionSignature: await cy.ledger.signTypedData(markets.questionCreateTypedData(lonely)) });

  // The final comes in before the five minutes are up: both close at once, the one with two in decided here, the one with one ended with nothing scored.
  await db.update(schema.sportsGames).set({ finalSeenAt: new Date(), homeScore: finalScore.homeScore, awayScore: finalScore.awayScore, completed: true, status: "final" }).where(eq(schema.sportsGames.id, row.id));
  assert.equal(await codeOf(() => markets.enterMarket({ dareId: d.id, userId: cy.user.id, stake: 1000n, value: 5000n, signature: "0x00" })), "wrong_state", "nothing is entered after the final");
  const r = await tick(new Date(), async () => undefined, { onlyIds: [d.id, lonely.id] });
  assert.deepEqual([r.locked, r.expired, r.failed], [[d.id], [lonely.id], []]);
  const [closed, ended] = await Promise.all([markets.marketById(d.id), markets.marketById(lonely.id)]);
  assert.ok(closed!.lockedAt && !closed!.resolvedAt, "closed at the final, its vote open since the final is in");
  assert.equal(await markets.votingOpenNow(closed!), true);
  assert.equal(ended!.resolvedBy, "expired");
});

test("the live score is read from the feed once per interval however many ask, shown only while fresh, and nothing when the feed cannot be read", async () => {
  const body = fixture("live/espn-mlb-top") as { events: Array<{ id: string }> };
  // The recorded scoreboard, its ids prefixed as the rows' are.
  const prefixed = { ...body, events: body.events.map((e) => ({ ...e, id: `${PREFIX}${e.id}` })) };
  const games = parseScoreboard("mlb", body).map((g) => ({ ...g, sourceId: `${PREFIX}${g.sourceId}`, startsAt: new Date(Date.now() - 2 * H) }));
  const playing = games.find((g) => g.sourceId === `${PREFIX}401907992`)!;
  const ahead = { ...games.find((g) => g.sourceId === `${PREFIX}401907987`)!, startsAt: new Date(Date.now() + 2 * H) };
  await syncSchedule("mlb", new Date(), listing([playing, ahead]));
  const row = await gameRow(playing.sourceId);
  let reads = 0;
  let down = false;
  const fetch = async () => {
    reads += 1;
    if (down) throw new Error("the scoreboard did not answer");
    return prefixed;
  };
  const t0 = new Date();
  const at = (ms: number) => new Date(t0.getTime() + ms);
  const live = { away: 5, home: 2, where: "Bottom 6th", final: false };
  assert.deepEqual(await liveScoreFor(row.id, t0, { fetch }), live);
  const [a, b] = await Promise.all([liveScoreFor(row.id, at(5_000), { fetch }), liveScoreFor(row.id, at(6_000), { fetch })]);
  assert.deepEqual([a, b, reads], [live, live, 1], "two watching within the interval: the feed read once");
  assert.deepEqual(await liveScoreFor(row.id, at(LIVE_EVERY_MS + 1_000), { fetch }), live);
  assert.equal(reads, 2, "the next interval reads it again");
  down = true;
  assert.deepEqual(await liveScoreFor(row.id, at(2 * LIVE_EVERY_MS + 2_000), { fetch }), live, "the feed down, the last read still fresh: shown");
  assert.equal(await liveScoreFor(row.id, at(LIVE_EVERY_MS + 1_000 + LIVE_FRESH_MS + 1_000), { fetch }), null, "the last read gone stale: nothing, never an old score");
  const notYet = await gameRow(ahead.sourceId);
  const readsBefore = reads;
  assert.equal(await liveScoreFor(notYet.id, t0, { fetch }), null);
  assert.equal(reads, readsBefore, "a game not started is never read");
});

test("a question asked elsewhere that names both teams of a game within its window finds that game, and one naming a single team or a game already over finds nothing (section 6)", async () => {
  const now = new Date();
  const soon = new Date(now.getTime() + 2 * H);
  const until = new Date(now.getTime() + 6 * H);
  // A recorded slate's game whose two teams nothing real plays within the window.
  const slate = recorded("espn-nfl-scheduled", "nfl", soon);
  let picked: FeedGame | null = null;
  for (const g of slate.slice(3)) {
    if ((await gameNamedIn(`Will the ${g.home.short} beat the ${g.away.short}?`, until, now)) === null) {
      picked = g;
      break;
    }
  }
  assert.ok(picked, "a game nothing real collides with");
  await syncSchedule("nfl", now, listing([picked]));
  const row = await gameRow(picked.sourceId);
  assert.equal((await gameNamedIn(`Will the ${picked.home.short} beat the ${picked.away.short} tonight?`, until, now))?.id, row.id);
  assert.equal(await gameNamedIn(`Do the ${picked.home.short} win?`, until, now), null, "one team named is not a game");
  assert.equal(await gameNamedIn(`Will the ${picked.home.short} beat the ${picked.away.short} tonight?`, new Date(now.getTime() + H), now), null, "a game after the question is decided is not its game");
  await db.update(schema.sportsGames).set({ finalSeenAt: now, homeScore: finalScore.homeScore, awayScore: finalScore.awayScore, completed: true, status: "final" }).where(eq(schema.sportsGames.id, row.id));
  assert.equal(await gameNamedIn(`Will the ${picked.home.short} beat the ${picked.away.short} tonight?`, until, now), null, "a game already over");
});
