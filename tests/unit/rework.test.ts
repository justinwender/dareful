/**
 * The event-first rework and the vote cascade, as rules: what a room code is, what an unnamed group is called,
 * what "Needs you" holds and in what order, and who is told what after a vote.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { setLabel } from "@/lib/ledger/groups";
import { needFromMarket, orderNeeds, runningCaption, squareSentence, timeBound } from "@/lib/ledger/home";
import { rootFor } from "@/lib/ui/root";
import { filterByContext, sharedContexts, type TimelineEvent } from "@/lib/ledger/person";
import { CODE_ALPHABET, readCode, readPastedLink } from "@/lib/ledger/room-code";
import { joinedNotice, nudgeNotice, nudgeSeq, nudgeTargets, NUDGE_WINDOW_MS, openedNotice, recipientsAfterVote, relayText, resultNotice, voteRequest } from "@/lib/notify/messages";
import { platformOf } from "@/lib/auth/device";
import { closesLabel, lockedLabel, setCaption } from "@/lib/ui/copy";

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

test("only this app's own market and group links are read from a paste", () => {
  assert.deepEqual(readPastedLink("https://dareful.app/m/F3B9E7C5-5252-45c4-8fd8-189dbc7570ea"), { marketId: "f3b9e7c5-5252-45c4-8fd8-189dbc7570ea" });
  assert.deepEqual(readPastedLink("dareful.app/join/abcDEF123_-xyz?x=1"), { inviteToken: "abcDEF123_-xyz" });
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

test("locked reads as a time on the day and a date after, never as how long ago", () => {
  const now = new Date("2026-09-20T23:30:00Z");
  assert.equal(lockedLabel(new Date("2026-09-20T23:00:00Z"), now, "UTC"), "Locked at 11pm");
  assert.equal(lockedLabel(new Date("2026-09-20T21:20:00Z"), now, "UTC"), "Locked at 9:20pm");
  assert.equal(lockedLabel(new Date("2026-09-12T23:00:00Z"), now, "UTC"), "Locked Sat, Sep 12");
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
const market = (over: Record<string, unknown>) => ({ state: "open", people: [{ id: "creator", name: "C", percent: null }], groupSize: 4, votesCast: 0, saidBy: null, ...over, dare: { ...dare, ...((over.dare as object) ?? {}) } }) as never;
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
  const past = { dare: { resolvesBy: new Date(t0.getTime() - 1000) } };
  assert.equal(needFromMarket(market(past), "creator", false, t0, closes)?.kind, "lock");
  assert.equal(needFromMarket(market({}), "creator", false, t0, closes), null);
  assert.equal(needFromMarket(market({ ...past, people: [{ id: "creator", name: "C", percent: null }, { id: "viewer", name: "V", percent: null }] }), "viewer", false, t0, closes), null);
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
  assert.equal(early.body, "1 of 5 have, and yours wouldn't decide it yet.");
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

test("the dot on Now means something with a clock is waiting, not merely something waiting", () => {
  assert.equal(timeBound([{ deadline: null }, { deadline: null }]), false, "a cover to confirm and a draft can sit");
  assert.equal(timeBound([{ deadline: null }, { deadline: t0 }]), true);
  assert.equal(timeBound([]), false);
});

test("back lands on the root it came from, and on Now when what is remembered is not a root", () => {
  assert.equal(rootFor("/people"), "/people");
  assert.equal(rootFor("/you"), "/you");
  assert.equal(rootFor("/"), "/");
  assert.equal(rootFor(null), "/");
  assert.equal(rootFor(undefined), "/");
  for (const stored of ["/m/abc", "/people/", "https://evil.example/", "javascript:alert(1)", ""]) assert.equal(rootFor(stored), "/", stored);
});

test("a running row says where a question stands and never how long it has run", () => {
  const open = market({ people: [{ id: "viewer", name: "V", percent: null }, { id: "creator", name: "C", percent: null }] });
  // The state mark beside the row says in, locked or voting (3.23); the words say where it stands and the clock.
  assert.equal(runningCaption(open, closes), "2 of 4 in · closes tonight");
  assert.equal(runningCaption(market({ state: "locked", votesCast: 2 }), closes), "2 of 4 have called it");
  assert.equal(runningCaption(market({ state: "locked" }), closes), "Resolving tonight");
  assert.equal(runningCaption(market({ dare: { pace: "argument" } }), closes), "Waiting on the other side");
  for (const m of [open, market({ state: "locked" }), market({ dare: { pace: "argument" } })]) assert.equal(/\d+\s*(day|week|month|hour)|ago|overdue|late/i.test(runningCaption(m, closes)), false);
});
