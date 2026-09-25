/**
 * Market inks (docs/design.md 1.8) as rules: eight inks, the hue snaps to the nearest, a hueless mark or none
 * falls to a hash of the id, a creator's pick is honoured, and balance keeps two open questions between the same
 * people from sharing an ink while fewer than eight are open.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { drawable, EMOJI_INK_COUNT, emojiInk, normaliseMark } from "@/lib/ui/emoji-ink";
import { balanceInk, hashInk, hueDistance, INK_NAMES, INKS, inkFor, inkOf, inkVars, nearestInk } from "@/lib/ui/ink";

test("a hue snaps to the nearest of the eight inks, the short way round the wheel", () => {
  assert.equal(nearestInk(85), "ochre");
  assert.equal(nearestInk(140), "olive", "green folds into Olive");
  assert.equal(nearestInk(160), "olive", "the green fold runs to 165, past where Sea would be nearer");
  assert.equal(nearestInk(200), "sea");
  assert.equal(nearestInk(355), "rose", "just past the top of the wheel is Rose, not Plum");
  assert.equal(nearestInk(29), "rose", "sRGB red is 29 in OKLCH, nearer Clay by the wheel; reds fold into Rose (1.8)");
  assert.equal(nearestInk(38), "rose", "an apple is red");
  assert.equal(nearestInk(30, 0.2), "rose", "a saturated red-orange is red");
  assert.equal(nearestInk(30, 0.1), "clay", "a low-chroma brown in the same band is Clay (1.8)");
  assert.equal(nearestInk(10, 0.05), "rose", "under 20 every chroma is red");
  assert.equal(nearestInk(43), "clay", "a fox is orange, and Clay");
  assert.equal(hueDistance(350, 10), 20);
  assert.equal(hueDistance(10, 350), 20);
});

test("the emoji ink table wins: an emoji reads as the ink the reference font gives it, never a hue this phone draws", () => {
  assert.equal(emojiInk("👕"), "sea", "teal in Noto Color Emoji, even where a phone draws it blue (1.8)");
  assert.equal(emojiInk("🍺"), "ochre");
  assert.equal(emojiInk("🍎"), "rose", "reds land on Rose: the table encodes the fold directly");
  assert.equal(emojiInk("🍅"), "rose");
  assert.equal(emojiInk("❤️"), "rose", "with its variation selector");
  assert.equal(emojiInk("🦊"), "clay", "orange stays Clay");
  assert.equal(emojiInk("😂"), null, "a face is a template, not a choice: the hash");
  assert.equal(emojiInk("👍"), null, "a hand is a template");
  assert.equal(emojiInk("🍸"), null, "fewer than a quarter of its pixels carry colour");
  assert.ok(EMOJI_INK_COUNT >= 1900 && EMOJI_INK_COUNT <= 2000, `the table has ${EMOJI_INK_COUNT} entries`);
  assert.equal(inkFor({ markInk: emojiInk("👕"), id: "x", takenInGroup: [] }).ink, "sea");
  assert.equal(inkFor({ markInk: emojiInk("😂"), id: "8ffed2db-77af-40a1-8858-f8e33d440095", takenInGroup: [] }).source, "hash");
});

test("skin tone and the variation selector never pick an ink, and an emoji the renderer cannot draw is not drawable", () => {
  assert.equal(normaliseMark("👍🏽"), "👍");
  assert.equal(normaliseMark("❤️"), "❤");
  assert.equal(emojiInk("👋🏿"), emojiInk("👋"), "a skin-tone variant inherits its default form");
  assert.equal(drawable("🍺"), true);
  assert.equal(drawable("❤️"), true, "the selector is stripped before the lookup");
  assert.equal(drawable("😂"), true, "a template mark is drawable, it just takes the hash");
  assert.equal(drawable("🫍"), false, "an orca is newer than the reference font: the asking tile would show a blank box");
  assert.equal(drawable("x"), false);
  assert.equal(emojiInk("🫍"), null);
});

test("a hueless mark, or no mark, gets a stable ink from the market id", () => {
  const id = "8ffed2db-77af-40a1-8858-f8e33d440095";
  assert.equal(hashInk(id), "sea", "the same id always hashes to the same ink, on every read and every deploy");
  assert.equal(hashInk("6f21af46-e0b9-4ae4-b1ac-1703ccdfe82d"), "plum");
  assert.ok(new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map(hashInk)).size >= 3, "ids spread across the inks");
  assert.equal(inkFor({ markInk: null, id, takenInGroup: [] }).source, "hash");
  assert.equal(inkOf({ id, ink: null }), hashInk(id), "a row from before inks existed reads as its hash");
  assert.equal(inkOf({ id, ink: "sea" }), "sea", "a stored ink is what it says");
});

test("a creator's pick wins over the mark and is never moved by balance", () => {
  assert.deepEqual(inkFor({ pick: "plum", markInk: "ochre", id: "x", takenInGroup: ["plum"] }), { ink: "plum", source: "pick" });
  assert.equal(inkFor({ markInk: "ochre", id: "x", takenInGroup: [] }).source, "mark");
});

test("balance: a collision moves the newcomer to the nearest free ink, and stops once eight are open", () => {
  assert.equal(balanceInk("ochre", []), "ochre");
  assert.equal(balanceInk("ochre", ["ochre"]), "olive", "the nearest free neighbour on the wheel (85 to 112 beats 85 to 45)");
  assert.equal(balanceInk("ochre", ["ochre", "olive"]), "clay");
  assert.equal(balanceInk("ochre", [...INK_NAMES]), "ochre", "with all eight open nothing moves");
  assert.equal(inkFor({ markInk: emojiInk("🍺"), id: "x", takenInGroup: ["ochre"] }).ink, "olive", "beer no longer turns every Friday market Ochre");
});

test("a market's own screen swaps ground, surface, line and field for its layers and nothing else", () => {
  const v = inkVars("sea");
  assert.deepEqual(Object.keys(v).sort(), ["--field", "--ground", "--line", "--market-ink", "--market-ink-hi", "--market-wash", "--surface"]);
  assert.equal(v["--ground"], INKS.sea.ground);
  assert.equal(v["--field"], INKS.sea.field);
  assert.equal("--ink" in v, false, "type colours are never tinted");
  assert.equal("--chalk" in v, false, "the chalk button is never tinted");
});
