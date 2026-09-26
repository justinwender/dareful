/**
 * Outcome words (docs/design.md 3.25) as rules: a yes-or-no market says its outcomes in the question's own words
 * when the write-up gave four usable phrasings, and "Yes" and "No" otherwise, so nothing breaks for a market
 * made before; the settled line always ends in a full stop; a phrase after a name loses its capital unless it
 * is a name or "I"; and the recorded write-up carries the four. The night rules of the memory screen (3.37) sit
 * beside them, since both arrived with the reconciled design.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { answerFrom } from "@/lib/ai/client";
import { Scope } from "@/lib/ai/markets";
import { nightHeading, nightWindow, pickNight, sharesTheNight } from "@/lib/ledger/night";
import { lowerFirst, outcomeLine, outcomeWordsFrom, outcomeWordsOf, saidWord, wellWord } from "@/lib/ui/outcome-words";

const words = { outcomeWords: ["He fell asleep", "He stayed up", "He did.", "He didn't."] };
const none = { outcomeWords: null };

test("a market with its outcomes in its own words says them on the wells, after a name, and as the settled line", () => {
  assert.deepEqual(outcomeWordsOf(words), { yesWell: "He fell asleep", noWell: "He stayed up", yesLine: "He did.", noLine: "He didn't." });
  assert.equal(wellWord(words, true), "He fell asleep");
  assert.equal(wellWord(words, false), "He stayed up");
  assert.equal(saidWord(words, true), "he fell asleep", "after a name the phrase loses its capital");
  assert.equal(outcomeLine(words, true), "He did.");
  assert.equal(outcomeLine(words, false), "He didn't.");
  assert.equal(outcomeLine({ outcomeWords: ["a", "b", "It rained", "It stayed dry"] }, true), "It rained.", "the settled line always ends in a full stop");
});

test("a market without them, or with a malformed set, falls back to Yes and No, so nothing made before breaks", () => {
  assert.equal(outcomeWordsOf(none), null);
  assert.equal(outcomeWordsOf({ outcomeWords: ["He fell asleep", "He stayed up"] }), null, "four or nothing");
  assert.equal(outcomeWordsOf({ outcomeWords: ["He fell asleep", " ", "He did.", "He didn't."] }), null, "a blank one is none");
  assert.equal(wellWord(none, true), "Yes");
  assert.equal(wellWord(none, false), "No");
  assert.equal(saidWord(none, true), "yes");
  assert.equal(outcomeLine(none, true), "Yes.");
  assert.equal(outcomeLine(none, false), "No.");
});

test("a phrase after a name loses its capital when it opens with a pronoun or a function word, and never when it opens with a name", () => {
  assert.equal(lowerFirst("He fell asleep"), "he fell asleep");
  assert.equal(lowerFirst("The kettle boiled dry"), "the kettle boiled dry");
  assert.equal(lowerFirst("Nobody showed up"), "nobody showed up");
  assert.equal(lowerFirst("Gabe wore 14"), "Gabe wore 14", "a name keeps its capital: \"Priya says Gabe wore 14\"");
  assert.equal(lowerFirst("NYC got snow"), "NYC got snow", "an initialism keeps its capitals");
  assert.equal(lowerFirst("I made it"), "I made it");
  assert.equal(lowerFirst("Theo turned up"), "Theo turned up");
});

test("the write-up's four phrasings are kept only when all four are usable, and never too long for a well", () => {
  assert.deepEqual(outcomeWordsFrom({ yesWell: " He fell  asleep ", noWell: "He stayed up", yesLine: "He did.", noLine: "He didn't." }), ["He fell asleep", "He stayed up", "He did.", "He didn't."]);
  assert.equal(outcomeWordsFrom({ yesWell: "He fell asleep", noWell: "", yesLine: "He did.", noLine: "He didn't." }), null, "one missing is none");
  assert.equal(outcomeWordsFrom({ yesWell: "x".repeat(49), noWell: "He stayed up", yesLine: "He did.", noLine: "He didn't." }), null, "too long for a well");
  assert.equal(outcomeWordsFrom(null), null);
});

test("the recorded write-up carries the four phrasings, in the question's own words", () => {
  const recorded = JSON.parse(readFileSync(new URL("../fixtures/anthropic/scope-market.json", import.meta.url), "utf8")) as { content: Array<{ type: string; name?: string; input?: unknown }> };
  const scope = answerFrom(recorded, "write_terms", Scope, "t");
  const four = outcomeWordsFrom(scope.outcomes);
  assert.ok(four, "the model wrote all four");
  assert.ok(four.every((w) => !/^(yes|no)\.?$/i.test(w)), "never yes or no as the whole phrase");
  assert.match(four[2], /\.$/, "the settled line has its full stop");
});

test("the rest of that night: six hours either side, at least two of the market's people with the viewer among them, five oldest first", () => {
  const closed = new Date("2026-09-25T23:00:00Z");
  const ended = new Date("2026-09-26T01:00:00Z");
  assert.deepEqual(nightWindow(closed, ended), { from: new Date("2026-09-25T17:00:00Z"), to: new Date("2026-09-26T07:00:00Z") });
  assert.equal(sharesTheNight(["a", "b", "c"], ["a", "b"], "a"), true);
  assert.equal(sharesTheNight(["a", "b", "c"], ["a", "z"], "a"), false, "one shared person is a coincidence, not the same night");
  assert.equal(sharesTheNight(["a", "b", "c"], ["b", "c"], "a"), false, "the viewer has to have been there");
  assert.equal(sharesTheNight(["a", "b", "c"], ["a", "a", "z"], "a"), false, "the same person twice is one person");
  assert.equal(nightHeading(new Date("2026-09-26T01:00:00Z"), "America/New_York"), "The rest of that night", "9pm in New York");
  assert.equal(nightHeading(new Date("2026-09-25T16:00:00Z"), "America/New_York"), "The rest of that day", "noon in New York");
  const rows = Array.from({ length: 7 }, (_, i) => ({ at: new Date(1_700_000_000_000 - i * 60_000), id: i }));
  assert.deepEqual(pickNight(rows).map((r) => r.id), [6, 5, 4, 3, 2], "the five oldest, oldest first");
});
