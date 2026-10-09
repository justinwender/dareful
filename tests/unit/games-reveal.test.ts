/**
 * The games-and-the-reveal round (2026-10-07): every question with two or more in kept on the chain with exactly its
 * people in as voters (section 0), the stretch between the close and the vote (calls are in, it's happened, the reveal
 * and the roll call), the live score from the recorded scoreboards, questions started while a game is on, the game
 * named in a question asked elsewhere, and the tally on pull-to-refresh. Pure rules only; the database's side is in
 * tests/db/games-reveal.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { groupOnchainId, questionGroupOnchainId } from "@/lib/ledger/ids";
import { creatorFor, thresholdFor, whereItLocks } from "@/lib/ledger/provisional";
import { onlyThesePeople } from "@/lib/ledger/registry";
import { inItsSetsGroup } from "@/lib/ledger/closes";
import { onchainTally } from "@/lib/ledger/envio";
import { SAY_YOURSELF_AFTER_MS, votingOpen } from "@/lib/ledger/voting-open";
import { callsNeeded } from "@/lib/ledger/calls";
import { callsLine, happenedCaption, LEAVES_OUT, rollCallWords } from "@/lib/ui/calls-words";
import { bandClock } from "@/lib/ui/band";
import { CALLS_ARE_IN, FIRST_CALL_CLOSE, inCount, IT_HAPPENED } from "@/lib/ui/copy";
import { liveOf } from "@/lib/sports/live";
import { LIVE_FRESH_MS, liveIsFresh, liveLine, storedLive, whereWords } from "@/lib/sports/live-words";
import { namesTeam } from "@/lib/sports";
import { closeAfterFirstCall, FIRST_CALL_WINDOW_MS, gameIsOver } from "@/lib/ledger/markets";
import { strokesAt } from "@/components/ui/pull-tally";
import { pullTallyCss, TALLY_LOOP_MS, TALLY_STROKES, TALLY_TIMING } from "@/lib/ui/opening";
import { onItsGamePage } from "@/lib/ledger/home";
import { revealRoom } from "@/components/markets/weight-line";
import { alreadyAskedLine } from "@/lib/sports/cards";

const t0 = new Date("2026-10-07T23:00:00Z");
const ago = (ms: number) => new Date(t0.getTime() - ms);
const later = (ms: number) => new Date(t0.getTime() + ms);

test("a question's own group is its own: one id per question, never a set's, and the same id every time (section 0)", () => {
  const q = "6f0c5f8e-1b0a-4c39-9d2e-6d8a8f0c1a11";
  assert.equal(questionGroupOnchainId(q), questionGroupOnchainId(q));
  assert.notEqual(questionGroupOnchainId(q), groupOnchainId(q), "a question's group never collides with a set of the same uuid");
  assert.notEqual(questionGroupOnchainId(q), questionGroupOnchainId("6f0c5f8e-1b0a-4c39-9d2e-6d8a8f0c1a12"));
  assert.match(questionGroupOnchainId(q), /^0x[0-9a-f]{64}$/);
});

test("a question all of whose entries are signed is kept in its set's group when that is exactly its people, else in its own when someone in it signed over that, else here (section 0)", () => {
  assert.equal(whereItLocks({ setCarries: true, questionSigner: true }), "set", "the set's own group is reused whenever the chain would ask exactly the people in");
  assert.equal(whereItLocks({ setCarries: true, questionSigner: false }), "set");
  assert.equal(whereItLocks({ setCarries: false, questionSigner: true }), "question");
  assert.equal(whereItLocks({ setCarries: false, questionSigner: false }), "here", "only entries from before the round, with no signature over the question's own group");
});

test("the creator on the chain is the asker when they are in and signed, else whoever got in first and signed; guests and unsigned entries never stand (section 0)", () => {
  const sig = Buffer.from("aa", "hex");
  const at = (min: number) => new Date(t0.getTime() + min * 60_000);
  const rows = [
    { userId: null, questionSignature: null, enteredAt: at(0) },
    { userId: "ben", questionSignature: null, enteredAt: at(1) },
    { userId: "cy", questionSignature: sig, enteredAt: at(3) },
    { userId: "dee", questionSignature: sig, enteredAt: at(2) },
  ];
  assert.equal(creatorFor(rows, "ana")?.userId, "dee", "the asker is not in: the first in who signed");
  assert.equal(creatorFor([...rows, { userId: "ana", questionSignature: sig, enteredAt: at(9) }], "ana")?.userId, "ana", "the asker in and signed stands, however late");
  assert.equal(creatorFor([...rows, { userId: "ana", questionSignature: null, enteredAt: at(0) }], "ana")?.userId, "dee", "the asker in without the signature cannot");
  assert.equal(creatorFor(rows.slice(0, 2), "ana"), null, "nobody signed: nobody stands, and it is decided here");
});

test("a question's own group already on the chain is reused only when everyone registered in it is in the question (section 0)", () => {
  assert.equal(onlyThesePeople([], ["0xA"]), true, "nobody registered yet");
  assert.equal(onlyThesePeople(["0xa", "0xB"], ["0xA", "0xb", "0xc"]), true, "case aside, the registered are among the people in; the rest are added");
  assert.equal(onlyThesePeople(["0xa", "0xb", "0xd"], ["0xa", "0xb"]), false, "someone registered who is not in would be asked to vote");
});

test("netting reads only edges in a set's own group: a question's own group never cancels against anything (section 0)", () => {
  const set = "0a0a0a0a-0000-4000-8000-000000000001";
  assert.equal(inItsSetsGroup(groupOnchainId(set).toUpperCase().replace("0X", "0x"), set), true);
  assert.equal(inItsSetsGroup(questionGroupOnchainId(set), set), false);
});

test("/stats counts a question's own group as a question's, never as a set (section 0)", () => {
  const own = questionGroupOnchainId("q-1");
  const tally = onchainTally(
    {
      Obligation: [{ id: "o1" }, { id: "o2" }],
      Dare: [
        { id: "q-1", groupId: own.toUpperCase().replace("0X", "0x") },
        { id: "q-2", groupId: "0xset" },
      ],
      Member: [{ ledger: "0xA" }, { ledger: "0xa" }, { ledger: "0xb" }],
      Group: [{ id: "0xset" }, { id: own }],
    },
    questionGroupOnchainId,
  );
  assert.deepEqual(tally, { obligations: 2, questions: 2, people: 2, sets: 1, questionGroups: 1 });
});

test("the vote waits for the thing to happen: the final score on a game's question, its date otherwise, or anyone in saying so; an argument is due at once", () => {
  const closed = { pace: "dare", lockedAt: ago(3_600_000), happenedAt: null, voteAskedAt: null, resolvesBy: later(86_400_000), templateId: null };
  assert.equal(votingOpen({ ...closed, lockedAt: null }, null, t0), false, "nothing votes before the close");
  assert.equal(votingOpen(closed, null, t0), false, "closed early: calls are in, and the vote waits for its date");
  assert.equal(votingOpen({ ...closed, resolvesBy: ago(1) }, null, t0), true, "its date passed");
  assert.equal(votingOpen({ ...closed, resolvesBy: t0 }, null, t0), true, "at its date exactly");
  assert.equal(votingOpen({ ...closed, happenedAt: ago(1) }, null, t0), true, "someone in said it happened");
  assert.equal(votingOpen({ ...closed, voteAskedAt: ago(1) }, null, t0), true, "a question whose vote was already asked for before the round stays open");
  assert.equal(votingOpen({ ...closed, pace: "argument", resolvesBy: null }, null, t0), true, "an argument is due the moment both are in");
  const onGame = { ...closed, templateId: "t", resolvesBy: ago(3 * 3_600_000) };
  const playing = { finalSeenAt: null, expectedEndAt: later(3_600_000) };
  assert.equal(votingOpen(onGame, playing, t0), false, "a game's question waits for the final, whatever its close time says");
  assert.equal(votingOpen(onGame, { ...playing, finalSeenAt: ago(1) }, t0), true, "the final is in");
  assert.equal(votingOpen(onGame, { finalSeenAt: null, expectedEndAt: ago(SAY_YOURSELF_AFTER_MS) }, t0), true, "long past its end with no final: people say it themselves");
  assert.equal(votingOpen(onGame, { finalSeenAt: null, expectedEndAt: ago(SAY_YOURSELF_AFTER_MS - 1) }, t0), false);
  assert.equal(votingOpen(onGame, null, t0), false, "a game's question with its game gone waits for someone to say so");
  assert.equal(votingOpen({ ...onGame, happenedAt: ago(1) }, playing, t0), true, "and anyone in can");
});

test("calls are in closes it once as many of the people in have said so as it takes to settle a vote among them", () => {
  assert.deepEqual([2, 3, 4, 5, 6, 7].map(callsNeeded), [2, 2, 3, 3, 4, 4]);
  assert.deepEqual([2, 3, 4, 5, 6, 7].map(callsNeeded), [2, 3, 4, 5, 6, 7].map(thresholdFor), "the vote's own majority");
});

test("the close's line names who said calls are in and who could close it, never a count (3.24, 3.42)", () => {
  assert.equal(callsLine({ said: [], could: ["Gabe", "you"], need: 2, asker: false }), "When enough of you say calls are in, it closes early.");
  assert.equal(callsLine({ said: ["Theo", "Maya"], could: ["Gabe", "John", "you"], need: 1, asker: false }), "Theo and Maya say calls are in. It closes when Gabe, John or you say so too.");
  assert.equal(callsLine({ said: ["Theo"], could: ["you", "Gabe", "John", "Maya"], need: 2, asker: false }), "Theo says calls are in. It closes when two of Gabe, John, Maya and you say so too.");
  assert.equal(callsLine({ said: ["Theo"], could: ["Gabe"], need: 1, asker: false }), "Theo says calls are in. It closes when Gabe says so too.");
  assert.equal(callsLine({ said: ["You"], could: ["Tam", "Gabe"], need: 2, asker: false }), "You say calls are in. It closes when Tam and Gabe say so too.", "everyone left, named together (on the simulator it read two of Tam and Gabe)");
  assert.equal(callsLine({ said: ["Theo", "You"], could: ["Gabe"], need: 1, asker: false }), "You and Theo say calls are in. It closes when Gabe says so too.", "the viewer leads");
  assert.equal(callsLine({ said: ["You"], could: ["Gabe"], need: 1, asker: false }), "You say calls are in. It closes when Gabe says so too.");
  assert.equal(callsLine({ said: [], could: ["Gabe"], need: 2, asker: true }), LEAVES_OUT, "the asker closes it themselves: the line says what that costs");
  assert.equal(callsLine({ said: ["Theo"], could: ["Gabe"], need: 1, asker: true }), `Theo says calls are in. ${LEAVES_OUT}`);
  for (const line of [callsLine({ said: ["Theo", "Maya"], could: ["Gabe", "you"], need: 1, asker: false }), callsLine({ said: ["Theo"], could: ["Gabe", "John", "you"], need: 2, asker: false })]) assert.doesNotMatch(line, /\d/, line);
});

test("who opened the vote is named under the ballot's heading", () => {
  assert.equal(happenedCaption("Maya"), "Maya says it’s happened.");
  assert.equal(happenedCaption("You"), "You say it’s happened.");
  assert.equal(happenedCaption(null), null, "the final or the date opened it: no caption");
});

test("the roll call says what each person said, and on a game the side they leaned to (3.6)", () => {
  const teams = { away: "Chiefs", home: "Bills" };
  assert.deepEqual(rollCallWords({ kind: "binary", value: 7000n, teams: null, margin: null }), { said: "70%", side: null });
  assert.deepEqual(rollCallWords({ kind: "binary", value: 7000n, teams, margin: null }), { said: "70%", side: "Bills" });
  assert.deepEqual(rollCallWords({ kind: "binary", value: 2500n, teams, margin: null }), { said: "75%", side: "Chiefs" }, "a lean to the away side is that side's percent");
  assert.deepEqual(rollCallWords({ kind: "binary", value: 5000n, teams, margin: null }), { said: "50%", side: null }, "even has no side");
  const margin = { shift: 35n, away: "Chiefs", home: "Bills" };
  assert.deepEqual(rollCallWords({ kind: "numeric", value: 42n, teams: null, margin }), { said: "7", side: "Bills" });
  assert.deepEqual(rollCallWords({ kind: "numeric", value: 32n, teams: null, margin }), { said: "3", side: "Chiefs" });
  assert.deepEqual(rollCallWords({ kind: "numeric", value: 35n, teams: null, margin }), { said: "0", side: null }, "a tie has no side");
  assert.deepEqual(rollCallWords({ kind: "numeric", value: 1234n, teams: null, margin: null }), { said: "1,234", side: null });
});

test("the reveal's room grows by a row of faces per person stacked in one column", () => {
  assert.equal(revealRoom(0), 52);
  assert.equal(revealRoom(1), 52);
  assert.equal(revealRoom(3), 84);
});

test("the band says calls are in once closed, it's happened once the vote opens, and a started game's question waits for its first call (3.23)", () => {
  const base = { resolvedAt: null, resolvedBy: null, votes: 0, now: t0, zone: "America/New_York" };
  assert.equal(bandClock({ ...base, state: "locked", resolvesBy: later(86_400_000), votingOpen: false }), CALLS_ARE_IN);
  assert.equal(bandClock({ ...base, state: "locked", resolvesBy: ago(1), votingOpen: true }), IT_HAPPENED);
  assert.equal(bandClock({ ...base, state: "locked", resolvesBy: null, votingOpen: false }), CALLS_ARE_IN, "an argument or a first-call question with no time");
  assert.match(bandClock({ ...base, state: "locked", resolvesBy: later(86_400_000), votes: 1, votingOpen: true }) ?? "", /^Voting ends /);
  assert.equal(bandClock({ ...base, state: "open", resolvesBy: null, firstCall: true }), FIRST_CALL_CLOSE);
  assert.equal(FIRST_CALL_CLOSE, "Closes 5 minutes after the first call");
});

test("counts say how many are in and nothing else: nobody is asked by name", () => {
  assert.deepEqual([0, 1, 2, 6].map(inCount), ["nobody’s in yet", "1 in", "2 in", "6 in"]);
});

test("a question started while the game is on closes five minutes after its first call, and nothing is asked once the game is over (section 5)", () => {
  assert.equal(FIRST_CALL_WINDOW_MS, 300_000);
  assert.equal(closeAfterFirstCall(t0).toISOString(), "2026-10-07T23:05:00.000Z");
  assert.equal(gameIsOver({ finalSeenAt: null, completed: false }), false);
  assert.equal(gameIsOver({ finalSeenAt: t0, completed: false }), true);
  assert.equal(gameIsOver({ finalSeenAt: null, completed: true }), true);
});

test("a question asked elsewhere names a team only by a whole word or words of its name (section 6)", () => {
  const lightning = { short: "Lightning", name: "Tampa Bay Lightning" };
  assert.equal(namesTeam("Will the Lightning beat the Rangers tonight?", lightning), true);
  assert.equal(namesTeam("Will tampa bay lightning win", lightning), true);
  assert.equal(namesTeam("Will the lightningbolt fall", lightning), false, "never inside a word");
  assert.equal(namesTeam("Do the Mets win?", { short: "NY", name: "New York Mets" }), false, "a name of two letters is too short to say");
  assert.equal(namesTeam("Do the 49ers cover?", { short: "49ers", name: "San Francisco 49ers" }), true);
  assert.equal(namesTeam("Do the A’s win", { short: "Athletics", name: "Athletics" }), false);
});

test("a game question's every link lands on its game page with it open, keeping the move's fragment (section 4)", () => {
  assert.equal(onItsGamePage("g1", "q1", "/m/q1#ballot"), "/on/g1?q=q1#ballot");
  assert.equal(onItsGamePage("g1", "q1", "/m/q1"), "/on/g1?q=q1");
  assert.equal(onItsGamePage("g1", "q1", ""), "/on/g1?q=q1");
});

test("the live score is only shown fresh: a read past its window is the feed unavailable, and nothing shows (section 3)", () => {
  assert.equal(liveIsFresh(null, t0), false);
  assert.equal(liveIsFresh(ago(LIVE_FRESH_MS), t0), true);
  assert.equal(liveIsFresh(ago(LIVE_FRESH_MS + 1), t0), false);
  const live = { away: 5, home: 2, where: "Bottom 6th", final: false };
  assert.deepEqual(storedLive({ live, liveReadAt: ago(1000) }, t0), live);
  assert.equal(storedLive({ live, liveReadAt: ago(LIVE_FRESH_MS + 1) }, t0), null);
  assert.equal(storedLive({ live: { away: "5" }, liveReadAt: ago(1000) }, t0), null, "a row of the wrong shape shows nothing");
  assert.equal(liveLine(live, "Guardians", "White Sox"), "Guardians 5, White Sox 2", "away first, as the game's name reads");
});

// Recorded from the scoreboard while the games were being played (scratchpad captures copied into tests/fixtures/sports/live).
const live = (name: string) => JSON.parse(readFileSync(`tests/fixtures/sports/live/${name}.json`, "utf8")) as unknown;

test("baseball's words, read from recorded live scoreboards: the top and bottom of an inning, its middle and end, a delay as the score alone (3.33)", () => {
  assert.deepEqual(liveOf("mlb", live("espn-mlb-top"), "401907992"), { away: 5, home: 2, where: "Bottom 6th", final: false });
  assert.deepEqual(liveOf("mlb", live("espn-mlb-top"), "401908016"), { away: 0, home: 0, where: "Top 1st", final: false });
  assert.equal(liveOf("mlb", live("espn-mlb-middle"), "401908016")?.where, "Middle 1st");
  assert.equal(liveOf("mlb", live("espn-mlb-end"), "401907992")?.where, "End 6th");
  assert.deepEqual(liveOf("mlb", live("espn-mlb-end"), "401908016"), { away: 0, home: 1, where: "Bottom 1st", final: false });
  assert.equal(liveOf("mlb", live("espn-mlb-top"), "401907987"), null, "a game not started has no live score");
  assert.equal(liveOf("mlb", live("espn-mlb-top"), "nope"), null);
  const today = JSON.parse(readFileSync("tests/fixtures/sports/espn-mlb-today.json", "utf8")) as { events: Array<{ id: string; status: { type: { name: string } } }> };
  const delayed = today.events.find((e) => e.status.type.name === "STATUS_RAIN_DELAY");
  assert.ok(delayed, "the recorded day has a rain delay");
  const read = liveOf("mlb", today, delayed.id);
  assert.ok(read && read.where === null, "a delay has no words in the table: the score alone");
  assert.throws(() => liveOf("mlb", { nope: true }, "1"), /scoreboard/);
});

test("between quarters a basketball or football game is the score alone, read from recorded live scoreboards: the feed's 0.0 is never shown (3.33)", () => {
  assert.deepEqual(liveOf("nba", live("espn-nba-end-of-quarter"), "401914123"), { away: 91, home: 99, where: null, final: false }, "End of 3rd, STATUS_END_PERIOD over 0.0");
  assert.equal(liveOf("nba", live("espn-nba-end-of-quarter"), "401898391")?.where, "Q2 · 9:12");
  // College football stands in for the NFL here: the same scoreboard, and its end of a quarter comes as a running status.
  assert.deepEqual(liveOf("nfl", live("espn-football-end-of-quarter"), "401871066"), { away: 0, home: 7, where: null, final: false }, "End of 1st, STATUS_IN_PROGRESS over 0:00");
  assert.equal(liveOf("nfl", live("espn-football-end-of-quarter"), "401871051")?.where, "Halftime");
  assert.deepEqual(liveOf("nba", live("espn-nba-halftime"), "401914123"), { away: 65, home: 61, where: "Halftime", final: false });
});

test("hockey's words, read from a recorded live scoreboard: a period with its clock, and the break after one as its intermission (3.33)", () => {
  assert.deepEqual(liveOf("nhl", live("espn-nhl-intermission"), "401891830"), { away: 1, home: 2, where: "1st intermission", final: false });
  assert.equal(liveOf("nhl", live("espn-nhl-intermission"), "401892455")?.where, "1st period · 2:40");
  assert.equal(liveOf("nhl", live("espn-nhl-intermission"), "401892456"), null, "not started");
});

test("the sport's words for where a game is, by the feed's status (3.33)", () => {
  // The rule over the status's fields, including states no recording has caught yet (overtime, a shootout, extra innings,
  // a delay's words): these shapes are this module's reading of the feed, so the recorded tests above are the evidence for
  // the feed's own shapes, and an overtime or a shootout read from a recording is still owed (docs/testing.md, session 40).
  const status = (state: string, name: string, period: number, clock: string, shortDetail = "", completed = false) => ({ period, displayClock: clock, type: { state, name, shortDetail, completed } });
  assert.equal(whereWords("nfl", status("in", "STATUS_IN_PROGRESS", 3, "8:41")), "Q3 · 8:41");
  assert.equal(whereWords("nba", status("in", "STATUS_HALFTIME", 2, "0:00")), "Halftime");
  assert.equal(whereWords("nba", status("in", "STATUS_IN_PROGRESS", 5, "2:10")), "OT");
  assert.equal(whereWords("nhl", status("in", "STATUS_IN_PROGRESS", 2, "12:03")), "2nd period · 12:03");
  assert.equal(whereWords("nhl", status("in", "STATUS_END_PERIOD", 2, "0:00")), "2nd intermission");
  assert.equal(whereWords("nhl", status("in", "STATUS_IN_PROGRESS", 4, "3:00")), "OT");
  assert.equal(whereWords("nhl", status("in", "STATUS_SHOOTOUT", 5, "0:00", "SO")), "Shootout");
  assert.equal(whereWords("nhl", status("in", "STATUS_IN_PROGRESS", 5, "12:00", "12:00 - 2OT")), "OT", "a playoff game's fifth period is a second overtime");
  assert.equal(whereWords("mlb", status("in", "STATUS_IN_PROGRESS", 10, "0:00", "Top 10th")), "Top 10th");
  assert.equal(whereWords("mlb", status("post", "STATUS_FINAL", 10, "0:00", "Final/10", true)), "Final, 10 innings");
  assert.equal(whereWords("mlb", status("post", "STATUS_FINAL", 9, "0:00", "Final", true)), "Final");
  assert.equal(whereWords("nhl", status("post", "STATUS_FINAL", 5, "0:00", "Final/SO", true)), "Final, shootout");
  assert.equal(whereWords("nhl", status("post", "STATUS_FINAL", 4, "0:00", "Final/OT", true)), "Final, OT");
  assert.equal(whereWords("nhl", status("post", "STATUS_FINAL", 5, "0:00", "Final/2OT", true)), "Final, OT");
  assert.equal(whereWords("nfl", status("post", "STATUS_FINAL", 5, "0:00", "Final/OT", true)), "Final, OT");
  assert.equal(whereWords("nfl", status("pre", "STATUS_SCHEDULED", 0, "0:00")), null, "not started: nothing");
  assert.equal(whereWords("mlb", status("in", "STATUS_RAIN_DELAY", 1, "0:00", "Rain Delay, Top 1st")), null);
});

test("the tally on pull-to-refresh is the opening's own strokes and timing, all five drawn one at a time with the pull, the crossing fifth last (3.2; the touch-ups round)", () => {
  assert.equal(TALLY_STROKES.length, 5);
  for (const s of TALLY_STROKES) assert.ok(s.width > 0 && s.height > 0 && s.d.length > 10 && s.viewBox.split(" ").length === 4, JSON.stringify(s));
  assert.ok(TALLY_TIMING.beat > 0 && TALLY_TIMING.stroke > 0 && TALLY_TIMING.pace > 0 && TALLY_TIMING.curve.startsWith("cubic-bezier("), JSON.stringify(TALLY_TIMING));
  assert.equal(TALLY_LOOP_MS, TALLY_TIMING.beat + 5 * TALLY_TIMING.pace + TALLY_TIMING.stroke);
  assert.deepEqual(strokesAt(0), [0, 0, 0, 0, 0]);
  assert.deepEqual(strokesAt(0.1), [0.5, 0, 0, 0, 0]);
  assert.deepEqual(strokesAt(0.5), [1, 1, 0.5, 0, 0]);
  assert.deepEqual(strokesAt(0.9), [1, 1, 1, 1, 0.5], "the crossing fifth draws last, with the finger");
  assert.deepEqual(strokesAt(1), [1, 1, 1, 1, 1], "all five drawn at the threshold, where letting go reads the screen again");
  assert.deepEqual(strokesAt(3), [1, 1, 1, 1, 1]);
  const css = pullTallyCss();
  assert.match(css, /prefers-reduced-motion: reduce/, "a still mark under Reduce Motion");
  assert.equal((css.match(/@keyframes tally-loop-/g) ?? []).length, 5, "the loader's count, elsewhere");
  assert.match(css, /\[data-tally="reloading"\] \.t5\{animation:tally-fifth /, "while the screen is read again the finished tally's fifth redraws in a loop");
  assert.ok(!/\[data-tally="reloading"\] \.t[1-4]/.test(css), "and the uprights hold still");
});

test("the offer before asking what's already asked names who asked it and who is in it, the viewer first, two named and the rest counted (3.33)", () => {
  assert.equal(alreadyAskedLine("Priya", "Who wins", []), "Priya already asked who wins.");
  assert.equal(alreadyAskedLine("Priya", "By how much", ["you"]), "Priya already asked by how much with you.");
  assert.equal(alreadyAskedLine("You", "Total points", ["Rachel", "Theo"]), "You already asked total points with Rachel and Theo.");
  assert.equal(alreadyAskedLine("Priya", "The Bills’ first drive", ["you", "Rachel", "Theo", "Maya", "John"]), "Priya already asked the Bills’ first drive with you, Rachel and 3 others.");
  assert.equal(alreadyAskedLine("Priya", "Who wins", ["you", "Rachel", "Theo"]), "Priya already asked who wins with you, Rachel and 1 other.");
});

test("the notice about a device that hasn't checked it's you is one quiet line at the top, never a card (the games-and-the-reveal round, 3.46's look)", () => {
  const src = readFileSync("src/components/auth/device.tsx", "utf8");
  const notice = src.slice(src.indexOf("export function DeviceNotice"));
  assert.ok(notice.includes('className="min-w-0 truncate text-body-sm text-ink-2"') && notice.includes("min-h-11"), "one line of body-sm on a 44px row");
  assert.ok(!notice.includes("AlertGlyph") && !notice.includes("rounded-button border") && !notice.includes("A quick code lets you"), "no glyph, no card, no second sentence");
});

