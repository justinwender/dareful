/**
 * What's on's rules, against real responses (tests/fixtures/sports, recorded by scripts/dev/record-sports.ts):
 * a result is read only from a game the scoreboard says is complete, never from `winner`, and a score is a
 * string that parses as a number; a live game, a rain delay, a scheduled game, an empty day and a malformed
 * event all read as no result and never crash; the second source's free tier reads three sports and refuses
 * hockey; the templates say the consent in plain words and never a sportsbook's; a final scores each question
 * (a tie voids who-wins until the redeploy, the margin is signed and shifted); and the backstop has three
 * endings and a warning before the earliest (docs/decisions.md, public markets).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { VOID_OUTCOME } from "@/lib/ledger/markets";
import { unitPhrase } from "@/lib/ledger/number-axis";
import { cleanResolutionOf } from "@/lib/ledger/settle";
import { backstopResultNotice, backstopWarningNotice } from "@/lib/notify/messages";
import { BDL_PATHS, finalFrom, gamesUrl, parseGames, sameTeam } from "@/lib/sports/balldontlie";
import { gameOf, parseScoreboard, resultOf, scoreboardUrl, statusOf } from "@/lib/sports/espn";
import { AGREE_AFTER_MS, ALONE_AFTER_MS, backstopDecision, fromStored, marginWords, outcomeFor, scoreLine, toStored, warnAt, WARN_BEFORE_MS } from "@/lib/sports/results";
import { expectedEnd, marginShift, SCALES, templatesFor, UNIT } from "@/lib/sports/templates";
import { dayOf, FeedError, parseScore } from "@/lib/sports/types";

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`../fixtures/sports/${name}.json`, import.meta.url), "utf8"));

test("a final is read only from a game the scoreboard says is complete: the score is a string, and winner is never read", () => {
  const games = parseScoreboard("nfl", fixture("espn-nfl-final"));
  assert.equal(games.length, 1);
  const g = games[0]!;
  assert.deepEqual([g.sourceId, g.home.abbr, g.away.abbr, g.status, g.completed, g.playByPlay, g.timeValid], ["401872947", "LAR", "NYG", "final", true, true, true]);
  assert.deepEqual(resultOf(g), { home: 28, away: 6 }, "the scores, parsed from strings");
  assert.equal((parseScore("9") ?? -1) < (parseScore("14") ?? -1), true, "9 is below 14 once parsed; as strings it would be above");
  assert.equal(parseScore("abc"), null);
  assert.equal(parseScore(-1), null);
  assert.equal(g.startsAt.toISOString(), "2026-09-22T00:15:00.000Z");
});

test("a live game, a rain delay, a scheduled game and an empty day are no result, and never a crash", () => {
  const today = parseScoreboard("mlb", fixture("espn-mlb-today"));
  const live = today.filter((g) => g.status === "in_progress");
  assert.ok(live.length >= 3, "the recording caught three games in progress and a rain delay");
  for (const g of live) assert.equal(resultOf(g), null, `${g.away.abbr} at ${g.home.abbr} is in progress: no result, whatever the scores say`);
  const finals = today.filter((g) => g.completed);
  assert.ok(finals.length >= 2 && finals.every((g) => resultOf(g) !== null), "the finals on the same day do read");
  const scheduled = parseScoreboard("nfl", fixture("espn-nfl-scheduled"));
  assert.equal(scheduled.length, 14);
  assert.ok(scheduled.every((g) => g.status === "scheduled" && !g.completed && resultOf(g) === null && g.timeValid && !g.playByPlay), "a scheduled game: a confirmed time, no play-by-play yet, no result");
  assert.deepEqual(parseScoreboard("nhl", fixture("espn-empty")), [], "an empty day");
  assert.deepEqual(statusOf({ name: "STATUS_POSTPONED", state: "post", completed: false }), { status: "postponed", completed: false }, "postponed is not final");
  assert.deepEqual(statusOf({ name: "STATUS_FINAL", state: "post", completed: false }), { status: "unknown", completed: false }, "final in name but not complete: nothing");
  assert.deepEqual(statusOf(undefined), { status: "unknown", completed: false });
});

test("anything missing, malformed or unparseable is no game or no result, never a wrong settlement", () => {
  const good = (fixture("espn-nfl-final") as { events: unknown[] }).events[0] as Record<string, unknown>;
  assert.ok(gameOf("nfl", good));
  assert.equal(gameOf("nfl", { ...good, competitions: [] }), null, "no competition");
  assert.equal(gameOf("nfl", { ...good, date: "not a date" }), null, "no start time");
  const noScore = JSON.parse(JSON.stringify(good)) as { competitions: Array<{ competitors: Array<{ score: unknown }> }> };
  noScore.competitions[0]!.competitors[0]!.score = "28-6";
  const parsed = gameOf("nfl", noScore);
  assert.ok(parsed && parsed.completed && resultOf(parsed) === null, "a complete game whose score does not parse has no result");
  const twoHome = JSON.parse(JSON.stringify(good)) as { competitions: Array<{ competitors: Array<{ homeAway: string }> }> };
  twoHome.competitions[0]!.competitors[1]!.homeAway = "home";
  assert.equal(gameOf("nfl", twoHome), null, "no away side");
  assert.deepEqual(parseScoreboard("nfl", { events: [good, { nonsense: true }, 42] }).length, 1, "a broken event is left out, the rest read");
  assert.throws(() => parseScoreboard("nfl", "<html>"), FeedError, "a body that is not a scoreboard is a feed error");
  assert.throws(() => parseScoreboard("nfl", { code: 400, message: "bad" }), FeedError, "an error answer is not a scoreboard either: it is never read as a day with no games");
  assert.equal(scoreboardUrl("nfl", "20260927"), "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=20260927");
  assert.throws(() => scoreboardUrl("nfl", "2026-09-27"), FeedError, "a day is eight digits");
  assert.equal(dayOf(new Date("2026-09-27T17:00:00Z")), "20260927");
});

test("the second source reads finals for three sports on its free tier, refuses hockey, and matches a game by its teams through the alias table", () => {
  const nfl = parseGames(fixture("balldontlie-nfl-final"));
  assert.deepEqual(finalFrom("nfl", nfl, { homeAbbr: "KC", awayAbbr: "IND" }), { home: 33, away: 30 }, "a final in overtime, from the scoreboard's abbreviations");
  const mlb = parseGames(fixture("balldontlie-mlb-final"));
  assert.deepEqual(finalFrom("mlb", mlb, { homeAbbr: "SEA", awayAbbr: "LAA" }), { home: 4, away: 6 }, "runs, from the innings' data");
  const nba = parseGames(fixture("balldontlie-nba-final"));
  assert.deepEqual(finalFrom("nba", nba, { homeAbbr: "CHA", awayAbbr: "DET" }), { home: 100, away: 118 });
  assert.equal(finalFrom("nba", nba, { homeAbbr: "CHA", awayAbbr: "LAL" }), null, "a game that is not there is no result, which is the safe side");
  assert.equal(sameTeam("nba", "GS", "GSW"), true, "the alias table, where the two sources spell a team differently");
  assert.equal(sameTeam("nfl", "WSH", "WAS"), true);
  assert.equal(sameTeam("nfl", "KC", "KC"), true);
  assert.equal(sameTeam("nfl", "KC", "IND"), false);
  assert.equal(BDL_PATHS.nhl, null, "hockey is not on the free tier: the 401 the real key got is in the fixture");
  assert.equal(gamesUrl("nhl", "2026-04-10"), null);
  assert.equal(gamesUrl("nba", "2026-04-10"), "https://api.balldontlie.io/v1/games?dates[]=2026-04-10&per_page=25");
  assert.throws(() => parseGames(fixture("balldontlie-nhl-refused")), FeedError, "the refusal is not a page of games");
  assert.deepEqual(parseGames({ data: [{ home_team: { abbreviation: "KC" } }] }), [], "a game with no away side is left out");
});

test("the templates: who wins, the margin, the total, and the first drive only where play-by-play is reported; the consent in plain words, and never a sportsbook's", () => {
  const game = { sport: "nfl" as const, home: { id: "19", abbr: "NYG", name: "New York Giants", short: "Giants" }, away: { id: "10", abbr: "TEN", name: "Tennessee Titans", short: "Titans" }, playByPlay: false };
  const three = templatesFor(game);
  assert.deepEqual(three.map((t) => t.key), ["home_wins", "margin", "total"], "no first drive without play-by-play");
  assert.deepEqual(templatesFor({ ...game, playByPlay: true }).map((t) => t.key), ["home_wins", "margin", "total", "first_drive"]);
  for (const t of three) {
    assert.ok(t.terms.includes("If nobody votes, the final score decides."), `${t.key}: the consent the backstop relies on, in plain words at entry`);
    assert.ok(!/spread|official|odds|bet\b|wager/i.test(`${t.title} ${t.terms}`), `${t.key}: nothing a sportsbook says`);
    assert.equal(t.decidedByScore, true);
  }
  const [wins, margin, total] = three as [typeof three[number], typeof three[number], typeof three[number]];
  assert.equal(wins.kind, "binary");
  assert.ok(wins.terms.includes("Yes if the Giants win") && wins.terms.includes("If it ends in a tie, this one is called off"), "the home side is yes, and an NFL tie is called off until the redeploy");
  assert.deepEqual(wins.outcomeWords, ["The Giants won", "The Titans won", "The Giants won.", "The Titans won."]);
  assert.equal(margin.kind, "numeric");
  assert.deepEqual([margin.range, margin.shift, margin.outcomeLabels], [SCALES.nfl.margin, marginShift("nfl"), ["point", "points"]]);
  assert.ok(margin.terms.startsWith("Points for the Giants minus points for the Titans") && margin.terms.includes("Giants by 7 is 7") && margin.terms.includes("the other way") && margin.terms.includes("level is 0"), "signed, home minus away, with level as zero, and no possessive of a team's name (the real session read \"the Giants's\")");
  assert.deepEqual([total.range, total.typical], [SCALES.nfl.total, SCALES.nfl.totalTypical]);
  const nhl = templatesFor({ ...game, sport: "nhl" });
  assert.ok(!nhl[0]!.terms.includes("tie") && nhl[0]!.terms.includes("shootout included"), "hockey plays on: no tie line");
  assert.deepEqual(nhl.map((t) => t.key), ["home_wins", "margin", "total"], "the first drive is football's");
  assert.deepEqual([UNIT.mlb.plural, UNIT.nhl.plural], ["runs", "goals"]);
  assert.equal(expectedEnd("nfl", new Date("2026-09-27T17:00:00Z")).toISOString(), "2026-09-27T20:15:00.000Z");
  const first = templatesFor({ ...game, playByPlay: true })[3]!;
  assert.equal(first.decidedByScore, false, "the score cannot answer the first drive: it waits for a person and the ordinary tiebreaker");
  assert.equal(first.outcomeLabels.length, 5);
});

test("a final scores each question: the home side's win is yes, a tie voids who-wins until the redeploy, the margin is signed and shifted, the total is the sum", () => {
  const wins = { key: "home_wins", shift: null, decidedByScore: true };
  const margin = { key: "margin", shift: 14n, decidedByScore: true };
  const total = { key: "total", shift: null, decidedByScore: true };
  assert.deepEqual(outcomeFor(wins, { home: 24, away: 17 }), { outcome: 1n, tie: false, floored: false });
  assert.deepEqual(outcomeFor(wins, { home: 17, away: 24 }), { outcome: 0n, tie: false, floored: false });
  assert.deepEqual(outcomeFor(wins, { home: 17, away: 17 }), { outcome: VOID_OUTCOME, tie: true, floored: false }, "the deployed contract cannot score the middle: a tie goes unsettled");
  assert.deepEqual(outcomeFor(margin, { home: 24, away: 17 }), { outcome: 21n, tie: false, floored: false }, "home by 7, stored as 7 plus the shift");
  assert.deepEqual(outcomeFor(margin, { home: 17, away: 24 }), { outcome: 7n, tie: false, floored: false }, "away by 7: 14 minus 7");
  assert.deepEqual(outcomeFor(margin, { home: 17, away: 17 }), { outcome: 14n, tie: true, floored: false }, "level is the shift itself, and it is an answer, not a void");
  assert.deepEqual(outcomeFor(margin, { home: 0, away: 40 }), { outcome: 0n, tie: false, floored: true }, "past the field's floor the answer floors, and says so");
  assert.deepEqual(outcomeFor(total, { home: 24, away: 17 }), { outcome: 41n, tie: false, floored: false });
  assert.equal(outcomeFor({ key: "first_drive", shift: null, decidedByScore: false }, { home: 24, away: 17 }), null, "the score does not answer the first drive");
  assert.equal(toStored(7n, 14n), 21n);
  assert.equal(toStored(-14n, 14n), 0n);
  assert.equal(toStored(-15n, 14n), null, "below the shift is as far as the field goes");
  assert.equal(fromStored(21n, 14n), 7n);
  assert.equal(marginWords(7n, "Giants", "Titans"), "Giants by 7");
  assert.equal(marginWords(-3n, "Giants", "Titans"), "Titans by 3");
  assert.equal(marginWords(0n, "Giants", "Titans"), "Level");
  const unit = { singular: "point", plural: "points", margin: { shift: "14", home: "Giants", away: "Titans" } };
  assert.equal(unitPhrase(21n, unit), "Giants by 7", "every number on the screen reads as a side and a figure, never the shifted number");
  assert.equal(unitPhrase(11n, unit), "Titans by 3");
  assert.equal(unitPhrase(14n, unit), "Level");
  assert.equal(unitPhrase(14n, { singular: "point", plural: "points" }), "14 points", "a plain number question is unchanged");
  assert.equal(scoreLine({ home: 24, away: 17 }, "Giants", "Titans"), "Giants 24, Titans 17");
  assert.equal(scoreLine({ home: 17, away: 24 }, "Giants", "Titans"), "Titans 24, Giants 17", "the winner first");
});

test("the backstop's three endings: both sources agreeing settles at a day, the scoreboard alone at three days once its final stood a re-read, two different finals void; before its time it waits", () => {
  const seen = new Date("2026-09-27T20:30:00Z");
  const final = { home: 24, away: 17 };
  const at = (ms: number) => new Date(seen.getTime() + ms);
  assert.deepEqual(backstopDecision({ finalSeenAt: seen, confirmedAt: at(1_800_000), final, check: final, now: at(AGREE_AFTER_MS) }), { act: "settle", final, alone: false }, "both agree, a day on");
  assert.deepEqual(backstopDecision({ finalSeenAt: seen, confirmedAt: at(1_800_000), final, check: final, now: at(AGREE_AFTER_MS - 60_000) }), { act: "wait" }, "a minute short of a day");
  assert.deepEqual(backstopDecision({ finalSeenAt: seen, confirmedAt: at(1_800_000), final, check: { home: 24, away: 20 }, now: at(AGREE_AFTER_MS) }), { act: "void", why: "conflict" }, "a real conflict: nothing changes hands");
  assert.deepEqual(backstopDecision({ finalSeenAt: seen, confirmedAt: at(1_800_000), final, check: { home: 24, away: 20 }, now: at(AGREE_AFTER_MS - 60_000) }), { act: "wait" }, "a conflict before the day is up may still be a correction on its way");
  assert.deepEqual(backstopDecision({ finalSeenAt: seen, confirmedAt: at(1_800_000), final, check: null, now: at(AGREE_AFTER_MS) }), { act: "wait" }, "no second source at a day: wait (hockey, always)");
  assert.deepEqual(backstopDecision({ finalSeenAt: seen, confirmedAt: at(1_800_000), final, check: null, now: at(ALONE_AFTER_MS) }), { act: "settle", final, alone: true }, "the scoreboard alone, three days on, its final unchanged");
  assert.deepEqual(backstopDecision({ finalSeenAt: seen, confirmedAt: null, final, check: null, now: at(ALONE_AFTER_MS) }), { act: "wait" }, "never on a final that has not stood a re-read");
  assert.equal(warnAt(seen).getTime(), seen.getTime() + AGREE_AFTER_MS - WARN_BEFORE_MS, "the warning, six hours before the earliest ending");
});

test("a feed settlement counts clean, and a feed void counts against nobody; the two notices carry no score", () => {
  assert.deepEqual(cleanResolutionOf([{ outcome: 1n, by: "feed" }, { outcome: VOID_OUTCOME, by: "feed" }, { outcome: VOID_OUTCOME, by: "quorum" }, { outcome: 0n, by: "quorum" }]), { ended: 3, clean: 2 }, "the final score's void is in neither number; the group's void counts against the asker");
  for (const flavour of ["tiebreaker", "score", "void"] as const) {
    const n = backstopWarningNotice({ title: "Who wins, Titans or Giants?", flavour, marketId: "m", appUrl: "https://x" });
    assert.ok(n.body.includes("six hours") && n.url.endsWith("#ballot"), flavour);
    assert.ok(!/\d{2}/.test(n.body), "no score, no number");
  }
  for (const how of ["feed", "feed_void", "expired"] as const) {
    const n = backstopResultNotice({ title: "Who wins, Titans or Giants?", how, marketId: "m", appUrl: "https://x" });
    assert.ok(!/\d/.test(n.body), `${how}: never a number`);
    assert.ok(n.title.includes("Who wins"));
  }
});
