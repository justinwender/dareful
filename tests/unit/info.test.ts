/**
 * The information sheets (docs/design.md 10.6, 10.7): every sheet holds to the rules for writing one, the fixed
 * line is word for word, and no sheet borrows a banned word. The lint over the sheets can fail: a sheet built to
 * break each rule is refused. A check that cannot fail is worse than no check.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { INFO_DESCRIPTION_CHARS, INFO_ENTRIES_MAX, INFO_FIXED_LINE, INFO_GROUPS, INFO_TERM_WORDS, sheetProblems, type InfoSheet } from "@/lib/ui/info";
import { INFO_SHEETS } from "@/lib/ui/info-sheets";

/** The words no screen says (4.6), as the http suite scans for them, and the sheet's own (10.6). */
const BANNED = /\b(owes?|owed|debt|balance|outstanding|overdue|wallet|transaction|gas|signature|chain|token|button|click|simply|press|long-press|scroll)\b/i;

test("the fixed line is the doc's, word for word (10.7), and the sheet draws it", () => {
  assert.equal(INFO_FIXED_LINE, "This sheet is here only for the hackathon, so every feature on every screen can be seen.");
  assert.ok(readFileSync("src/components/ui/info.tsx", "utf8").includes("INFO_FIXED_LINE"), "the sheet component draws the fixed line");
  assert.deepEqual(INFO_GROUPS, ["Gestures", "Icons", "Rules and timing", "Everything else"]);
  assert.equal(INFO_TERM_WORDS, 5);
  assert.equal(INFO_DESCRIPTION_CHARS, 90);
  assert.equal(INFO_ENTRIES_MAX, 16);
});

test("every sheet holds to 10.6: the groups in order, terms of five words, one sentence of ninety characters, sixteen entries, gestures and icons named as the doc names them, and no banned word", () => {
  const keys = Object.keys(INFO_SHEETS);
  assert.ok(keys.length >= 28, `sheets for every screen 10.1 lists: ${keys.length}`);
  for (const key of keys) {
    const sheet = INFO_SHEETS[key] as InfoSheet;
    assert.deepEqual(sheetProblems(sheet), [], `${key}: ${sheetProblems(sheet).join("; ")}`);
    const text = [sheet.name, ...Object.values(sheet.groups).flat().flatMap((e) => [e.term, e.description, e.qualifier ?? ""])].join(" ");
    const m = BANNED.exec(text);
    assert.equal(m, null, `${key}: banned word "${m?.[0]}"`);
    assert.ok(!/[—]/.test(text), `${key}: an em dash`);
  }
  // The worked example (10.8): fifteen entries for a yes-or-no market while it's open, plus the settling rule the stake step no longer states (4.9); the swaps for the other kinds.
  const open = INFO_SHEETS["market-open"] as InfoSheet;
  assert.equal(Object.values(open.groups).flat().length, 16);
  assert.ok(open.groups["Rules and timing"]?.some((e) => /land closer than you, and only by the gap/.test(e.description)), "the settling rule is on the market's sheet");
  assert.ok(open.groups.Gestures?.some((e) => e.term === "Drag along the odds line"));
  assert.ok((INFO_SHEETS["market-open-number"] as InfoSheet).groups.Gestures?.some((e) => e.term === "Tap the number"));
  assert.ok((INFO_SHEETS["market-open-pick"] as InfoSheet).groups.Gestures?.some((e) => e.term === "Tap an answer"));
  // The shared gestures are on Now's sheet and nowhere else (10.6).
  assert.ok(INFO_SHEETS["now"]?.groups.Gestures?.some((e) => /Swipe down from the top/.test(e.term)));
  for (const key of keys) if (key !== "now" && key !== "now-first-run") assert.ok(!Object.values((INFO_SHEETS[key] as InfoSheet).groups).flat().some((e) => /from the top/.test(e.term)), `${key} repeats a shared gesture`);
});

test("the lint over the sheets refuses each rule broken (10.6)", () => {
  const long: InfoSheet = { name: "A", groups: { Gestures: [{ term: "Tap it", description: "x".repeat(91) + "." }] } };
  assert.ok(sheetProblems(long).some((p) => /over 90 characters/.test(p)));
  const words: InfoSheet = { name: "A", groups: { "Rules and timing": [{ term: "one two three four five six", description: "Fine." }] } };
  assert.ok(sheetProblems(words).some((p) => /over 5 words/.test(p)));
  const order: InfoSheet = { name: "A", groups: { Icons: [{ term: "More", description: "Fine.", glyph: "more" }], Gestures: [{ term: "Tap it", description: "Fine." }] } };
  assert.ok(sheetProblems(order).some((p) => /out of order/.test(p)));
  const gesture: InfoSheet = { name: "A", groups: { Gestures: [{ term: "Press it", description: "Fine." }] } };
  assert.ok(sheetProblems(gesture).some((p) => /starts with Tap/.test(p)));
  const icon: InfoSheet = { name: "A", groups: { Icons: [{ term: "More", description: "Fine." }] } };
  assert.ok(sheetProblems(icon).some((p) => /names its glyph/.test(p)));
  const many: InfoSheet = { name: "A", groups: { "Everything else": Array.from({ length: 17 }, (_, i) => ({ term: `Thing ${i}`, description: "Fine." })) } };
  assert.ok(sheetProblems(many).some((p) => /at most 16/.test(p)));
  const two: InfoSheet = { name: "A", groups: { "Everything else": [{ term: "Thing", description: "One. Two." }] } };
  assert.ok(sheetProblems(two).some((p) => /more than one sentence/.test(p)));
  const bang: InfoSheet = { name: "A", groups: { "Everything else": [{ term: "Thing", description: "Wow!" }] } };
  assert.ok(sheetProblems(bang).some((p) => /exclamation/.test(p) || /not one sentence/.test(p)));
  const fine: InfoSheet = { name: "A market, while it’s open", groups: { Gestures: [{ term: "Tap the avatars", description: "Opens who’s in." }] } };
  assert.deepEqual(sheetProblems(fine), []);
});
