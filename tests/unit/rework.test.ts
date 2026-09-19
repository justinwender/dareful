/**
 * The event-first rework and the vote cascade, as rules: what a room code is, what an unnamed group is called,
 * what "Needs you" holds and in what order, and who is told what after a vote.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { occasionLabel } from "@/lib/ledger/groups";
import { needFromMarket, orderNeeds } from "@/lib/ledger/home";
import { CODE_ALPHABET, readCode, readPastedLink } from "@/lib/ledger/room-code";
import { recipientsAfterVote, relayText, resultNotice, voteRequest } from "@/lib/notify/messages";
import { closesLabel } from "@/lib/ui/copy";

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

test("an unnamed group is called by its latest question, cut short, without the question mark", () => {
  assert.equal(occasionLabel({ latestTitle: "Does Riley finish?", memberNames: ["Alex"] }), "Does Riley finish");
  const long = occasionLabel({ latestTitle: "Does Riley actually finish the half marathon on Sunday?", memberNames: [] });
  assert.ok(long.length <= 28 && long.endsWith("…"));
});

test("with no question yet it is first names, the viewer first as You, and a count past three", () => {
  assert.equal(occasionLabel({ latestTitle: null, memberNames: ["Priya Shah", "Alex Kim", "Theo"], viewerName: "Alex Kim" }), "You, Priya, Theo");
  assert.equal(occasionLabel({ latestTitle: null, memberNames: ["A a", "B b", "C c", "D d", "E e"] }), "A, B, C +2");
  assert.equal(occasionLabel({ latestTitle: "  ", memberNames: ["Alex"], viewerName: "Alex" }), "Just you");
});

const day = 86_400_000;
const t0 = new Date("2026-09-19T18:00:00Z");
test("needs you: soonest deadline first, then longest waiting, then fastest to finish", () => {
  const rows = [
    { id: "draft", kind: "finish" as const, deadline: null, since: new Date(t0.getTime() - 5 * day) },
    { id: "yep-new", kind: "yep" as const, deadline: null, since: new Date(t0.getTime() - 1 * day) },
    { id: "vote-late", kind: "vote" as const, deadline: new Date(t0.getTime() + 3 * day), since: t0 },
    { id: "enter-soon", kind: "enter" as const, deadline: new Date(t0.getTime() + 1 * day), since: t0 },
    { id: "yep-tie", kind: "yep" as const, deadline: null, since: new Date(t0.getTime() - 5 * day) },
  ];
  assert.deepEqual(orderNeeds(rows).map((r) => r.id), ["enter-soon", "vote-late", "yep-tie", "draft", "yep-new"]);
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
