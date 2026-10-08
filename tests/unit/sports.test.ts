/**
 * What's on's rules, against real responses (tests/fixtures/sports, recorded by scripts/dev/record-sports.ts):
 * a result is read only from a game the scoreboard says is complete, never from `winner`, and a score is a
 * string that parses as a number; a live game, a rain delay, a scheduled game, an empty day and a malformed
 * event all read as no result and never crash; the second source's free tier reads three sports and refuses
 * hockey; the first drive is read from a recorded summary's play-by-play and mapped to the answers explicitly,
 * never guessed; the templates say the consent in plain words and never a sportsbook's; a final scores each
 * question (a tie voids who-wins until the redeploy, the margin is signed and shifted); the backstop has three
 * endings and the first drive its own; and the one warning and the one notice follow 4.10 (docs/decisions.md,
 * public markets and the game page).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { collapseGames } from "@/lib/ledger/home";
import { VOID_OUTCOME } from "@/lib/ledger/markets";
import { marginEnds, numberAxis, ruler, unitPhrase } from "@/lib/ledger/number-axis";
import { backstopMoment, cleanResolutionOf } from "@/lib/ledger/settle";
import { backstopResultNotice, backstopWarningNotice, clockWithDay, pushElseEmail, warningSendTime } from "@/lib/notify/messages";
import { BDL_PATHS, finalFrom, gamesUrl, parseGames, sameTeam } from "@/lib/sports/balldontlie";
import { cardMeta, gameWhosIn, lineT, onePerQuestion, setsOnGames, yourEntry } from "@/lib/sports/cards";
import { driveAnswer, gameOf, parseScoreboard, parseSummary, resultOf, scoreboardUrl, statusOf, summaryUrl } from "@/lib/sports/espn";
import { AGREE_AFTER_MS, ALONE_AFTER_MS, backstopDecision, driveBackstopDecision, driveOutcome, fromStored, marginWords, outcomeFor, outcomesAgree, scoreLine, toStored, warnAt, WARN_BEFORE_MS } from "@/lib/sports/results";
import { askerName } from "@/lib/ledger/share";
import { BOTH_CONSENT, CONSENT, consentFor, DRIVE_CONSENT, expectedEnd, marginShift, menuName, offersFirstDrive, SCALES, SLIDER_REACH, templatesFor, TIE_VOID, UNCLEAR_BY_SCORE, UNIT } from "@/lib/sports/templates";
import { dayOf, DRIVE_ANSWERS, FeedError, isoDayOf, parseColor, parseScore, SPORTS } from "@/lib/sports/types";
import { leanBand, leanPill, saidLean, sliderStamps, stampGlyph, stampInk } from "@/lib/ui/team";
import { GAME_TILE, gameNameLines, gameNameSize, gameTileHeight, tileSize } from "@/lib/ui/tiles";

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`../fixtures/sports/${name}.json`, import.meta.url), "utf8"));

test("a final is read only from a game the scoreboard says is complete: the score is a string, and winner is never read", () => {
  const games = parseScoreboard("nfl", fixture("espn-nfl-final"));
  assert.equal(games.length, 1);
  const g = games[0]!;
  assert.deepEqual([g.sourceId, g.home.abbr, g.away.abbr, g.status, g.completed, g.playByPlay, g.timeValid, g.seasonType], ["401872947", "LAR", "NYG", "final", true, true, true, 2]);
  assert.deepEqual(resultOf(g), { home: 28, away: 6 }, "the scores, parsed from strings");
  assert.equal((parseScore("9") ?? -1) < (parseScore("14") ?? -1), true, "9 is below 14 once parsed; as strings it would be above");
  assert.equal(parseScore("abc"), null);
  assert.equal(parseScore(-1), null);
  assert.equal(g.startsAt.toISOString(), "2026-09-22T00:15:00.000Z");
  assert.deepEqual([g.home.color, g.away.color], ["003594", "003c7f"], "each team's colour, as the feed supplies it, for its stamp and nowhere else");
  assert.equal(parseColor("#FFD100"), "ffd100");
  assert.equal(parseColor("blue"), null, "anything but six hex digits is no colour");
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
  assert.ok(scheduled.every((g) => g.status === "scheduled" && !g.completed && resultOf(g) === null && g.timeValid && !g.playByPlay && g.seasonType === 2), "a scheduled game: a confirmed time, no play-by-play yet (the flag reports whether it exists, and none does before kickoff), no result, the regular season");
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
  // The sources count days in New York: an 8pm game there is the next day in UTC and must be asked for under its own (the field round).
  assert.equal(dayOf(new Date("2026-10-01T00:00:00Z")), "20260930", "8pm Eastern on the 30th");
  assert.equal(dayOf(new Date("2026-10-01T03:59:00Z")), "20260930", "11:59pm Eastern on the 30th");
  assert.equal(dayOf(new Date("2026-10-01T04:00:00Z")), "20261001", "midnight Eastern, the 1st");
  assert.equal(isoDayOf(new Date("2026-10-01T00:00:00Z")), "2026-09-30");
  assert.equal(isoDayOf(new Date("2026-10-01T00:00:00Z"), 1), "2026-10-01");
});

test("the first drive is read from the recorded play-by-play and mapped to the answers explicitly; a word the table does not know, or no play-by-play yet, is no result", () => {
  const packers = parseSummary(fixture("espn-nfl-summary-final"));
  assert.deepEqual([packers.status, packers.completed], ["final", true]);
  assert.deepEqual(packers.firstDrive, { raw: "INT", answer: "Turnover", team: "ATL" }, "the Packers game: the Falcons' first drive ended in an interception, which the terms call a turnover");
  const scheduled = parseSummary(fixture("espn-nfl-summary-scheduled"));
  assert.deepEqual([scheduled.status, scheduled.completed, scheduled.firstDrive], ["scheduled", false, null], "a scheduled game's summary has no play-by-play: no result");
  assert.throws(() => parseSummary({ nonsense: true }), FeedError, "a body that is not a summary is a feed error");
  assert.deepEqual(["TD", "FG", "PUNT", "INT", "FUMBLE", "INT TD", "DOWNS", "MISSED FG", "SAFETY", "END OF HALF", "END OF GAME"].map(driveAnswer), ["Touchdown", "Field goal", "Punt", "Turnover", "Turnover", "Turnover", "Something else", "Something else", "Something else", "Something else", "Something else"], "every word seen in a recorded summary, mapped as the terms say");
  assert.equal(driveAnswer("BLOCKED PUNT"), null, "a word the table does not know is no result, never guessed into Something else");
  assert.equal(driveAnswer(null), null);
  assert.equal(driveOutcome([...DRIVE_ANSWERS], "Turnover"), 3n, "the answer's index in the template's list");
  assert.equal(driveOutcome([...DRIVE_ANSWERS], null), null);
  // A drive listed first but not from the first period is not the first drive.
  const later = JSON.parse(JSON.stringify(fixture("espn-nfl-summary-final"))) as { drives: { previous: Array<{ start: { period: { number: number } } }> } };
  later.drives.previous[0]!.start.period.number = 2;
  assert.equal(parseSummary(later).firstDrive, null);
  assert.equal(summaryUrl("nfl", "401872948"), "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=401872948");
  assert.throws(() => summaryUrl("nfl", "../x"), FeedError);
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

test("the templates: who wins, the margin, the total, and the first drive by coverage (the NFL regular season); the consent in plain words, and never a sportsbook's", () => {
  const game = { sport: "nfl" as const, home: { short: "Giants" }, away: { short: "Titans" }, seasonType: 2 };
  const four = templatesFor(game);
  assert.deepEqual(four.map((t) => t.key), ["home_wins", "margin", "total", "first_drive"], "the first drive in the regular season, whatever a flag read off a finished game says");
  assert.deepEqual(templatesFor({ ...game, seasonType: 1 }).map((t) => t.key), ["home_wins", "margin", "total"], "not in the preseason");
  assert.deepEqual(templatesFor({ ...game, seasonType: null }).map((t) => t.key), ["home_wins", "margin", "total"], "not when the feed gave no season");
  assert.equal(offersFirstDrive({ sport: "nba", seasonType: 2 }), false, "football's only");
  for (const t of four.slice(0, 3)) {
    assert.ok(t.terms.includes(CONSENT), `${t.key}: the consent the backstop relies on, in plain words at entry`);
    assert.ok(!/spread|official|odds|bet\b|wager|level/i.test(`${t.title} ${t.terms}`), `${t.key}: nothing a sportsbook says`);
    assert.equal(t.decidedByScore, true);
    assert.equal(t.decidedByFeed, true);
    assert.equal(t.rows.unclear, UNCLEAR_BY_SCORE);
  }
  assert.equal(CONSENT, "If nobody votes, the final score settles it.", "the design's line, not \"decides\"");
  const [wins, margin, total, first] = four as [(typeof four)[number], (typeof four)[number], (typeof four)[number], (typeof four)[number]];
  assert.equal(wins.kind, "binary");
  assert.ok(wins.terms.includes("Yes if the Giants win") && wins.terms.includes("If it ends in a tie, it's void"), "the home side is yes, and an NFL tie is void until the redeploy");
  assert.equal(wins.rows.tie, TIE_VOID);
  // The wells keep "The" (the chalk reads "That's right, the Giants won", 3.35); the settled lines say the team alone ("Giants won.", 3.33, 3.40).
  assert.deepEqual(wins.outcomeWords, ["The Giants won", "The Titans won", "Giants won.", "Titans won."]);
  assert.deepEqual([wins.name, margin.name, total.name, first.name], ["Who wins", "By how much", "Total points", "The first drive"]);
  assert.equal(margin.kind, "numeric");
  assert.deepEqual([margin.range, margin.shift, margin.outcomeLabels], [SCALES.nfl.margin, marginShift("nfl"), ["point", "points"]]);
  assert.ok(margin.terms.startsWith("Points for the Giants minus points for the Titans") && margin.terms.includes("Giants by 7 is 7") && margin.terms.includes("counts as minus 3") && margin.terms.includes("a tie is 0"), "signed, home minus away, with a tie as zero, and no possessive of a team's name (the real session read \"the Giants's\")");
  assert.deepEqual([total.range, total.typical], [SCALES.nfl.total, SCALES.nfl.totalTypical]);
  const nhl = templatesFor({ ...game, sport: "nhl" });
  assert.ok(!nhl[0]!.terms.includes("tie") && nhl[0]!.terms.includes("shootout included") && nhl[0]!.rows.tie === null, "hockey plays on: no tie line");
  assert.deepEqual([UNIT.mlb.plural, UNIT.nhl.plural], ["runs", "goals"]);
  assert.deepEqual([SLIDER_REACH.nfl, SLIDER_REACH.nba, SLIDER_REACH.mlb, SLIDER_REACH.nhl], [35, 30, 8, 5], "the margin's reach either way on the line (3.40)");
  assert.equal(expectedEnd("nfl", new Date("2026-09-27T17:00:00Z")).toISOString(), "2026-09-27T20:15:00.000Z");
  assert.deepEqual([first.decidedByScore, first.decidedByFeed, first.kind], [false, true, "categorical"], "the score cannot answer the first drive; the play-by-play settles it");
  assert.deepEqual(first.outcomeLabels, [...DRIVE_ANSWERS]);
  assert.ok(first.terms.includes("If nobody votes, the play-by-play settles it.") && first.terms.includes("counts as Something else"));
});

test("a final scores each question: the home side's win is yes, a tie voids who-wins until the redeploy, the margin is signed and shifted and said in words, the total is the sum", () => {
  const wins = { key: "home_wins", shift: null, decidedByScore: true };
  const margin = { key: "margin", shift: 14n, decidedByScore: true };
  const total = { key: "total", shift: null, decidedByScore: true };
  assert.deepEqual(outcomeFor(wins, { home: 24, away: 17 }), { outcome: 1n, tie: false, floored: false });
  assert.deepEqual(outcomeFor(wins, { home: 17, away: 24 }), { outcome: 0n, tie: false, floored: false });
  assert.deepEqual(outcomeFor(wins, { home: 17, away: 17 }), { outcome: VOID_OUTCOME, tie: true, floored: false }, "the deployed contract cannot score the middle: a tie goes unsettled");
  assert.deepEqual(outcomeFor(margin, { home: 24, away: 17 }), { outcome: 21n, tie: false, floored: false }, "home by 7, stored as 7 plus the shift");
  assert.deepEqual(outcomeFor(margin, { home: 17, away: 24 }), { outcome: 7n, tie: false, floored: false }, "away by 7: 14 minus 7");
  assert.deepEqual(outcomeFor(margin, { home: 17, away: 17 }), { outcome: 14n, tie: true, floored: false }, "a tie is the shift itself, and it is an answer, not a void");
  assert.deepEqual(outcomeFor(margin, { home: 0, away: 40 }), { outcome: 0n, tie: false, floored: true }, "past the field's floor the answer floors, and says so");
  assert.deepEqual(outcomeFor(total, { home: 24, away: 17 }), { outcome: 41n, tie: false, floored: false });
  assert.equal(outcomeFor({ key: "first_drive", shift: null, decidedByScore: false }, { home: 24, away: 17 }), null, "the score does not answer the first drive");
  assert.equal(toStored(7n, 14n), 21n);
  assert.equal(toStored(-14n, 14n), 0n);
  assert.equal(toStored(-15n, 14n), null, "below the shift is as far as the field goes");
  assert.equal(fromStored(21n, 14n), 7n);
  assert.equal(marginWords(7n, "Giants", "Titans"), "Giants by 7");
  assert.equal(marginWords(-3n, "Giants", "Titans"), "Titans by 3");
  assert.equal(marginWords(0n, "Giants", "Titans"), "A tie", "never a plus or minus sign, never a half point (3.40)");
  const unit = { singular: "point", plural: "points", margin: { shift: "14", home: "Giants", away: "Titans" } };
  assert.equal(unitPhrase(21n, unit), "Giants by 7", "every number on the screen reads as a side and a figure, never the shifted number");
  assert.equal(unitPhrase(11n, unit), "Titans by 3");
  assert.equal(unitPhrase(14n, unit), "A tie");
  assert.equal(unitPhrase(14n, { singular: "point", plural: "points" }), "14 points", "a plain number question is unchanged");
  assert.equal(scoreLine({ home: 24, away: 17 }, "Giants", "Titans"), "Giants 24, Titans 17");
  assert.equal(scoreLine({ home: 17, away: 24 }, "Giants", "Titans"), "Titans 24, Giants 17", "the winner first");
});

test("the margin's axis and ruler stay centred on a tie, as wide either way as the furthest entry, the ends in words and Tie in the middle, the chip in words", () => {
  const unit = { singular: "point", plural: "points", margin: { shift: "14", home: "Giants", away: "Titans" } };
  assert.deepEqual(marginEnds([17n, 11n], 14n), { lo: 11n, hi: 17n }, "Giants by 3 and Titans by 3: three each way");
  assert.deepEqual(marginEnds([21n], 14n), { lo: 7n, hi: 21n }, "one entry at Giants by 7 draws seven each way");
  assert.deepEqual(marginEnds([14n], 14n), { lo: 13n, hi: 15n }, "a tie alone still draws a room");
  assert.deepEqual(marginEnds([0n, 40n], 14n), { lo: 0n, hi: 28n }, "never below zero, which is as far as the field goes");
  const axis = numberAxis([{ id: "a", stake: 100n, value: 17n }, { id: "b", stake: 100n, value: 11n }, { id: "c", stake: 100n, value: 15n }], unit)!;
  assert.deepEqual([axis.lo, axis.hi, axis.mode], [11n, 17n, "values"]);
  assert.deepEqual(axis.columns.map((c) => c.label), ["Titans by 3", null, null, "Tie", null, null, "Giants by 3"], "the ends in words, Tie in the middle, nothing else, and never a sign");
  assert.equal(axis.marker?.chip, "Giants by 1", "the group's number in words");
  assert.ok(!axis.columns.some((c) => c.label && /[+-]\d/.test(c.label)));
  // Entries on one side only still draw the same distance the other way, so Tie is always the middle label.
  const lopsided = numberAxis([{ id: "a", stake: 100n, value: 21n }, { id: "b", stake: 100n, value: 15n }], unit)!;
  assert.deepEqual([lopsided.lo, lopsided.hi, lopsided.mode], [7n, 21n, "slices"], "Giants by 7 and by 1: seven each way, not from the lowest entry to the highest");
  assert.deepEqual([lopsided.columns[0]!.label, lopsided.columns[4]!.label, lopsided.columns[9]!.label], ["Titans by 7", "Tie", "Giants by 7"]);
  const r = ruler([{ id: "a", value: 17n }, { id: "b", value: 11n }], 21n, unit)!;
  assert.deepEqual([r.lo, r.hi, r.leftLabel, r.midLabel, r.rightLabel, r.answer?.xPermille], [7n, 21n, "Titans by 7", "Tie", "Giants by 7", 1000], "the ruler as wide either way as the furthest pin or the answer");
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
  // The first drive: one source only, three days on once it stood a re-read; nothing recognised three days after the game was complete voids, never guesses.
  assert.deepEqual(driveBackstopDecision({ outcome: 3n, seenAt: seen, confirmedAt: at(1_800_000), completeAt: at(2 * 3_600_000), now: at(ALONE_AFTER_MS) }), { act: "settle", outcome: 3n });
  assert.deepEqual(driveBackstopDecision({ outcome: 3n, seenAt: seen, confirmedAt: at(1_800_000), completeAt: at(2 * 3_600_000), now: at(AGREE_AFTER_MS) }), { act: "wait" }, "not at a day: there is no second source to agree with");
  assert.deepEqual(driveBackstopDecision({ outcome: 3n, seenAt: seen, confirmedAt: null, completeAt: at(2 * 3_600_000), now: at(ALONE_AFTER_MS) }), { act: "wait" }, "never on a drive that has not stood a re-read");
  assert.deepEqual(driveBackstopDecision({ outcome: null, seenAt: null, confirmedAt: null, completeAt: seen, now: at(ALONE_AFTER_MS) }), { act: "void", why: "unknown" }, "a word the adapter does not know, three days after the game: void, against nobody");
  assert.deepEqual(driveBackstopDecision({ outcome: null, seenAt: null, confirmedAt: null, completeAt: null, now: at(ALONE_AFTER_MS) }), { act: "wait" }, "the game is not over yet");
});

test("the moment a backstop acts, and which: the final score a day after the final with a second result, three days without one, the play-by-play three days on, the tiebreaker a day after due or locked, closing for good at its deadline", () => {
  const locked = new Date("2026-09-27T21:00:00Z");
  const due = new Date("2026-09-27T17:00:00Z");
  const seen = new Date("2026-09-27T20:30:00Z");
  const final = { home: 24, away: 17 };
  const score = { decidedByScore: true, decidedByFeed: true, key: "home_wins" };
  assert.deepEqual(backstopMoment({ stalemate: "arbitrate", pace: "dare", lockedAt: locked, resolvesBy: due, template: score, game: { finalSeenAt: seen, check: final, firstDriveSeenAt: null, firstDriveResult: null }, final }), { flavour: "score", actsAt: new Date(seen.getTime() + AGREE_AFTER_MS) });
  assert.deepEqual(backstopMoment({ stalemate: "arbitrate", pace: "dare", lockedAt: locked, resolvesBy: due, template: score, game: { finalSeenAt: seen, check: { home: 24, away: 20 }, firstDriveSeenAt: null, firstDriveResult: null }, final }), { flavour: "score_conflict", actsAt: new Date(seen.getTime() + AGREE_AFTER_MS) }, "the two results disagree: the warning says so");
  assert.deepEqual(backstopMoment({ stalemate: "arbitrate", pace: "dare", lockedAt: locked, resolvesBy: due, template: score, game: { finalSeenAt: seen, check: null, firstDriveSeenAt: null, firstDriveResult: null }, final }), { flavour: "score", actsAt: new Date(seen.getTime() + ALONE_AFTER_MS) }, "no second result: three days");
  assert.equal(backstopMoment({ stalemate: "arbitrate", pace: "dare", lockedAt: locked, resolvesBy: due, template: score, game: { finalSeenAt: null, check: null, firstDriveSeenAt: null, firstDriveResult: null }, final: null }), null, "no final yet: nothing on its way");
  const drive = { decidedByScore: false, decidedByFeed: true, key: "first_drive" };
  assert.deepEqual(backstopMoment({ stalemate: "arbitrate", pace: "dare", lockedAt: locked, resolvesBy: due, template: drive, game: { finalSeenAt: seen, check: null, firstDriveSeenAt: due, firstDriveResult: "Turnover" }, final }), { flavour: "drive", actsAt: new Date(due.getTime() + ALONE_AFTER_MS) });
  assert.deepEqual(backstopMoment({ stalemate: "arbitrate", pace: "dare", lockedAt: locked, resolvesBy: due, template: null, game: null, final: null }), { flavour: "tiebreaker", actsAt: new Date(locked.getTime() + 24 * 3_600_000) }, "a day after it was locked, which was after it was due");
  assert.deepEqual(backstopMoment({ stalemate: "arbitrate", pace: "argument", lockedAt: locked, resolvesBy: null, template: null, game: null, final: null }), { flavour: "tiebreaker", actsAt: new Date(locked.getTime() + 24 * 3_600_000) });
  assert.deepEqual(backstopMoment({ stalemate: "void", pace: "dare", lockedAt: locked, resolvesBy: due, template: null, game: null, final: null }), { flavour: "void", actsAt: due });
  assert.equal(backstopMoment({ stalemate: "arbitrate", pace: "dare", lockedAt: null, resolvesBy: due, template: null, game: null, final: null }), null, "nothing before lock");
});

test("the one warning goes six hours before the backstop acts, and never at night: between 11pm and 8am in the person's zone it goes at 8pm the evening before", () => {
  const zone = "America/New_York";
  // Acts at 7:45pm: the warning at 1:45pm the same day.
  const afternoon = new Date("2026-09-28T23:45:00Z");
  assert.equal(warningSendTime(afternoon, zone).toISOString(), "2026-09-28T17:45:00.000Z");
  // Acts at 3am: six hours before is 9pm, which is fine.
  assert.equal(warningSendTime(new Date("2026-09-29T07:00:00Z"), zone).toISOString(), "2026-09-29T01:00:00.000Z");
  // Acts at 6am: six hours before is midnight, so 8pm the evening before.
  assert.equal(warningSendTime(new Date("2026-09-29T10:00:00Z"), zone).toISOString(), "2026-09-29T00:00:00.000Z");
  // Acts at 11am: six hours before is 5am, so 8pm the evening before.
  assert.equal(warningSendTime(new Date("2026-09-29T15:00:00Z"), zone).toISOString(), "2026-09-29T00:00:00.000Z");
  // Acts at 5:30am: six hours before is 11:30pm, so 8pm that same evening.
  assert.equal(warningSendTime(new Date("2026-09-29T09:30:00Z"), zone).toISOString(), "2026-09-29T00:00:00.000Z");
  // Acts at 2pm: 8am on the dot is daytime.
  assert.equal(warningSendTime(new Date("2026-09-29T18:00:00Z"), zone).toISOString(), "2026-09-29T12:00:00.000Z");
  // The same rule in another zone: Tokyo, acting at 9am local, is warned at 8pm the evening before local.
  assert.equal(warningSendTime(new Date("2026-09-29T00:00:00Z"), "Asia/Tokyo").toISOString(), "2026-09-28T11:00:00.000Z");
  const now = new Date("2026-09-28T16:00:00Z");
  assert.equal(clockWithDay(new Date("2026-09-28T23:45:00Z"), now, zone), "at 7:45pm");
  assert.equal(clockWithDay(new Date("2026-09-29T15:00:00Z"), now, zone), "tomorrow at 11am");
  assert.equal(clockWithDay(new Date("2026-10-01T15:00:00Z"), now, zone), "Thursday at 11am");
  assert.equal(clockWithDay(new Date("2026-10-12T15:00:00Z"), now, zone), "Oct 12 at 11am");
});

test("the notices say what 4.10 says: the backstop everyone agreed to about to act, and how it acted; never a number, never time running out, and the feed's void says it counts against nobody", () => {
  const now = new Date("2026-09-28T16:00:00Z");
  const actsAt = new Date("2026-09-28T23:45:00Z");
  const base = { title: "Who wins, Titans or Giants?", actsAt, now, zone: "America/New_York", marketId: "m", appUrl: "https://x" };
  assert.equal(backstopWarningNotice({ ...base, flavour: "score" }).body, "Nobody has voted. The final score you all agreed to settles it at 7:45pm.");
  assert.equal(backstopWarningNotice({ ...base, flavour: "score_conflict" }).body, "Nobody has voted, and the two results we check disagree. At 7:45pm it becomes void, as the terms said.");
  assert.equal(backstopWarningNotice({ ...base, flavour: "tiebreaker" }).body, "It hasn’t been decided. At 7:45pm the tiebreaker everyone agreed to makes the call.");
  assert.equal(backstopWarningNotice({ ...base, flavour: "void" }).body, "It hasn’t been decided. At 7:45pm it closes for good, as everyone agreed, and nothing changes hands.");
  assert.equal(backstopWarningNotice({ ...base, flavour: "drive" }).body, "Nobody has voted. The play-by-play you all agreed to settles it at 7:45pm.");
  for (const flavour of ["score", "score_conflict", "drive", "tiebreaker", "void"] as const) {
    const n = backstopWarningNotice({ ...base, flavour });
    assert.equal(n.title, base.title, "the question is the title");
    assert.ok(n.url.endsWith("#ballot") && n.email?.subject === n.body && n.email.footer.includes("the only one before it settles"), flavour);
    assert.ok(!/running out|hurry|last chance|\d+ (hours|minutes)/i.test(n.body), "never that time is running out");
  }
  const results = {
    agreed: "Decided by the final score, as everyone agreed.",
    alone: "Decided by the final score, as everyone agreed. It held for three days.",
    conflict: "Void. The two results we check disagreed, so nothing changes hands, and it counts against nobody.",
    tiebreaker: "Decided by the tiebreaker everyone agreed to.",
    tiebreaker_void: "Void. The tiebreaker everyone agreed to found the terms don’t decide it, so nothing changes hands.",
    expired: "Closed for good. Nobody said what happened, so nothing changes hands.",
  } as const;
  for (const [how, body] of Object.entries(results)) {
    const n = backstopResultNotice({ title: base.title, how: how as keyof typeof results, marketId: "m", appUrl: "https://x" });
    assert.equal(n.body, body, how);
    assert.ok(!/\d/.test(n.body), `${how}: never a number`);
    assert.equal(n.title, base.title);
  }
  assert.ok(backstopResultNotice({ title: "t", how: "drive_unknown", marketId: "m", appUrl: "https://x" }).body.includes("counts against nobody"));
  assert.ok(!backstopResultNotice({ title: "t", how: "tiebreaker_void", marketId: "m", appUrl: "https://x" }).body.includes("nobody"), "the tiebreaker's void counts against the asker, and its notice does not say so");
});

test("the two backstop notices go by push, else email, never both", async () => {
  const calls: string[] = [];
  const push = (ok: boolean) => async () => (calls.push("push"), ok);
  const email = (ok: boolean) => async () => (calls.push("email"), ok);
  assert.deepEqual(await pushElseEmail(push(true), email(true)), { push: true, email: false });
  assert.deepEqual(calls, ["push"], "push took it: email is never asked");
  calls.length = 0;
  assert.deepEqual(await pushElseEmail(push(false), email(true)), { push: false, email: true });
  assert.deepEqual(calls, ["push", "email"], "push had nowhere to go: email");
  calls.length = 0;
  assert.deepEqual(await pushElseEmail(async () => { throw new Error("down"); }, email(false)), { push: false, email: false }, "a channel that throws is a channel that took nothing");
});

test("a feed settlement counts clean, and a feed void counts against nobody", () => {
  assert.deepEqual(cleanResolutionOf([{ outcome: 1n, by: "feed" }, { outcome: VOID_OUTCOME, by: "feed" }, { outcome: VOID_OUTCOME, by: "quorum" }, { outcome: 0n, by: "quorum" }]), { ended: 3, clean: 2 }, "the final score's void is in neither number; the group's void counts against the asker");
});

test("team stamps (1.7, 3.40): the abbreviation on the team's colour in whichever ink has more contrast, the two stamps growing and shrinking with the lean, and the words for a lean", () => {
  assert.equal(stampInk("003594"), "#f2ede3", "cream on navy");
  assert.equal(stampInk("ffb612"), "#121110", "graphite on gold");
  assert.equal(stampInk(null), "#f2ede3");
  assert.deepEqual([stampGlyph(28, "KC"), stampGlyph(28, "BUF")], [12, 10], "0.42 for two letters, 0.36 for three");
  assert.deepEqual(sliderStamps(0.5), { left: 39, right: 39 }, "equal at the middle");
  assert.deepEqual(sliderStamps(1), { left: 18, right: 60 }, "60 against 18 at an end");
  assert.deepEqual(sliderStamps(0), { left: 60, right: 18 });
  assert.equal(leanPill(70, "Chiefs", "Bills"), "Bills 70%");
  assert.equal(leanPill(30, "Chiefs", "Bills"), "Chiefs 70%", "the team the thumb leans to and its chance");
  assert.equal(leanPill(50, "Chiefs", "Bills"), "Even");
  assert.deepEqual([0, 10, 30, 50, 70, 90, 100].map((v) => leanBand(v, "Chiefs", "Bills")), ["Chiefs, no doubt", "Chiefs, surely", "Leaning Chiefs", "Close to even", "Leaning Bills", "Bills, surely", "Bills, no doubt"]);
  assert.equal(saidLean(55, "Chiefs", "Bills"), "said Bills 55%");
  assert.equal(saidLean(45, "Chiefs", "Bills"), "said Chiefs 55%", "a lean the other way reads the other team");
  assert.equal(saidLean(50, "Chiefs", "Bills"), "said even");
});

test("the game page's cards say where each question stands, with no number until you are in (3.33)", () => {
  const base = { key: "home_wins" as const, state: "open" as const, viewerIn: false, mine: null, inCount: 3, votesCast: 0, proposed: false, voted: false, teams: { away: "Chiefs", home: "Bills" }, unit: null, answers: null, outcomeWords: null, feedEnding: null, resolvedBy: null, closest: null, votingEnds: null };
  assert.deepEqual(cardMeta(base), { mark: "open", text: "Closes at kickoff · 3 in" }, "nobody sees where anyone landed before they are in, and nobody is counted against a number asked");
  assert.deepEqual(cardMeta({ ...base, closes: "Closes 5 minutes after the first call" }), { mark: "open", text: "Closes 5 minutes after the first call · 3 in" }, "a question started after the start says its own close");
  assert.deepEqual(cardMeta({ ...base, viewerIn: true, mine: 7000n, inCount: 5 }), { mark: "in", text: "You’re in at Bills 70% · 5 in" });
  const margin = { singular: "point", plural: "points", margin: { shift: "14", home: "Bills", away: "Chiefs" } };
  assert.equal(yourEntry({ key: "margin", mine: 21n, teams: null, unit: margin, answers: null }), "You’re in at Bills by 7");
  assert.equal(yourEntry({ key: "total", mine: 41n, teams: null, unit: { singular: "point", plural: "points" }, answers: null }), "You’re in at 41 points");
  assert.equal(yourEntry({ key: "first_drive", mine: 1n, teams: null, unit: null, answers: [...DRIVE_ANSWERS] }), "You’re in: Field goal");
  // Calls are in (3.33 as the fifteenth session drew it): the live score from the first pitch, the mark alone while it can't be read, and the wait once the game is over.
  const closed = { ...base, state: "locked" as const, votingOpen: false };
  assert.deepEqual(cardMeta({ ...closed, live: "Red Sox 5, Yankees 2 · top 7th" }), { mark: "locked", text: "Red Sox 5, Yankees 2 · top 7th" });
  assert.deepEqual(cardMeta({ ...closed, live: null }), { mark: "locked", text: "Calls are in" });
  assert.deepEqual(cardMeta({ ...closed, live: "Red Sox 5, Yankees 2 · top 7th", gameOver: true }), { mark: "locked", text: "Waiting on the final score" }, "over with no final: the wait, never a stale score");
  assert.deepEqual(cardMeta({ ...closed, key: "first_drive", gameOver: true }), { mark: "locked", text: "Waiting on the play-by-play" });
  assert.deepEqual(cardMeta({ ...base, state: "locked", votingOpen: true }), { mark: "voting", text: "Waiting on the final score" }, "the vote open with nothing proposed yet is still in voting");
  // In voting the meta line is the clock alone (3.33), never a count beside it; a void's reason is three words or fewer.
  assert.deepEqual(cardMeta({ ...base, state: "locked", votesCast: 2, votingEnds: "Mon 7:45pm" }), { mark: "voting", text: "Voting ends Mon 7:45pm" });
  assert.deepEqual(cardMeta({ ...base, state: "locked", votesCast: 0, proposed: true, votingEnds: null }), { mark: "voting", text: "The final score is in" });
  assert.deepEqual(cardMeta({ ...base, state: "voided", resolvedBy: "arbitration" }), { mark: "voided", text: "Void · unclear terms" });
  for (const s of [cardMeta({ ...base, state: "voided", feedEnding: "conflict" }).text, cardMeta({ ...base, state: "voided", feedEnding: "drive_unknown" }).text, cardMeta({ ...base, state: "voided", resolvedBy: "arbitration" }).text]) assert.ok(s.replace(/^Void · /, "").split(" ").length <= 3, s);
  assert.deepEqual(cardMeta({ ...base, state: "resolved", outcomeWords: "Bills won", closest: { name: "You", off: null } }), { mark: "resolved", text: "Bills won · you were closest" });
  assert.deepEqual(cardMeta({ ...base, key: "margin", state: "resolved", outcomeWords: "Bills by 7", closest: { name: "Theo", off: "2" } }), { mark: "resolved", text: "Bills by 7 · Theo was off by 2" });
  assert.deepEqual(cardMeta({ ...base, key: "first_drive", state: "resolved", outcomeWords: "Field goal", closest: { name: "You", off: null } }), { mark: "resolved", text: "Field goal · you called it" });
  assert.deepEqual(cardMeta({ ...base, state: "voided", feedEnding: "conflict" }), { mark: "voided", text: "Void · results disagreed" });
  assert.deepEqual(cardMeta({ ...base, state: "voided", feedEnding: "tie" }), { mark: "voided", text: "Void · a tie" });
  assert.deepEqual(cardMeta({ ...base, state: "draft" }), { mark: "draft", text: "You never sent this one" });
  assert.equal(lineT({ key: "home_wins", value: 7000n, shift: null, reach: 35 }), 0.7);
  assert.equal(lineT({ key: "margin", value: 21n, shift: 14n, reach: 35 }), 0.6, "Bills by 7 across a reach of 35 either way");
  assert.equal(lineT({ key: "margin", value: 0n, shift: 14n, reach: 5 }), 0, "past the reach sits on the end");
});

test("the game page's who's-in row counts everyone in on any question, says nobody's in before the first entry, and makes share the chalk while its asker is alone (3.42; never a second number)", () => {
  const row = (inIds: string[], startedBy: string | null = "me") => gameWhosIn({ inIds, viewerId: "me", startedBy });
  assert.deepEqual(row([]), { count: "Nobody’s in yet", chalk: true }, "a game's asker starts out in nothing: never 0 of 1 in, and sending it is the only move");
  assert.deepEqual(row(["me"]), { count: "Just you so far", chalk: true }, "only the asker is in");
  assert.deepEqual(row(["me", "gabe", "me", "gabe"]), { count: "2 in", chalk: false }, "someone in on two questions is one person in");
  assert.deepEqual(row(["gabe"]), { count: "1 in", chalk: false }, "somebody else is in: share is an icon again");
  assert.deepEqual(row(["me", "gabe", "a-ghost"]), { count: "3 in", chalk: false }, "someone in from the link counts like anyone");
  assert.deepEqual(row(["me"], "gabe"), { count: "Just you so far", chalk: false }, "the chalk is the asker's: someone else started this game");
  assert.deepEqual(row([], "gabe"), { count: "Nobody’s in yet", chalk: false });
});

test("a called-off question never happened: it leaves the game page, frees its place on the menu, and makes no set one of the game's (3.15)", () => {
  const q = (id: string, key: string, signed: boolean, resolvedBy: string | null = null) => ({ dare: { id, creatorSignature: signed ? "0x01" : null, resolvedBy }, template: { key } });
  const ids = (rows: Array<ReturnType<typeof q>>) => onePerQuestion(rows).map((r) => r.dare.id);
  // Rows arrive in the menu's order, latest first within a question.
  assert.deepEqual(ids([q("w2", "home_wins", true), q("w1", "home_wins", true), q("m1", "margin", true)]), ["w2", "m1"], "one per question, the latest opened one");
  assert.deepEqual(ids([q("w-draft", "home_wins", false), q("w1", "home_wins", true)]), ["w1"], "a draft only beside nothing opened for that question");
  assert.deepEqual(ids([q("w-draft", "home_wins", false)]), ["w-draft"]);
  assert.deepEqual(ids([q("w-off", "home_wins", true, "removed"), q("m1", "margin", true)]), ["m1"], "called off: not a card, and Who wins can be asked again");
  assert.deepEqual(ids([q("w-off", "home_wins", true, "removed"), q("w1", "home_wins", true)]), ["w1"], "the one asked before it still stands");
  assert.deepEqual(ids([q("w-void", "home_wins", true, "quorum"), q("t-exp", "total", true, "expired")]), ["w-void", "t-exp"], "a void the people called, or an expiry, happened and stays");
  const at = (h: number) => new Date(Date.UTC(2026, 8, 29, h));
  const on = setsOnGames([
    { gameId: "g1", groupId: "crew", createdAt: at(10), resolvedBy: null },
    { gameId: "g1", groupId: "crew", createdAt: at(12), resolvedBy: null },
    { gameId: "g1", groupId: "two", createdAt: at(11), resolvedBy: null },
    { gameId: "g1", groupId: "one", createdAt: at(13), resolvedBy: "removed" },
    { gameId: "g2", groupId: "two", createdAt: at(9), resolvedBy: "removed" },
    { gameId: "g2", groupId: "two", createdAt: at(8), resolvedBy: "feed" },
  ]);
  assert.deepEqual(on.get("g1"), [{ groupId: "crew", lastAt: at(12) }, { groupId: "two", lastAt: at(11) }], "most recent first; the set whose only question was called off is not on the game");
  assert.deepEqual(on.get("g2"), [{ groupId: "two", lastAt: at(8) }], "a called-off question is not what a set was last asked");
  assert.equal(setsOnGames([{ gameId: "g3", groupId: "one", createdAt: at(1), resolvedBy: "removed" }]).has("g3"), false, "nothing but a called-off question: the game has nobody's page, so it opens as the start");
});

test("a game with more than one question in the same set of people is one row on Now, in its most pressing question's section (4.7)", () => {
  const away = { abbr: "KC", name: "Chiefs", color: null };
  const home = { abbr: "BUF", name: "Bills", color: null };
  const games = new Map([["a", { gameId: "g", name: "Chiefs at Bills", away, home, score: null }], ["b", { gameId: "g", name: "Chiefs at Bills", away, home, score: null }], ["c", { gameId: "g", name: "Chiefs at Bills", away, home, score: "Bills 24, Chiefs 17" }], ["d", { gameId: "g", name: "Chiefs at Bills", away, home, score: null }]]);
  const t = new Date("2026-09-27T17:00:00Z");
  const need = (key: string, kind: "vote" | "enter", groupId: string) => ({ kind, key, context: kind === "vote" ? "Voting ends at 7:45pm" : "Closes tonight · 3 of 6 in", deadline: t, since: t, href: `/m/${key}`, verb: kind === "vote" ? "Vote" : "Enter", groupId, state: "open" as const });
  // Two questions of one game in one set, one to vote on and one to enter: one row, the vote's verb, and the count.
  const one = collapseGames({ needs: [need("a", "enter", "s1"), need("b", "vote", "s1")], running: [], over: [] }, games);
  assert.equal(one.needs.length, 1);
  const row = one.needs[0]!;
  assert.equal(row.kind, "game");
  if (row.kind === "game") {
    assert.deepEqual([row.subject, row.verb, row.context, row.href, row.game.questionHref, row.pressing], ["Chiefs at Bills", "Vote", "Voting ends at 7:45pm · 2 questions", "/on/g?g=s1", "/m/b", "vote"]);
  }
  // The same game in another set joins the row (one row per game, whatever the sets, 3.15 decided 2026-10-02), with the most pressing question's set in the address; a game with one question is that question's ordinary row.
  const two = collapseGames({ needs: [need("a", "enter", "s1"), need("b", "vote", "s1"), need("d", "enter", "s2")], running: [], over: [] }, new Map([...games, ["d", { gameId: "g", name: "Chiefs at Bills", away, home, score: null }]]));
  assert.deepEqual(two.needs.map((r) => r.kind), ["game"]);
  if (two.needs[0]?.kind === "game") assert.deepEqual([two.needs[0].context, two.needs[0].href], ["Voting ends at 7:45pm · 3 questions", "/on/g?g=s1"]);
  const other = collapseGames({ needs: [need("a", "enter", "s1"), need("e", "enter", "s2")], running: [], over: [] }, new Map([...games, ["e", { gameId: "h", name: "Jets at Bears", away, home, score: null }]]));
  assert.deepEqual(other.needs.map((r) => r.kind), ["enter", "enter"], "two games with one question each stay two ordinary rows");
  // Over: one row in Just happened with the final score.
  const over = collapseGames({ needs: [], running: [], over: [{ dare: { id: "c", groupId: "s1" }, at: t, state: "resolved" }, { dare: { id: "a", groupId: "s1" }, at: t, state: "resolved" }] }, games);
  assert.deepEqual([over.over.length, over.happened.length, over.happened[0]?.meta], [0, 1, "Final: Bills 24, Chiefs 17"]);
});

test("a game's row on Now swipes as one (3.15, ruled 2026-09-27): removable only when every question of the game here is this person's alone, and its questions ride the row to remove or archive together", () => {
  const away = { abbr: "KC", name: "Chiefs", color: null };
  const home = { abbr: "BUF", name: "Bills", color: null };
  const games = new Map([["a", { gameId: "g", name: "Chiefs at Bills", away, home, score: null }], ["b", { gameId: "g", name: "Chiefs at Bills", away, home, score: null }], ["c", { gameId: "g", name: "Chiefs at Bills", away, home, score: "Bills 24, Chiefs 17" }]]);
  const t = new Date("2026-09-27T17:00:00Z");
  const run = (id: string, removable?: true) => ({ id, caption: "You’re in at 70% · just you so far", state: "in" as const, groupId: "s1", ...(removable ? { removable } : {}) });
  // Both questions this person's alone: one row, removable, carrying both.
  const alone = collapseGames({ needs: [], running: [run("a", true), run("b", true)], over: [] }, games);
  assert.equal(alone.running.length, 1);
  const row = alone.running[0]!;
  assert.deepEqual([row.removable, "game" in row && row.game ? row.game.ids : null], [true, ["a", "b"]], "the game's row removes both, as one");
  // Someone else in one of them: the row stays put.
  const shared = collapseGames({ needs: [], running: [run("a", true), run("b")], over: [] }, games);
  assert.equal(shared.running[0]?.removable, undefined, "nobody else may be in any of its questions");
  // A question of the game still needing this person (asked by someone else): the game is a needs row, not a running one, so nothing to remove there either.
  const need = { kind: "enter" as const, key: "c", context: "Closes tonight", deadline: t, since: t, href: "/m/c", verb: "Enter", groupId: "s1", state: "open" as const };
  const mixed = collapseGames({ needs: [need], running: [run("a", true)], over: [] }, games);
  assert.deepEqual([mixed.needs.length, mixed.running.length], [1, 0]);
  // Over: the game's finished questions ride the Just happened row, to archive together.
  const over = collapseGames({ needs: [], running: [], over: [{ dare: { id: "c", groupId: "s1" }, at: t, state: "resolved" }, { dare: { id: "a", groupId: "s1" }, at: t, state: "resolved" }] }, games);
  assert.deepEqual(over.happened[0]?.ids, ["c", "a"], "both questions, for the archive");
});

test("the menu's short names are written once: menuName says the four, the total in the sport's unit, every template reads its name from it, and none is the question itself", () => {
  assert.deepEqual([menuName("home_wins", "nfl"), menuName("margin", "nfl"), menuName("total", "nfl"), menuName("first_drive", "nfl")], ["Who wins", "By how much", "Total points", "The first drive"], "3.33's first column");
  assert.deepEqual([menuName("total", "mlb"), menuName("total", "nba"), menuName("total", "nhl")], ["Total runs", "Total points", "Total goals"], "the total says what the sport counts");
  const game = { home: { short: "Giants" }, away: { short: "Titans" }, seasonType: 2 };
  for (const sport of SPORTS) {
    const templates = templatesFor({ ...game, sport });
    assert.ok(templates.length >= 3);
    for (const t of templates) {
      assert.equal(t.name, menuName(t.key, sport), `${sport} ${t.key}: the menu row and the tile read one name`);
      assert.ok(!t.name.includes("?") && !t.name.includes("Giants") && !t.name.includes("Titans") && t.name !== t.title, `${sport} ${t.key}: a short name, never the question (3.27: the rows are the menu's names, never the full questions)`);
      assert.ok(t.name.length <= 15, `${sport} ${t.key}: "${t.name}" is short enough to stand as one row of the tile at 40px`);
    }
  }
});

test("a game's tile fits the picture: every height a constant, two to four rows inside the 48px bands, the name on two lines broken after at, and its size stepping with the longest line", () => {
  // The column is centred in the 630px square; inside the two bands means at most 534 tall, whatever the game.
  for (const n of [2, 3, 4]) assert.ok(gameTileHeight(n, true) <= tileSize.height - 2 * GAME_TILE.band, `${n} rows with the close time: ${gameTileHeight(n, true)}px is inside the bands`);
  assert.deepEqual([gameTileHeight(2, true), gameTileHeight(3, true), gameTileHeight(4, true)], [416, 470, 524], "the hand figures: 316 plus 46n plus 8(n - 1)");
  assert.equal(gameTileHeight(2, false), 340, "once the game has started the close time and its gap are gone");
  assert.equal(gameTileHeight(6, true), gameTileHeight(4, true), "never more than four rows, whatever was asked");
  assert.equal(GAME_TILE.stamp + GAME_TILE.stampGap + GAME_TILE.nameBox + GAME_TILE.stampGap + GAME_TILE.stamp, 630, "the game row adds up to the square: a stamp at each edge, the name box between");
  assert.equal(2 * GAME_TILE.nameLine, GAME_TILE.name, "two lines fill the game row exactly");
  assert.deepEqual(gameNameLines("Red Sox", "Yankees"), ["Red Sox at", "Yankees"], "broken after at, the away side first (3.40)");
  assert.equal(gameNameSize("Red Sox", "Yankees"), 52, "both lines within 11 characters: 3.27's 52px");
  assert.equal(gameNameSize("Chiefs", "Bills"), 52);
  assert.equal(gameNameSize("Golden Knights", "Blue Jackets"), 44, "a line past 11 steps down to 44");
  assert.equal(gameNameSize("Trail Blazers", "Timberwolves"), 44);
  assert.equal(gameNameSize("Something Longer", "Anything"), 36, "a line past 17 steps down again, so nothing ever wraps or overruns the box");
});

test("who asked on a tile is a first name and nothing else, and an account with no name reads A friend whole, never its first word", () => {
  assert.equal(askerName("Priya Raman"), "Priya");
  assert.equal(askerName("Dev"), "Dev");
  assert.equal(askerName(undefined), "A friend", "no account row: A friend asks, never A asks");
  assert.equal(askerName(null), "A friend");
  assert.equal(askerName(""), "A friend");
  assert.equal(askerName("   "), "A friend", "a name that is only spaces is no name");
  assert.ok(askerName("Bartholomew-Alexander Fitzgerald").length <= 18, "clipped as every name on a card is");
});

test("the consent line on a game's terms step is true for every question chosen: the score's alone, the play-by-play's alone, and both in one line with the first drive among them", () => {
  assert.equal(consentFor(["home_wins", "margin", "total"]), CONSENT, "questions the score settles: the score's line");
  assert.equal(consentFor(["first_drive"]), DRIVE_CONSENT, "the first drive alone: the play-by-play's line");
  assert.equal(consentFor(["home_wins", "first_drive"]), BOTH_CONSENT, "both kinds: one line that says both");
  assert.equal(consentFor([]), CONSENT, "nothing chosen reads as the common case");
  assert.ok(BOTH_CONSENT.startsWith("If nobody votes, ") && BOTH_CONSENT.includes("the final score settles") && BOTH_CONSENT.includes("the play-by-play settles the first drive"), "the line names both settlers and what each settles");
  for (const banned of ["spread", "moneyline", "wallet", "signature", "official"]) assert.ok(!BOTH_CONSENT.toLowerCase().includes(banned), `never "${banned}"`);
});

test("two scoreboards that name the same winner agree on who wins, though one has the loser's score wrong; the margin and the total still void", () => {
  const whoWins = { key: "home_wins", shift: null, decidedByScore: true };
  const margin = { key: "margin", shift: 30n, decidedByScore: true };
  const total = { key: "total", shift: null, decidedByScore: true };
  const espn = { home: 9, away: 2 };
  const check = { home: 9, away: 0 };
  assert.equal(outcomesAgree(whoWins, espn, check), true, "the Yankees won by either count");
  assert.equal(outcomesAgree(whoWins, espn, { home: 1, away: 2 }), false, "a different winner is a real conflict");
  assert.equal(outcomesAgree(margin, espn, check), false, "by 7 and by 9 are different answers");
  assert.equal(outcomesAgree(total, espn, check), false, "11 and 9 are different answers");
  assert.equal(outcomesAgree({ key: "first_drive", shift: null, decidedByScore: false }, espn, check), false, "a question the score does not decide compares the whole final");
  const seen = new Date("2026-10-03T23:46:00Z");
  const at = new Date(seen.getTime() + AGREE_AFTER_MS);
  assert.deepEqual(backstopDecision({ finalSeenAt: seen, confirmedAt: seen, final: espn, check, now: at, same: (a, b) => outcomesAgree(whoWins, a, b) }), { act: "settle", final: espn, alone: false }, "settled on the scoreboard's final, a day on");
  assert.deepEqual(backstopDecision({ finalSeenAt: seen, confirmedAt: seen, final: espn, check, now: at }), { act: "void", why: "conflict" }, "without the question's own rule, two different finals still void");
});
