/**
 * You's words and figures (docs/design.md 3.34): the header's caption, the headline in counts, the captions, the
 * clean-resolution sentence and its caption, and the plot's geometry. Pure, so each rule has a hand figure.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { aboutPercent, askedCaption, askedHeadline, callLine, callsCaption, callsHeadline, earlyTitle, headerCaption, numbersCaption, numbersEarly, numbersHeadline, pickOneCaption, plotDots, sinceLabel } from "@/lib/ledger/you";
import { initialStickerMark } from "@/app/m/new/page";

const zone = "America/New_York";
const now = new Date("2026-09-27T20:00:00Z"); // Sunday afternoon in New York
const days = (n: number) => new Date(now.getTime() - n * 86_400_000);

test("since: today, yesterday, the weekday within the week, last week, the month this year, and the month and year before", () => {
  assert.equal(sinceLabel(now, now, zone), "since today");
  assert.equal(sinceLabel(days(1), now, zone), "since yesterday");
  assert.equal(sinceLabel(days(5), now, zone), "since Tuesday");
  assert.equal(sinceLabel(days(9), now, zone), "since last week");
  assert.equal(sinceLabel(new Date("2026-03-04T12:00:00Z"), now, zone), "since March");
  assert.equal(sinceLabel(new Date("2025-11-04T12:00:00Z"), now, zone), "since November 2025");
});

test("the header's caption: joined today with nothing yet, else how many markets since when, never a score", () => {
  assert.equal(headerCaption({ markets: 0, firstEnteredAt: null, joinedAt: now }, now, zone), "Joined today");
  assert.equal(headerCaption({ markets: 0, firstEnteredAt: null, joinedAt: days(3) }, now, zone), "Joined Sep 24");
  assert.equal(headerCaption({ markets: 43, firstEnteredAt: new Date("2026-03-04T12:00:00Z"), joinedAt: days(300) }, now, zone), "In 43 markets since March");
  assert.equal(headerCaption({ markets: 1, firstEnteredAt: days(9), joinedAt: days(9) }, now, zone), "In one market since last week");
});

test("the headline names the fullest bin in counts, never a second percentage, and the early title is a fact and not a bar", () => {
  assert.equal(callsHeadline([{ bucket: 7, count: 10, hits: 7, meanBps: 6900 }, { bucket: 3, count: 4, hits: 1, meanBps: 2800 }]), "When you say about 70%, it happened 7 of the 10 times.");
  assert.equal(callsHeadline([{ bucket: 9, count: 3, hits: 3, meanBps: 8800 }]), "When you say about 90%, it happened all 3 times.");
  assert.equal(callsHeadline([{ bucket: 2, count: 3, hits: 0, meanBps: 1500 }]), "When you say about 20%, it happened none of the 3 times.");
  assert.equal(callsHeadline([{ bucket: 5, count: 1, hits: 1, meanBps: 5000 }]), "When you say about 50%, it happened, the one time.");
  assert.equal(callsHeadline([]), null);
  assert.equal(aboutPercent(6450), "about 60%");
  assert.equal(earlyTitle(3, 10), "Your picture draws at 10 resolved calls. 3 so far.");
  assert.equal(earlyTitle(0, 10), "Your picture draws at 10 resolved calls. None so far.");
  assert.equal(callLine(7000, true), "You said 70% · it happened");
  assert.equal(callLine(2500, false), "You said 25% · it didn’t");
});

test("the captions count: the calls since when, pick one called of those in, the numbers line and its floor", () => {
  assert.equal(callsCaption(40, new Date("2026-03-04T12:00:00Z"), now, zone), "40 yes-or-no calls since March.");
  assert.equal(callsCaption(1, null, now, zone), "One yes-or-no call.");
  assert.equal(pickOneCaption({ resolved: 9, called: 5 }), "Pick one: you called 5 of the 9 you were in.");
  assert.equal(pickOneCaption({ resolved: 1, called: 0 }), "Pick one: you didn’t call the one you were in.");
  assert.equal(pickOneCaption({ resolved: 0, called: 0 }), null);
  assert.equal(numbersHeadline(1500), "On numbers, you land 15% of the range away.");
  assert.equal(numbersCaption(7), "7 number markets. The band is the middle half of them; the line is your average.");
  assert.equal(numbersEarly(2, 5), "Numbers draw at 5 number markets. 2 so far.");
});

test("questions you asked: the count first and never a percentage, and the caption names the void and counts the expiries against nobody", () => {
  assert.equal(askedHeadline(12, 11), "11 of the 12 questions you asked ended cleanly.");
  assert.equal(askedHeadline(1, 1), "The one question you asked ended cleanly.");
  assert.equal(askedHeadline(1, 0), "The one question you asked was voided.");
  const t = now;
  const q = (title: string, clean: boolean) => ({ dareId: title, title, clean, endedAt: t });
  assert.equal(askedCaption([q("Does Maya make the 7:40?", false), q("Does the kettle boil?", true)], 2), "The group voided “Does Maya make the 7:40?” Two others expired, which counts against nobody.");
  assert.equal(askedCaption([q("An older one", false), q("Does Maya make the 7:40?", false), q("Fine", true)], 0), "The group voided “Does Maya make the 7:40?” and one other.");
  assert.equal(askedCaption([q("Fine", true)], 1), "One expired, which counts against nobody.");
  assert.equal(askedCaption([q("Fine", true)], 0), null);
  assert.ok(!askedCaption([q("Maya?", false)], 0)!.includes("%"), "never a percentage");
});

test("the plot puts a dot per bin at (mean said, share happened), sized by how much it rests on, over its 80% whisker", () => {
  const [d] = plotDots([{ bucket: 7, count: 4, hits: 3, meanBps: 6800 }]);
  assert.ok(d);
  assert.deepEqual([d.x, d.y, d.count], [0.68, 0.75, 4]);
  assert.ok(Math.abs(d.r - (3 + 1.6 * 2)) < 1e-9, "radius 3 + 1.6 root n");
  assert.ok(d.low < 0.75 && d.high > 0.75 && d.low > 0 && d.high < 1, "the whisker spans the share and stays inside the frame");
});

test("a sticker in the ask page's address is the preset mark only when it is this person's own", () => {
  const mine = [{ id: "3f2b5c1e-9d7a-4b8c-8e2f-1a2b3c4d5e6f", ink: "clay" as const }];
  assert.deepEqual(initialStickerMark("3F2B5C1E-9D7A-4B8C-8E2F-1A2B3C4D5E6F", mine), { kind: "sticker", id: mine[0]!.id, ink: "clay" });
  assert.equal(initialStickerMark("00000000-0000-4000-8000-000000000000", mine), null, "someone else's sticker is no mark");
  assert.equal(initialStickerMark("not-an-id", mine), null);
  assert.equal(initialStickerMark(undefined, mine), null);
});
