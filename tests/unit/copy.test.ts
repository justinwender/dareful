/**
 * Times read in the viewer's zone, never the server's, and "yesterday" is a calendar day, not a span of hours. Then
 * the words themselves: what the app is, read from one constant everywhere; the phrases the build refuses; and the
 * counts, which never say a zero and take the singular at one.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import manifest from "@/app/manifest";
import { needFromMarket } from "@/lib/ledger/home";
import { numbersCaption } from "@/lib/ledger/you";
import { joinedNotice, voteRequest } from "@/lib/notify/messages";
import { ABOUT, ABOUT_FIRST, dayLabel, firstName, friendsIn, validZone, whenLabel } from "@/lib/ui/copy";
import { cutPhrasesIn } from "@/lib/ui/copy-rules";
import { plainCard } from "@/lib/ui/share-card";

const at = (iso: string) => new Date(iso);

test("something from last night reads as yesterday, not as a weekday two days back", () => {
  // 11:30pm Friday in New York, read at 9:00am Saturday in New York: 9.5 hours ago, and yesterday.
  assert.equal(whenLabel(at("2026-09-19T03:30:00Z"), at("2026-09-19T13:00:00Z"), "America/New_York"), "yesterday");
});

test("the same two instants read differently in a zone where no midnight fell between them", () => {
  // In Tokyo both instants are on Saturday the 19th.
  assert.equal(whenLabel(at("2026-09-19T03:30:00Z"), at("2026-09-19T13:00:00Z"), "Asia/Tokyo"), "9h ago");
});

test("thirty hours ago is yesterday when it was yesterday, even though it is more than a day", () => {
  assert.equal(whenLabel(at("2026-09-18T12:00:00Z"), at("2026-09-19T22:00:00Z"), "America/New_York"), "yesterday");
});

test("two calendar days back reads as the weekday in the viewer's zone", () => {
  // 1:00am UTC Thursday is still Wednesday evening in New York.
  assert.equal(whenLabel(at("2026-09-17T01:00:00Z"), at("2026-09-19T16:00:00Z"), "America/New_York"), "Wednesday");
  assert.equal(whenLabel(at("2026-09-17T01:00:00Z"), at("2026-09-19T16:00:00Z"), "UTC"), "Thursday");
});

test("minutes, and just now", () => {
  assert.equal(whenLabel(at("2026-09-19T12:00:00Z"), at("2026-09-19T12:00:30Z"), "UTC"), "just now");
  assert.equal(whenLabel(at("2026-09-19T12:00:00Z"), at("2026-09-19T12:41:00Z"), "UTC"), "41 min ago");
});

test("forty minutes ago across midnight is still minutes", () => {
  assert.equal(whenLabel(at("2026-09-19T03:50:00Z"), at("2026-09-19T04:30:00Z"), "America/New_York"), "40 min ago");
});

test("a week or more back is a date in the viewer's zone", () => {
  assert.equal(whenLabel(at("2026-09-01T02:00:00Z"), at("2026-09-19T16:00:00Z"), "America/New_York"), "Mon, Aug 31");
  assert.equal(whenLabel(at("2026-09-01T02:00:00Z"), at("2026-09-19T16:00:00Z"), "UTC"), "Tue, Sep 1");
});

test("a day label is in the viewer's zone", () => {
  assert.equal(dayLabel(at("2026-10-02T02:00:00Z"), "America/Los_Angeles"), "Oct 1");
  assert.equal(dayLabel(at("2026-10-02T02:00:00Z"), "UTC"), "Oct 2");
});

test("a zone from a cookie is validated before it is used", () => {
  assert.equal(validZone("America/New_York"), "America/New_York");
  assert.equal(validZone("Not/A_Zone"), null);
  assert.equal(validZone(""), null);
  assert.equal(validZone(null), null);
  assert.equal(validZone("A".repeat(65)), null);
});

test("a first name is the first word only", () => {
  assert.equal(firstName("  Alex Rivera-Santos "), "Alex");
  assert.equal(firstName("Sam"), "Sam");
  assert.equal(firstName(""), "");
});

test("a first name is never an email's local part", () => {
  assert.equal(firstName("justin.wender"), "Justin");
  assert.equal(firstName("sam@example.com"), "Sam");
  assert.equal(firstName("justin.wender+dynamic_test"), "Justin");
  assert.equal(firstName("dana_q"), "Dana");
  assert.equal(firstName("justin42.wender"), "Justin");
  assert.equal(firstName("J.R. Smith"), "J.R.");
  assert.equal(firstName("Mary-Jane Watson"), "Mary-Jane");
  assert.equal(firstName("D’Arcy"), "D’Arcy");
  assert.equal(firstName("sam"), "sam");
  // Nothing stands before the separator, so the word stands as it was.
  assert.equal(firstName(".hidden"), ".hidden");
  assert.equal(firstName("42.wender"), "42.wender");
});

// ------------------------------------------------------------------------------------- what the app is (2026-09-29)

test("what the app is: the owner's two sentences, and the four places read the one constant", () => {
  // The literal, so a change to the constant is seen here and not only echoed.
  assert.equal(ABOUT_FIRST, "Ask your friends what’ll happen, from who falls asleep first to who wins on Sunday.");
  assert.equal(ABOUT, "Ask your friends what’ll happen, from who falls asleep first to who wins on Sunday. Everyone makes their call, and Dareful keeps track of who’s got who.");
  // The plain card's footer (and so the description on a dead link, share.ts) and the manifest say the first sentence alone.
  assert.equal(plainCard.footer, ABOUT_FIRST);
  assert.equal(manifest().description, ABOUT_FIRST);
  // The signed-out screen says both. Read from the source, since it is a client component: it types no sentence of its own.
  const signedOut = readFileSync("src/components/home/signed-out.tsx", "utf8");
  assert.ok(/\{ABOUT\}/.test(signedOut) && !/The dares, the rounds|No spreadsheet/.test(signedOut), "the signed-out screen reads ABOUT and types no sentence of its own");
});

test("the app's own description (the root layout's metadata) reads the first sentence from the constant", () => {
  // Read from the source: the layout imports the stylesheet and the fonts, which a node test cannot load.
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  assert.ok(/description: ABOUT_FIRST,/.test(layout) && !/A social ledger for friend groups/.test(layout), "the app's own description reads ABOUT_FIRST");
});

test("the retired sentences are cut: the old signed-out line and the chalk 3.42 removed fail the build wherever they are typed", () => {
  assert.deepEqual(cutPhrasesIn("The dares, the rounds, and the “I got this one” between friends."), ["The dares, the rounds"]);
  assert.deepEqual(cutPhrasesIn("Send it to the chat"), ["Send it to the chat"]);
  assert.deepEqual(cutPhrasesIn("Send the link"), []);
  assert.deepEqual(cutPhrasesIn(ABOUT), []);
});

// ------------------------------------------------------------------------------------- counts (3.14: never a zero)

test("how many are in, before you are: nobody at zero, one friend, then words or digits, and never a zero in either style", () => {
  assert.equal(friendsIn(0, "words"), "Nobody’s in yet");
  assert.equal(friendsIn(0, "digits"), "Nobody’s in yet");
  assert.equal(friendsIn(1, "words"), "One friend is in");
  assert.equal(friendsIn(1, "digits"), "One friend is in");
  assert.equal(friendsIn(3, "words"), "Three friends are in");
  assert.equal(friendsIn(3, "digits"), "3 friends are in");
  assert.equal(friendsIn(7, "words"), "Seven friends are in");
  assert.equal(friendsIn(13, "words"), "A lot of friends are in");
  assert.equal(friendsIn(13, "digits"), "13 friends are in");
  for (const n of Array.from({ length: 13 }, (_, i) => i)) for (const style of ["words", "digits"] as const) assert.ok(!/^0\b/.test(friendsIn(n, style)), `${n} in ${style}`);
});

const t0 = new Date("2026-09-19T20:00:00Z");
const dare = { id: "d1", title: "Does John fall asleep?", creatorId: "creator", resolvesBy: new Date(t0.getTime() + 86_400_000), createdAt: t0, lockedAt: null as Date | null };
const market = (over: Record<string, unknown>) => ({ state: "open", people: [{ id: "creator", name: "C", percent: null, number: null, pick: null }], groupSize: 4, votesCast: 0, saidBy: null, unit: null, pickOne: null, ...over, dare: { ...dare, ...((over.dare as object) ?? {}) } }) as never;
const person = (id: string) => ({ id, name: id, percent: null, number: null, pick: null });

test("the asker's Close row gives the count as its reason, never the state as a sentence", () => {
  const everyone = market({ people: ["creator", "a", "b", "c"].map(person) });
  const n = needFromMarket(everyone, "creator", false, t0, () => "tonight");
  assert.equal(n?.kind, "lock");
  assert.equal(n?.context, "4 of 4 in");
  assert.ok(!/everyone/i.test(n?.context ?? ""), "the sentence the mark replaced (3.23)");
});

test("a count of one takes the singular: one has called it, on Now and in the vote notice", () => {
  const one = market({ state: "locked", votesCast: 1, saidBy: "Priya" });
  assert.equal(needFromMarket(one, "viewer", false, t0, () => "tonight")?.context, "Priya says what happened · 1 of 4 has called it");
  assert.equal(needFromMarket(market({ state: "locked", votesCast: 1 }), "viewer", false, t0, () => "tonight")?.context, "One of 4 has called it");
  assert.equal(needFromMarket(market({ state: "locked", votesCast: 2 }), "viewer", false, t0, () => "tonight")?.context, "Two of 4 have called it");
  const base = { voterName: "Gabe", title: "Can Theo clear the fence?", quorum: 5, threshold: 3, marketId: "m1", appUrl: "https://dareful.app" };
  assert.equal(voteRequest({ ...base, cast: 1, leading: 1 }).body, "1 of 5 has, and yours wouldn't decide it yet.");
  assert.equal(voteRequest({ ...base, cast: 2, leading: 2 }).body, "2 of 5 have, and yours could decide it.");
});

test("the joined notice leaves the count out while the joiner is alone, and says two of you only when the asker is one of the two", () => {
  const n = { title: "Can Theo clear the fence?", marketId: "m1", appUrl: "https://dareful.app", joinerName: "Gabe" };
  assert.equal(joinedNotice({ ...n, inCount: 1, askerIn: false }).body, "“Can Theo clear the fence?”");
  assert.equal(joinedNotice({ ...n, inCount: 2, askerIn: true }).body, "“Can Theo clear the fence?” That's two of you.");
  assert.equal(joinedNotice({ ...n, inCount: 2, askerIn: false }).body, "“Can Theo clear the fence?” That's 2 in.");
  assert.equal(joinedNotice({ ...n, inCount: 2 }).body, "“Can Theo clear the fence?” That's 2 in.", "without the fact, the count is said plainly");
  assert.equal(joinedNotice({ ...n, inCount: 3, askerIn: true }).body, "“Can Theo clear the fence?” That's 3 in.");
});

test("the Numbers caption on You names no colour: the line is the chalk, which follows the theme", () => {
  assert.equal(numbersCaption(7), "7 number markets. The band is the middle half of them; the line is your average.");
  assert.ok(!/cream|graphite/i.test(numbersCaption(7)));
});
