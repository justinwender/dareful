/**
 * The event-first rework and the vote cascade, as rules: what a room code is, what an unnamed group is called,
 * what "Needs you" holds and in what order, and who is told what after a vote.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { askerLine, forWhomLine, onThisLine, setInSentence, setLabel, type SetFacts } from "@/lib/ledger/groups";
import type { MarketCardData } from "@/lib/ledger/market-view";
import { shellOf } from "@/lib/ledger/shell-data";
import { needFromMarket, orderNeeds, runningCaption, squareSentence } from "@/lib/ledger/home";
import { rootFor } from "@/lib/ui/root";
import { filterByContext, sharedContexts, type TimelineEvent } from "@/lib/ledger/person";
import { CODE_ALPHABET, readCode, readPastedLink } from "@/lib/ledger/room-code";
import { joinedNotice, nudgeNotice, nudgeSeq, nudgeTargets, NUDGE_WINDOW_MS, openedNotice, recipientsAfterVote, relayText, resultNotice, voteRequest } from "@/lib/notify/messages";
import { platformOf } from "@/lib/auth/device";
import { closesLabel, endedLabel, lockedLabel, setCaption } from "@/lib/ui/copy";

test("the code alphabet has no O, I, Z, zero or one, and nothing twice", () => {
  assert.equal(CODE_ALPHABET.length, 31);
  assert.equal(new Set(CODE_ALPHABET).size, 31);
  assert.equal(/[OIZ01]/.test(CODE_ALPHABET), false);
});

test("a code reads the same in any case and with the spaces people add", () => {
  assert.deepEqual(readCode(" k7q md3 "), { code: "K7QMD3" });
  assert.deepEqual(readCode("k7q-md3"), { code: "K7QMD3" });
});

test("a short code is refused in words that say how short", () => {
  assert.deepEqual(readCode("k7qmd"), { problem: "Codes are six characters. This one is five." });
});

test("a character no code contains is named, not just refused", () => {
  const r = readCode("K7QMD0");
  assert.ok("problem" in r && /no zero in any code/.test(r.problem));
});

test("only this app's own market links are read from a paste", () => {
  assert.deepEqual(readPastedLink("https://dareful.app/m/F3B9E7C5-5252-45c4-8fd8-189dbc7570ea"), { marketId: "f3b9e7c5-5252-45c4-8fd8-189dbc7570ea" });
  assert.equal(readPastedLink("dareful.app/join/abcDEF123_-xyz?x=1"), null, "a group is a set of people, never a place with a link of its own");
  assert.equal(readPastedLink("dareful.app/join/f3b9e7c5-5252-45c4-8fd8-189dbc7570ea"), null, "even a well-formed id after /join/ is nothing");
  assert.equal(readPastedLink("https://dareful.app/m/not-a-uuid-at-all"), null);
  assert.equal(readPastedLink("https://example.com/o/123"), null);
});

test("a set of people nobody named is described by first names and you, and never called unnamed", () => {
  const label = (names: string[], name: string | null = null, isDyad = false) => setLabel({ name, isDyad, memberNames: ["Sam Okafor", ...names], viewerName: "Sam Okafor" });
  assert.equal(label(["Priya Shah", "Gabe", "John Li"]), "Priya, Gabe, John and you");
  assert.equal(label(["Maya", "Theo"]), "Maya, Theo and you");
  assert.equal(label(["A a", "B b", "C c", "D d", "E e"]), "A, B, C and 2 more");
  assert.equal(label(["Priya"], "Friday crew"), "Friday crew");
  assert.equal(label(["Gabe"], null, true), "Just you two");
  for (const l of [label(["Priya"]), label([]), label(["a", "b", "c", "d"])]) assert.equal(/unnamed|untitled|no name/i.test(l), false, l);
});

test("a set inside a sentence is its people around whoever the sentence is about, and never the chip's label", () => {
  const who = (id: string, displayName: string) => ({ id, displayName });
  const sam = who("sam", "Sam Okafor"), priya = who("priya", "Priya Shah"), gabe = who("gabe", "Gabe"), john = who("john", "John Li"), jp = who("jp", "JP Moreau"), theo = who("theo", "Theo");
  const set = (name: string | null, ...members: Array<{ id: string; displayName: string }>): SetFacts => ({ name, members });
  // Sam is looking, every time.
  const line = (asker: { id: string; displayName: string }, s: SetFacts) => askerLine(asker, s, "sam");
  assert.equal(line(sam, set(null, sam)), "You asked", "a set of only the asker: nothing after asked, and never Just you");
  assert.equal(line(jp, set(null, jp, sam)), "JP asked you", "two people, the other one asking");
  assert.equal(line(sam, set(null, jp, sam)), "You asked JP", "two people, the viewer asking: never You asked you");
  assert.equal(line(sam, set("Friday crew", sam, priya)), "You asked the Friday crew");
  assert.equal(line(priya, set("Friday crew", sam, priya)), "Priya asked the Friday crew");
  assert.equal(line(theo, set("Papa’s birthday", theo, sam)), "Theo asked · Papa’s birthday", "a possessive can't take the");
  assert.equal(line(theo, set("Papa's birthday", theo, sam)), "Theo asked · Papa's birthday", "with either apostrophe");
  assert.equal(line(theo, set("The regulars", theo, sam)), "Theo asked · The regulars", "nor can a name that starts with it");
  assert.equal(line(priya, set(null, priya, gabe, john, sam)), "Priya asked Gabe, John and you", "the asker is never inside her own list, and the viewer is last, as you");
  assert.equal(line(sam, set(null, sam, priya, gabe, john)), "You asked Priya, Gabe and John", "the viewer asking is never in the list as well");
  assert.equal(line(priya, set(null, priya, gabe, john)), "Priya asked Gabe and John", "a set the viewer is not in names nobody as you");
  const five = [who("a", "A a"), who("b", "B b"), who("c", "C c"), who("d", "D d"), who("e", "E e")];
  assert.equal(line(sam, set(null, sam, ...five)), "You asked A, B, C and 2 others");
  assert.equal(line(priya, set(null, priya, sam, ...five)), "Priya asked A, B, C and 3 others", "past three names the rest are counted, the viewer among them");
  assert.equal(line(sam, set(null, sam, ...five.slice(0, 4))), "You asked A, B, C and 1 other", "one left over is singular");
  assert.equal(onThisLine(set(null, sam, ...five.slice(0, 4)), "sam"), "You’re on this with A, B, C and 1 other");
  assert.equal(forWhomLine(set(null, sam, ...five.slice(0, 4)), "sam"), "For A, B, C and 1 other");
  // With nobody looking (a link's visitor), the asker is a first name and a set nobody named says nothing.
  assert.equal(askerLine(priya, set("Friday crew"), null), "Priya asked the Friday crew");
  assert.equal(askerLine(priya, set(null), null), "Priya asked");
  // The same set in the other sentences.
  assert.equal(onThisLine(set("Friday crew", sam, priya), "sam"), "You’re on this with the Friday crew");
  assert.equal(onThisLine(set("Papa’s birthday", sam, theo), "sam"), "You’re on this · Papa’s birthday");
  assert.equal(onThisLine(set(null, sam), "sam"), "You’re on this", "a set of only the viewer");
  assert.equal(onThisLine(set(null, sam, jp), "sam"), "You’re on this with JP");
  assert.equal(onThisLine(set(null, priya, gabe, john, sam), "sam"), "You’re on this with Priya, Gabe and John");
  assert.equal(forWhomLine(set("Friday crew", sam, priya), "sam"), "For the Friday crew");
  assert.equal(forWhomLine(set(null, sam, jp), "sam"), "For JP");
  assert.equal(forWhomLine(set(null, sam), "sam"), null, "a draft for nobody yet keeps the band's own words");
  assert.deepEqual(setInSentence(set(null, sam), "sam", "sam"), null);
  // The chip's words never reach a sentence, whoever asks and whoever looks.
  const sets = [set(null, sam), set(null, sam, jp), set(null, priya, gabe, john, sam), set(null, sam, ...five), set("Friday crew", sam, priya)];
  for (const s of sets) {
    for (const asker of [sam, ...s.members.filter((m) => m.id !== "sam").slice(0, 1)]) {
      const l = line(asker, s);
      assert.equal(/Just you|\d+ more$/.test(l), false, l);
      if (asker.id === "sam") assert.equal(/asked you$| and you$/.test(l), false, l);
      assert.equal(new RegExp(`asked .*\\b${asker.displayName.split(" ")[0]}\\b`).test(l), false, l);
    }
  }
});

test("a row's shell says the asker line the screen will say: from the set's facts, whatever label the card carries", () => {
  const now = new Date("2026-09-29T18:00:00Z");
  const card = (over: Partial<MarketCardData>): MarketCardData => ({ dare: { id: "d1", creatorId: "sam", title: "Does he fall asleep?", markKind: null, markValue: null, resolvesBy: null, resolvedAt: null, resolvedBy: null }, state: "open", ink: "plum", viewerIn: true, votesCast: 0, people: [{ id: "sam", name: "Sam Okafor", ghost: false, percent: null, number: null, pick: null }], groupName: null, set: { name: null, members: [] }, groupSize: 2, unit: null, pickOne: null, ...over }) as unknown as MarketCardData;
  const two = { name: null, members: [{ id: "sam", displayName: "Sam Okafor" }, { id: "jp", displayName: "JP Moreau" }] };
  // Now and the person view put the chip's label where the set's name was: the shell never reads it.
  assert.equal(shellOf(card({ groupName: "Just you two", set: two }), "sam", now, "UTC").asker?.line, "You asked JP");
  assert.equal(shellOf(card({ groupName: "Just you two", set: two }), "jp", now, "UTC").asker?.line, "Sam asked you");
  assert.equal(shellOf(card({ groupName: "Priya, Gabe and you", set: { name: null, members: [{ id: "sam", displayName: "Sam Okafor" }, { id: "priya", displayName: "Priya Shah" }, { id: "gabe", displayName: "Gabe" }] } }), "sam", now, "UTC").asker?.line, "You asked Priya and Gabe");
  assert.equal(shellOf(card({ groupName: "Friday crew", set: { name: "Friday crew", members: two.members } }), "jp", now, "UTC").asker?.line, "Sam asked the Friday crew");
  assert.equal(shellOf(card({ groupName: "Just you", set: { name: null, members: [{ id: "sam", displayName: "Sam Okafor" }] } }), "sam", now, "UTC").asker?.line, "You asked");
  // A game's asker starts out in nothing: the asker is found among the set's seats.
  assert.equal(shellOf(card({ people: [], viewerIn: false, set: two }), "jp", now, "UTC").asker?.line, "Sam asked you");
  assert.equal(shellOf(card({ people: [], viewerIn: false, set: { name: null, members: [] } }), "jp", now, "UTC").asker, null, "held empty when the card does not know who asked");
});

test("the caption under a set carries the difference: last time for the top row, then when, then how many and which month", () => {
  const now = new Date("2026-09-20T18:00:00Z");
  const at = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const cap = (days: number | null, isMostRecent: boolean, size = 4) => setCaption({ size, lastAskedAt: days === null ? null : at(days), isMostRecent, now, timeZone: "UTC" });
  assert.equal(cap(2, true), "Last time, on Friday");
  assert.equal(cap(2, false), "On Friday");
  assert.equal(cap(15, false), "Two weeks ago");
  assert.equal(cap(40, false, 6), "Six of you, back in August");
  assert.equal(cap(null, false, 3), "Three of you");
  assert.equal(/^\d/.test(cap(40, false, 6)), false, "a number never opens the line as a digit");
});

test("everyone square is one sentence that names them, never a column of nothing", () => {
  assert.equal(squareSentence(["Theo Park", "Maya", "John"]), "Theo, Maya and John are square with you");
  assert.equal(squareSentence(["Theo"]), "Theo is square with you");
  assert.equal(squareSentence(["A", "B", "C", "D", "E"]), "A, B and 3 others are square with you");
});

test("locked reads as a time on the day and a date after, never as how long ago, and never with a capital mid-caption", () => {
  const now = new Date("2026-09-20T23:30:00Z");
  // "2 beers · locked at 10:40pm" (3.22): the word sits inside a caption, so it takes no capital.
  assert.equal(lockedLabel(new Date("2026-09-20T23:00:00Z"), now, "UTC"), "locked at 11pm");
  assert.equal(lockedLabel(new Date("2026-09-20T21:20:00Z"), now, "UTC"), "locked at 9:20pm");
  assert.equal(lockedLabel(new Date("2026-09-12T23:00:00Z"), now, "UTC"), "locked Sat, Sep 12");
});

const ev = (groupId: string): TimelineEvent => ({ kind: "proposal", at: new Date(), proposal: { groupId } as never, denomination: {} as never, groupName: null });
const labels = new Map([["fri", { label: "Friday crew", unnamed: false, isDyad: false }], ["two", { label: "Just you two", unnamed: false, isDyad: true }], ["run", { label: "Run club", unnamed: false, isDyad: false }], ["adhoc", { label: "Priya, Gabe and you", unnamed: true, isDyad: false }]]);
test("where two people turn up is counted per set of people, most first, and tapping one narrows the timeline to it", () => {
  const timeline = [...Array(3).fill("fri"), ...Array(2).fill("two"), "run", "adhoc", "adhoc"].map(ev);
  assert.deepEqual(sharedContexts(timeline, labels).map((c) => [c.label, c.count, c.unnamed]), [["Friday crew", 3, false], ["Just you two", 2, false], ["Priya, Gabe and you", 2, true], ["Run club", 1, false]]);
  assert.equal(filterByContext(timeline, "two").length, 2);
  assert.equal(filterByContext(timeline, undefined).length, 8);
});

test("with nothing but the two of them there is no band at all", () => {
  assert.deepEqual(sharedContexts([ev("two"), ev("two")], labels), []);
  assert.deepEqual(sharedContexts([], labels), []);
  assert.equal(sharedContexts([ev("fri")], labels).length, 1, "one shared context still explains where things come from");
});

const day = 86_400_000;
const t0 = new Date("2026-09-19T18:00:00Z");
test("needs you: a question in voting first, then what else has a deadline, then what can sit, and never by how old it is", () => {
  const rows = [
    { id: "draft", kind: "finish" as const, deadline: null, since: new Date(t0.getTime() - 5 * day) },
    { id: "yep-new", kind: "yep" as const, deadline: null, since: new Date(t0.getTime() - 1 * day) },
    { id: "vote-late", kind: "vote" as const, deadline: new Date(t0.getTime() + 3 * day), since: t0 },
    { id: "enter-soon", kind: "enter" as const, deadline: new Date(t0.getTime() + 1 * day), since: t0 },
    { id: "yep-old", kind: "yep" as const, deadline: null, since: new Date(t0.getTime() - 60 * day) },
    { id: "vote-argument", kind: "vote" as const, deadline: null, since: t0 },
  ];
  // A cover from two months ago does not climb over tonight's vote by being old; an argument's vote, which has no
  // date at all, still ranks with the votes.
  assert.deepEqual(orderNeeds(rows).map((r) => r.id), ["vote-late", "vote-argument", "enter-soon", "yep-old", "draft", "yep-new"]);
});

const dare = { id: "d1", title: "Does John fall asleep?", creatorId: "creator", resolvesBy: new Date(t0.getTime() + day), createdAt: t0, lockedAt: null as Date | null };
const market = (over: Record<string, unknown>) => ({ state: "open", people: [{ id: "creator", name: "C", percent: null, number: null, pick: null }], groupSize: 4, votesCast: 0, saidBy: null, unit: null, pickOne: null, ...over, dare: { ...dare, ...((over.dare as object) ?? {}) } }) as never;
const closes = () => "tonight";

test("an open question someone is not in needs their number, with who is in and when it closes", () => {
  const n = needFromMarket(market({}), "viewer", false, t0, closes);
  assert.equal(n?.kind, "enter");
  assert.equal(n?.context, "Closes tonight · 1 of 4 in");
});

test("a question someone is already in needs nothing more from them", () => {
  assert.equal(needFromMarket(market({ people: [{ id: "viewer", name: "V", percent: null }] }), "viewer", false, t0, closes), null);
});

test("the creator is asked to lock when time is up, and not before, and nobody else is", () => {
  // Two in: the close can be finished (the QA round: with fewer the close is refused, so no row; tests/unit/sheets-true.test.ts).
  const past = { dare: { resolvesBy: new Date(t0.getTime() - 1000) }, people: [{ id: "creator", name: "C", percent: null }, { id: "viewer", name: "V", percent: null }] };
  assert.equal(needFromMarket(market(past), "creator", false, t0, closes)?.kind, "lock");
  // The verb is the word of the close (4.6: "Lock it in" is a sportsbook phrase; the asker closes it).
  assert.equal(needFromMarket(market(past), "creator", false, t0, closes)?.verb, "Close");
  assert.equal(needFromMarket(market({}), "creator", false, t0, closes), null);
  assert.equal(needFromMarket(market(past), "viewer", false, t0, closes), null);
});

test("a locked question needs a call from whoever has not made one, and links to the ballot", () => {
  const locked = market({ state: "locked", votesCast: 2, saidBy: "Priya" });
  const n = needFromMarket(locked, "viewer", false, t0, closes);
  assert.equal(n?.kind, "vote");
  assert.equal(n?.href, "/m/d1#ballot");
  assert.match(n?.context ?? "", /^Priya says what happened · 2 of 4/);
  assert.equal(needFromMarket(locked, "viewer", true, t0, closes), null);
});

test("no needs-you line ever says how long anything has waited", () => {
  const old = market({ state: "locked", dare: { resolvesBy: new Date(t0.getTime() - 60 * day), createdAt: new Date(t0.getTime() - 90 * day) } });
  const n = needFromMarket(old, "viewer", false, t0, () => closesLabel(new Date(t0.getTime() - 60 * day), t0, "UTC"));
  assert.equal(/\d+\s*(day|week|month|hour)|ago|overdue|late/i.test(`${n?.context} ${n?.verb}`), false);
  assert.equal(closesLabel(new Date(t0.getTime() - 60 * day), t0, "UTC"), "soon");
  // A moment in the past is said as when it was, never as "soon" (3.15: "Called off Sun at 6:52pm").
  const ended = new Date("2026-09-27T18:52:00Z");
  assert.equal(endedLabel(ended, new Date("2026-09-27T23:00:00Z"), "UTC"), "at 6:52pm", "on the day");
  assert.equal(endedLabel(ended, new Date("2026-09-30T23:00:00Z"), "UTC"), "Sun at 6:52pm", "within the week");
  assert.equal(endedLabel(ended, new Date("2026-10-20T23:00:00Z"), "UTC"), "Sep 27 at 6:52pm", "after");
  assert.ok(!endedLabel(ended, new Date("2026-09-30T23:00:00Z"), "UTC").includes("soon"));
});

test("closes reads as tonight, tomorrow, then a weekday, in the viewer's zone", () => {
  assert.equal(closesLabel(new Date("2026-09-20T03:00:00Z"), t0, "America/New_York"), "tonight");
  assert.equal(closesLabel(new Date("2026-09-20T03:00:00Z"), t0, "UTC"), "tomorrow");
  assert.equal(closesLabel(new Date("2026-09-22T18:00:00Z"), t0, "UTC"), "Tuesday");
});

test("after a vote the rest of the quorum is asked, and never the voter or anyone who has voted", () => {
  assert.deepEqual(recipientsAfterVote({ quorumUserIds: ["a", "b", "c", "d", "d"], votedUserIds: ["a", "b"], voterId: "a", resolved: false }), { requests: ["c", "d"], results: [] });
});

test("once it is decided nobody is asked: whoever had not voted gets the result instead", () => {
  assert.deepEqual(recipientsAfterVote({ quorumUserIds: ["a", "b", "c", "d"], votedUserIds: ["a", "b", "c"], voterId: "c", resolved: true }), { requests: [], results: ["d"] });
});

const base = { voterName: "Gabe", title: "Can Theo clear the fence?", quorum: 5, threshold: 3, marketId: "m1", appUrl: "https://dareful.app" };
test("a vote notice names who voted, the count, and whether the reader's could decide it", () => {
  const early = voteRequest({ ...base, cast: 1, leading: 1 });
  assert.equal(early.title, "Gabe called “Can Theo clear the fence”");
  assert.equal(early.body, "1 of 5 has, and yours wouldn't decide it yet.");
  assert.equal(voteRequest({ ...base, cast: 2, leading: 2 }).body, "2 of 5 have, and yours could decide it.");
  assert.equal(voteRequest({ ...base, cast: 2, leading: 1 }).body, "2 of 5 have, and yours wouldn't decide it yet.");
});

test("every notice opens this app, the request on the ballot and the result on the leaderboard", () => {
  assert.equal(voteRequest({ ...base, cast: 1, leading: 1 }).url, "https://dareful.app/m/m1#ballot");
  const r = resultNotice({ deciderName: "Gabe", title: base.title, outcome: "void", marketId: "m1", appUrl: base.appUrl });
  assert.equal(r.url, "https://dareful.app/m/m1");
  assert.match(r.body, /^Nobody could tell\. Gabe's call settled it/);
});

test("no notice or relay text carries an amount, a unit, or anyone's number", () => {
  const all = [voteRequest({ ...base, cast: 2, leading: 2 }), resultNotice({ deciderName: "Gabe", title: base.title, outcome: "yes", marketId: "m1", appUrl: base.appUrl })].map((n) => `${n.title} ${n.body}`).concat(relayText({ title: base.title, cast: 2, quorum: 5 }));
  for (const text of all) assert.equal(/\$|%|beer|owe|debt/i.test(text), false, text);
  assert.equal(relayText({ title: base.title, cast: 2, quorum: 5 }), "Called “Can Theo clear the fence”, 2 of 5 so far. Your turn:");
});

const n = { title: "Can Theo clear the fence?", marketId: "m1", appUrl: "https://dareful.app" };
test("a question opening, someone getting in, and a nudge each name the person who did it, and nothing it could cost", () => {
  const opened = openedNotice({ ...n, askerName: "Priya" });
  const joined = joinedNotice({ ...n, joinerName: "Gabe", inCount: 3 });
  const nudge = nudgeNotice({ ...n, nudgerName: "Maya", stage: "enter" });
  assert.deepEqual([opened.title, joined.title, nudge.title], ["Priya asked something", "Gabe is in", "Maya is waiting on you"]);
  assert.equal(joined.body, "“Can Theo clear the fence?” That's 3 in.");
  for (const x of [opened, joined, nudge]) assert.equal(/\$|%|beer|owe|debt|\d+ (day|hour)/i.test(`${x.title} ${x.body}`), false, x.body);
});

test("a nudge to vote opens on the ballot; a nudge to get in opens on the question", () => {
  assert.equal(nudgeNotice({ ...n, nudgerName: "Maya", stage: "vote" }).url, "https://dareful.app/m/m1#ballot");
  assert.equal(nudgeNotice({ ...n, nudgerName: "Maya", stage: "enter" }).url, "https://dareful.app/m/m1");
});

const crowd = { nudgerId: "a", nudgerIsIn: true, memberIds: ["a", "b", "c", "d"], enteredIds: ["a", "b"], quorumIds: ["a", "b", "c"], votedIds: ["b"] };
test("a nudge goes to whoever has not got in, or once locked to whoever in the quorum has not called it, never to the nudger", () => {
  assert.deepEqual(nudgeTargets({ ...crowd, stage: "enter" }), ["c", "d"]);
  assert.deepEqual(nudgeTargets({ ...crowd, stage: "vote" }), ["c"]);
});

test("only someone who is in can say we're waiting on you", () => {
  assert.deepEqual(nudgeTargets({ ...crowd, stage: "enter", nudgerId: "d", nudgerIsIn: false }), []);
});

test("a nudge beside one name reaches that person alone, and never someone who is already in, has voted, or is the nudger", () => {
  assert.deepEqual(nudgeTargets({ ...crowd, stage: "enter", only: "d" }), ["d"], "the one person named");
  assert.deepEqual(nudgeTargets({ ...crowd, stage: "enter", only: "b" }), [], "already in: nothing to nudge about");
  assert.deepEqual(nudgeTargets({ ...crowd, stage: "vote", only: "d" }), [], "not in the quorum: cannot be nudged to vote");
  assert.deepEqual(nudgeTargets({ ...crowd, stage: "enter", only: "a" }), [], "never yourself");
});

test("two taps inside six hours are one nudge; the next window is a new one", () => {
  const t = new Date("2026-09-20T12:00:00Z");
  assert.equal(nudgeSeq(t), nudgeSeq(new Date(t.getTime() + NUDGE_WINDOW_MS - 1)));
  assert.notEqual(nudgeSeq(t), nudgeSeq(new Date(t.getTime() + NUDGE_WINDOW_MS)));
});

test("a user agent is kept as one of four words and nothing finer", () => {
  assert.equal(platformOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"), "ios");
  assert.equal(platformOf("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36"), "android");
  assert.equal(platformOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15"), "desktop");
  assert.equal(platformOf(null), "other");
});

// ------------------------------------------------------------------------------------- the shell (design 6)

test("back lands on the root it came from, and on Now when what is remembered is not a root", () => {
  assert.equal(rootFor("/people"), "/people");
  assert.equal(rootFor("/you"), "/you");
  assert.equal(rootFor("/"), "/");
  assert.equal(rootFor(null), "/");
  assert.equal(rootFor(undefined), "/");
  for (const stored of ["/m/abc", "/people/", "https://evil.example/", "javascript:alert(1)", ""]) assert.equal(rootFor(stored), "/", stored);
});

test("a running row says your entry and how many are in, then the clock once it locks, and never how long it has run or a state in words", () => {
  const two = [{ id: "viewer", name: "V", percent: 70, number: null, pick: null }, { id: "creator", name: "C", percent: 30, number: null, pick: null }];
  const open = market({ people: two });
  // The state mark beside the row says in, locked or voting (3.23); the words say your entry and how many are in (3.15).
  assert.equal(runningCaption(open, closes, "viewer"), "You’re in at 70% · two of you");
  assert.equal(runningCaption(market({ people: [two[0]] }), closes, "viewer"), "You’re in at 70% · just you so far");
  assert.equal(runningCaption(market({ people: [{ id: "viewer", name: "V", percent: null, number: "14", pick: null }, ...two.slice(1)], unit: { singular: "shirt", plural: "shirts" } }), closes, "viewer"), "You’re in at 14 shirts · two of you");
  assert.equal(runningCaption(market({ people: [{ id: "viewer", name: "V", percent: null, number: null, pick: 0 }, ...two.slice(1)], pickOne: { answers: [{ index: 0, text: "John" }], outcome: null, shares: [], callers: [] } }), closes, "viewer"), "You’re in: John · two of you");
  // Once it locks, the clock alone: resolving while nobody has called it, voting once someone has.
  assert.equal(runningCaption(market({ state: "locked", votesCast: 2, people: two }), closes, "viewer"), "Voting ends tonight");
  assert.equal(runningCaption(market({ state: "locked", people: two }), closes, "viewer"), "Resolving tonight");
  for (const m of [open, market({ state: "locked", people: two }), market({ dare: { pace: "argument" }, people: [two[0]] })]) {
    const s = runningCaption(m, closes, "viewer");
    assert.equal(/\d+\s*(day|week|month|hour)|ago|overdue|late/i.test(s), false, s);
    assert.equal(/waiting on|closes /i.test(s), false, `a state in words, or the open clock, on a running row: ${s}`);
  }
});
