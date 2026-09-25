/**
 * Number markets, by hand first (PLANNING.md 8c; docs/design.md 3.22, 3.26; docs/decisions.md 2026-09-24). The
 * worked example below was computed with a pencil before any of this code ran, and its working is in the
 * comments: five people, a spread of entries, one far outlier, and a scale of 20. It is met four ways, as the
 * binary example was: here by the mirror, in tests/db/scoring-chain.test.ts by the deployed contract's own
 * function, in tests/db/numbers.test.ts on a real market, and by verify-envio over every number market.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { nets, scoreNumeric, settle } from "@/lib/ledger/scoring";
import { axisEnds, numberAxis, ruler, sliceOf, splitOffAxis, unitPhrase, weightedMedian, withSeparators } from "@/lib/ledger/number-axis";
import { checkScale, farOffThreshold, oneSignificant, parseAskerScale, scaleAfterward } from "@/lib/ledger/scale";
import { binaryBins, MIN_CALIBRATION, numericMiss } from "@/lib/ledger/calibration";
import { callToOutcome, outcomeAllowed, valueAllowed, VOID_OUTCOME } from "@/lib/ledger/markets";
import { pulseOf } from "@/lib/ledger/pulse";
import { resultNotice, rulingNotice } from "@/lib/notify/messages";
import { CATEGORIES, matches, type CatalogRow } from "@/lib/ui/mark-catalog";
import { drawable, EMOJI_INK_COUNT } from "@/lib/ui/emoji-ink";
import catalog from "@/lib/ui/emoji-catalog.json";

// "How many shirts can Gabe wear at once?" Scored on 20 shirts. Answer: 14. Stakes in cents.
//   Priya  14 at $5     miss 0    S = 10000
//   Gabe   18 at $10    miss 4    4 x 10000 / 20 = 2000            S = 8000
//   Theo   12 at $5     miss 2    1000                              S = 9000
//   Maya    9 at $20    miss 5    2500                              S = 7500
//   John  200 at $5     miss 186, past the scale                    S = 0
const SHIRTS = [
  { id: "priya", stake: 500n, value: 14n },
  { id: "gabe", stake: 1000n, value: 18n },
  { id: "theo", stake: 500n, value: 12n },
  { id: "maya", stake: 2000n, value: 9n },
  { id: "john", stake: 500n, value: 200n },
];
const UNIT = { singular: "shirt", plural: "shirts" };
const scored = SHIRTS.map((p) => ({ id: p.id, stake: p.stake, score: scoreNumeric(p.value, 14n, 20n) }));

test("the shirts: scores 10000, 8000, 9000, 7500, 0, with the far-off entry floored at zero", () => {
  assert.deepEqual(
    scored.map((p) => p.score),
    [10000n, 8000n, 9000n, 7500n, 0n],
  );
  // The contract's own table (contracts/test/DarefulDares.t.sol), for the integer division.
  assert.equal(scoreNumeric(1n, 0n, 3n), 6667n);
  assert.equal(scoreNumeric(2n, 0n, 3n), 3334n);
  assert.equal(scoreNumeric(150n, 50n, 100n), 0n, "at the edge of the scale");
  assert.equal(scoreNumeric(20n, 12n, 20n), 6000n);
  assert.throws(() => scoreNumeric(1n, 1n, 0n), RangeError);
});

test("the shirts: ten edges, each truncated toward zero on its own", () => {
  // Divisor (N - 1) x 10000 = 40000.
  //   Priya-Gabe   500 x 2000  = 1,000,000 / 40000 = 25        Gabe pays Priya 25
  //   Priya-Theo   500 x 1000  =   500,000 / 40000 = 12.5 -> 12
  //   Priya-Maya   500 x 2500  = 1,250,000 / 40000 = 31.25 -> 31
  //   Priya-John   500 x 10000 = 5,000,000 / 40000 = 125
  //   Gabe-Theo    500 x -1000 =  -500,000 / 40000 = -12.5 -> -12  Gabe pays Theo 12
  //   Gabe-Maya   1000 x 500   =   500,000 / 40000 = 12.5 -> 12    Maya pays Gabe 12
  //   Gabe-John    500 x 8000  = 4,000,000 / 40000 = 100
  //   Theo-Maya    500 x 1500  =   750,000 / 40000 = 18.75 -> 18
  //   Theo-John    500 x 9000  = 4,500,000 / 40000 = 112.5 -> 112
  //   Maya-John    500 x 7500  = 3,750,000 / 40000 = 93.75 -> 93
  assert.deepEqual(settle(scored), [
    { debtor: "gabe", creditor: "priya", qty: 25n },
    { debtor: "theo", creditor: "priya", qty: 12n },
    { debtor: "maya", creditor: "priya", qty: 31n },
    { debtor: "john", creditor: "priya", qty: 125n },
    { debtor: "gabe", creditor: "theo", qty: 12n },
    { debtor: "maya", creditor: "gabe", qty: 12n },
    { debtor: "john", creditor: "gabe", qty: 100n },
    { debtor: "maya", creditor: "theo", qty: 18n },
    { debtor: "john", creditor: "theo", qty: 112n },
    { debtor: "john", creditor: "maya", qty: 93n },
  ]);
});

test("the shirts: nets +193, +75, +130, +32, -430, summing to zero, and John is out less than his $5", () => {
  const n = nets(scored, settle(scored));
  assert.deepEqual(["priya", "gabe", "theo", "maya", "john"].map((id) => n.get(id)), [193n, 75n, 130n, 32n, -430n]);
  assert.equal([...n.values()].reduce((a, b) => a + b, 0n), 0n);
  assert.ok((n.get("john") as bigint) >= -500n);
});

test("the same entries on a scale a hundred times too wide: nearly nothing changes hands, which is what the check refuses", () => {
  const wide = SHIRTS.map((p) => ({ id: p.id, stake: p.stake, score: scoreNumeric(p.value, 14n, 10_000n) }));
  assert.deepEqual(
    wide.map((p) => p.score),
    [10000n, 9996n, 9998n, 9995n, 9814n],
  );
  const edges = settle(wide);
  assert.ok(edges.every((e) => e.qty <= 2n), "a $5 miss by 186 shirts costs two cents");
  assert.equal(scaleAfterward(wide.map((p) => p.score)).allNear, true);
  assert.deepEqual(scaleAfterward(scored.map((p) => p.score)), { floored: 1, of: 5, allNear: false });
});

// ------------------------------------------------------------------------------------------------ the axis

test("the shirts on the axis: 200 is off the high end, the rest draw a column per value from 9 to 18, and the median stands on 12", () => {
  const a = numberAxis(SHIRTS, UNIT);
  assert.ok(a);
  assert.deepEqual([a.lo, a.hi, a.mode], [9n, 18n, "values"]);
  assert.equal(a.columns.length, 10);
  assert.equal(a.offHigh?.value, 200n);
  assert.equal(a.offHigh?.label, "200 →");
  assert.equal(a.offLow, null);
  // Heights are stake: Maya's $20 at 9 is the tallest; John's $5 off-axis is a quarter of it.
  assert.deepEqual(a.columns.map((c) => c.heightPermille), [1000, 0, 0, 250, 0, 250, 0, 0, 0, 500]);
  assert.equal(a.offHigh?.heightPermille, 250);
  // Ten per-value columns: only the two ends and the middle are labelled, the unit on the right end alone.
  assert.deepEqual(a.columns.map((c) => c.label), ["9", null, null, null, "13", null, null, null, null, "18 shirts"]);
  // The median: $45 riding in all; sorted, 9 carries $20 (under half), 12 brings it to $25 (half or more): the group's number is 12,
  // on the fourth of ten columns, x = (12 - 9 + 0.5) / 10 = 0.35. The far-off 200 with $5 cannot move it (the mean would be 33, past the edge).
  assert.deepEqual(a.marker, { at: "axis", xPermille: 350, chip: "12" });
});

test("the group's number on a number market is the stake-weighted median: half the stake at or below it, one of the entries, unmoved by one far-off number", () => {
  assert.equal(weightedMedian(SHIRTS), 12n);
  assert.equal(weightedMedian(SHIRTS.map((e) => (e.id === "john" ? { ...e, value: 20_000n } : e))), 12n, "however far the far-off entry goes");
  // Its stake still counts: without John's $5, Maya's $20 is exactly half of $40 and the median is her 9. The value never moves it; the stake can.
  assert.equal(weightedMedian(SHIRTS.filter((e) => e.id !== "john")), 9n);
  // A far-off entry that holds more than half of everything riding is the median: the marker then stands over its own column.
  const heavy = SHIRTS.map((e) => (e.id === "john" ? { ...e, stake: 5000n } : e));
  assert.equal(weightedMedian(heavy), 200n);
  const a = numberAxis(heavy, UNIT);
  assert.deepEqual(a?.marker, { at: "offHigh", xPermille: 500, chip: "200" });
  assert.equal(a?.offHigh?.value, 200n);
  // Exactly half at a boundary takes the lower value (the smallest with at least half at or below it), so it is always an entry.
  assert.equal(weightedMedian([{ id: "a", stake: 500n, value: 10n }, { id: "b", stake: 500n, value: 20n }]), 10n);
  // Nothing riding: everyone weighs the same.
  assert.equal(weightedMedian([3n, 5n, 8n].map((v, i) => ({ id: String(i), stake: 0n, value: v }))), 5n);
  assert.equal(weightedMedian([]), null);
});

test("a single entry draws its number with one either side, itself in the middle at full height, and no marker", () => {
  const a = numberAxis([{ id: "you", stake: 500n, value: 14n }], UNIT);
  assert.ok(a);
  assert.deepEqual([a.lo, a.hi, a.mode, a.columns.length], [13n, 15n, "values", 3]);
  assert.deepEqual(a.columns.map((c) => c.heightPermille), [0, 1000, 0]);
  assert.deepEqual(a.columns.map((c) => c.label), ["13", "14", "15 shirts"]);
  assert.equal(a.marker, null);
  assert.deepEqual(axisEnds([0n]), { lo: 0n, hi: 2n }, "never below zero: zero draws 0 to 2");
});

test("everyone on 14 draws 13 to 15 with the marker on the middle column; a wide spread gets ten slices with lo in the first", () => {
  const same = numberAxis([1, 2, 3].map((i) => ({ id: String(i), stake: 100n, value: 14n })), UNIT);
  assert.ok(same);
  assert.deepEqual([same.lo, same.hi], [13n, 15n]);
  assert.deepEqual(same.marker, { at: "axis", xPermille: 500, chip: "14" }, "(14 - 13 + 0.5) / 3");
  const wide = numberAxis(
    [
      { id: "a", stake: 100n, value: 0n },
      { id: "b", stake: 100n, value: 25n },
      { id: "c", stake: 100n, value: 60n },
    ],
    { singular: "person", plural: "people" },
  );
  assert.ok(wide);
  assert.deepEqual([wide.lo, wide.hi, wide.mode], [0n, 60n, "slices"]);
  assert.deepEqual(wide.columns.map((c) => c.label), ["0", null, null, null, "30", null, null, null, null, "60 people"]);
  assert.deepEqual([sliceOf(0n, 0n, 60n), sliceOf(1n, 0n, 60n), sliceOf(6n, 0n, 60n), sliceOf(7n, 0n, 60n), sliceOf(25n, 0n, 60n), sliceOf(60n, 0n, 60n)], [1, 1, 1, 2, 5, 10]);
  assert.deepEqual(wide.columns.map((c) => c.people), [1, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  // Equal stakes: the median is the middle entry, 25, at x = 25 / 60 = 0.416.
  assert.deepEqual(wide.marker, { at: "axis", xPermille: 416, chip: "25" });
});

test("the off-axis rule needs four entries, checks the high end first, then the low end, and keeps three on the axis", () => {
  assert.deepEqual(splitOffAxis([9n, 12n, 200n]), { keep: [9n, 12n, 200n], offHigh: null, offLow: null }, "three entries: nothing is off");
  assert.deepEqual(splitOffAxis([9n, 12n, 14n, 18n, 200n]), { keep: [9n, 12n, 14n, 18n], offHigh: 200n, offLow: null });
  assert.deepEqual(splitOffAxis([0n, 40n, 42n, 45n, 50n]), { keep: [40n, 42n, 45n, 50n], offHigh: null, offLow: 0n });
  assert.deepEqual(splitOffAxis([0n, 40n, 42n, 45n, 500n]), { keep: [40n, 42n, 45n], offHigh: 500n, offLow: 0n }, "one at each end, three left on the axis");
  assert.deepEqual(splitOffAxis([0n, 40n, 42n, 500n]), { keep: [0n, 40n, 42n], offHigh: 500n, offLow: null }, "the low end would leave two: it stays");
});

test("the ruler's ends take the answer in, and the answer is never the one pushed off", () => {
  const pins = SHIRTS.map((p) => ({ id: p.id, value: p.value }));
  const r = ruler(pins, 14n, UNIT);
  assert.ok(r);
  assert.deepEqual([r.lo, r.hi, r.leftLabel, r.rightLabel], [9n, 18n, "9", "18 shirts"]);
  assert.equal(r.answer?.xPermille, 555, "(14 - 9) / 9");
  assert.deepEqual(r.pins.find((p) => p.id === "john"), { id: "john", value: 200n, xPermille: 1000, off: "high" });
  assert.deepEqual(r.pins.find((p) => p.id === "maya"), { id: "maya", value: 9n, xPermille: 0, off: null });
  // Everyone guessed low and the answer was far off: the answer stretches the ruler rather than falling off it.
  const far = ruler(
    [9n, 12n, 14n, 18n].map((v, i) => ({ id: String(i), value: v })),
    200n,
    UNIT,
  );
  assert.ok(far);
  assert.deepEqual([far.lo, far.hi, far.answer?.xPermille], [9n, 200n, 1000]);
  assert.ok(far.pins.every((p) => p.off === null));
});

test("a number is written with separators and the form of the unit that matches", () => {
  assert.equal(withSeparators(1240n), "1,240");
  assert.equal(withSeparators(999_999_999n), "999,999,999");
  assert.equal(unitPhrase(1n, UNIT), "1 shirt");
  assert.equal(unitPhrase(14n, UNIT), "14 shirts");
  assert.equal(unitPhrase(0n, UNIT), "0 shirts");
});

// ---------------------------------------------------------------------------------------------- the scale

test("a model's scale is used only when it sits between a quarter of its own typical answer and four times it", () => {
  assert.deepEqual(checkScale({ low: 5, high: 30, typical: 14 }), { ok: true, range: 25n });
  assert.deepEqual(checkScale({ low: 0, high: 10_000, typical: 14 }), { ok: false, why: "wide" }, "a scale a hundred times the answer scores everyone near one");
  assert.deepEqual(checkScale({ low: 13, high: 15, typical: 14 }), { ok: false, why: "narrow" }, "a scale of two floors most reasonable answers");
  assert.deepEqual(checkScale({ low: 20, high: 30, typical: 14 }), { ok: false, why: "order" }, "the typical answer outside its own span");
  assert.deepEqual(checkScale({ low: 14, high: 14, typical: 14 }), { ok: false, why: "order" });
  assert.deepEqual(checkScale({ low: 0.5, high: 30, typical: 14 }), { ok: false, why: "shape" });
  assert.deepEqual(checkScale({ low: 0, high: 3, typical: 0 }), { ok: true, range: 3n }, "a typical answer of zero reads as one: a span up to four");
  assert.deepEqual(checkScale({ low: 0, high: 5, typical: 0 }), { ok: false, why: "wide" });
  assert.equal(parseAskerScale(" 1,200 "), 1200n);
  assert.equal(parseAskerScale("0"), null);
  assert.equal(parseAskerScale("12.5"), null);
  assert.equal(parseAskerScale("1234567890"), null, "at most nine digits");
});

// ------------------------------------------------------------------------------------------- calibration

test("calibration bins are the tenths of the weight line, hits are what came true, and ten resolved questions is the floor", () => {
  const rows = [
    { valueBps: 7000n, outcome: 1 as const, score: 9100 },
    { valueBps: 6500n, outcome: 0 as const, score: 5775 },
    { valueBps: 2000n, outcome: 0 as const, score: 9600 },
    { valueBps: 9000n, outcome: 1 as const, score: 9900 },
  ];
  const r = binaryBins(rows);
  assert.equal(r.resolved, 4);
  assert.equal(r.enough, false);
  assert.deepEqual(r.bins, [
    { bucket: 2, count: 1, hits: 0, meanBps: 2000 },
    { bucket: 7, count: 2, hits: 1, meanBps: 6750 },
    { bucket: 9, count: 1, hits: 1, meanBps: 9000 },
  ]);
  assert.equal(r.meanScore, Math.round((9100 + 5775 + 9600 + 9900) / 4));
  assert.equal(MIN_CALIBRATION, 10);
  assert.equal(binaryBins(Array.from({ length: 10 }, () => rows[0] as (typeof rows)[number])).enough, true);
  assert.deepEqual(binaryBins([]), { resolved: 0, enough: false, bins: [], meanScore: null });
  // A number market's record is the score's complement: the miss as a fraction of the scale.
  assert.deepEqual(numericMiss([10000, 8000, 9000, 7500, 0]), { resolved: 5, meanMissBps: 3100 });
  assert.deepEqual(numericMiss([]), { resolved: 0, meanMissBps: null });
});

// ------------------------------------------------------------------------------------- what a number market takes

test("a number question takes any whole number up to nine digits as an entry or a vote, and a yes-or-no question still takes 0 to 10000 or yes and no", () => {
  assert.equal(valueAllowed("numeric", 0n), true);
  assert.equal(valueAllowed("numeric", 999_999_999n), true);
  assert.equal(valueAllowed("numeric", 1_000_000_000n), false, "ten digits");
  assert.equal(valueAllowed("numeric", -1n), false);
  assert.equal(valueAllowed("binary", 10_000n), true);
  assert.equal(valueAllowed("binary", 10_001n), false);
  assert.equal(outcomeAllowed("numeric", 15n), true, "a dissenter's number is a vote for that number");
  assert.equal(outcomeAllowed("numeric", VOID_OUTCOME), true, "nobody can tell is still allowed");
  assert.equal(outcomeAllowed("numeric", 1_000_000_000n), false);
  assert.equal(outcomeAllowed("binary", 15n), false, "a yes-or-no question takes no other number");
  assert.equal(outcomeAllowed("binary", 1n), true);
  assert.equal(callToOutcome("n:14"), 14n);
  assert.equal(callToOutcome("n:1234567890"), null);
  assert.equal(callToOutcome("n:x"), null);
  assert.equal(callToOutcome("void"), VOID_OUTCOME);
});

test("a market's pulse moves with a vote, with what was said, and with the answer, and reads the same twice otherwise", () => {
  const t = new Date("2026-09-25T20:00:00Z");
  const base = { votes: [{ userId: "b", outcome: 14n, signedAt: t }, { userId: "a", outcome: 14n, signedAt: t }], statements: [{ userId: "a", statedAt: t }], resolvedAt: null, aiProposedAt: null };
  const p = pulseOf(base);
  assert.equal(p, pulseOf({ ...base, votes: [...base.votes].reverse() }), "the same votes in another order are the same pulse");
  assert.notEqual(p, pulseOf({ ...base, votes: [...base.votes, { userId: "c", outcome: 15n, signedAt: t }] }), "a vote");
  assert.notEqual(p, pulseOf({ ...base, votes: [{ userId: "b", outcome: 15n, signedAt: t }, base.votes[1] as (typeof base.votes)[number]] }), "a changed vote");
  assert.notEqual(p, pulseOf({ ...base, statements: [] }), "what was said");
  assert.notEqual(p, pulseOf({ ...base, resolvedAt: t }), "the answer");
  assert.notEqual(p, pulseOf({ ...base, aiProposedAt: t }), "the app's proposal");
});

test("a notice about a number question carries no number: the answer waits on the screen the notice opens", () => {
  const r = resultNotice({ deciderName: "Maya", title: "How many shirts can Gabe wear at once?", outcome: "number", marketId: "m1", appUrl: "https://dareful.app" });
  assert.match(r.body, /^Decided\. Maya's call settled it/);
  assert.doesNotMatch(`${r.title} ${r.body}`, /\d/);
  const ruled = rulingNotice({ askerName: "Sam", title: "How many shirts can Gabe wear at once?", outcome: "number", marketId: "m1", appUrl: "https://dareful.app" });
  assert.doesNotMatch(`${ruled.title} ${ruled.body}`, /\d/);
});

// ------------------------------------------------------------------------------------------ the mark picker

test("the picker offers exactly what the tile renderer can draw, in nine categories, and a search matches a word's start", () => {
  const rows = catalog as unknown as CatalogRow[];
  assert.equal(rows.length, EMOJI_INK_COUNT, "one cell per key of the ink table");
  assert.ok(rows.every((r) => drawable(r[0])), "nothing the reference font cannot draw");
  assert.ok(!rows.some((r) => r[0] === "🫍"), "an orca is newer than the reference font: not offered");
  assert.deepEqual(new Set(rows.map((r) => r[2])), new Set(CATEGORIES.map((c) => c.group)), "every row has a chip and every chip has rows");
  assert.deepEqual(CATEGORIES.map((c) => c.label), ["Smileys", "People", "Animals", "Food", "Activities", "Travel", "Objects", "Symbols", "Flags"]);
  const beer = rows.find((r) => r[0] === "🍺") as CatalogRow;
  assert.equal(matches(beer, "bee"), true, "the start of a word");
  assert.equal(matches(beer, "eer"), false, "not the middle of one");
  assert.equal(matches(beer, "BEER"), true);
  assert.equal(matches(beer, ""), true);
  const wave = rows.find((r) => r[0] === "👋") as CatalogRow;
  assert.ok(Array.isArray(wave[4]) && wave[4].length === 5 && wave[4].every((g) => drawable(g)), "the five tones, as emojibase spells them, all drawable");
  assert.equal(beer[4], 0, "a beer has no tone");
});

test("the far-off check fires a hundred times the most likely answer, rounded to one figure, and never at the scale's edge", () => {
  assert.equal(farOffThreshold({ typical: 10n, range: 15n, rangeSource: "ai" }), 1000n, "1,000 for 10: a slipped finger, not a bold guess");
  assert.equal(farOffThreshold({ typical: 14n, range: 20n, rangeSource: "ai" }), 1000n, "rounded to one figure, so the threshold does not print the answer");
  assert.equal(farOffThreshold({ typical: 37n, range: 30n, rangeSource: "ai" }), 4000n);
  assert.equal(farOffThreshold({ typical: 0n, range: 3n, rangeSource: "ai" }), 100n, "a most likely answer of nothing reads as one");
  assert.equal(farOffThreshold({ typical: 1_240n, range: 500n, rangeSource: "asker" }), 100_000n);
  // Well beyond any scale the check allows (at most four times the typical answer): trying numbers finds no edge.
  for (const typical of [3n, 10n, 14n, 37n, 250n, 1499n]) assert.ok((farOffThreshold({ typical, range: typical * 4n, rangeSource: "ai" }) as bigint) > typical * 4n * 10n, `typical ${typical}`);
  // No most likely answer (the model was down): only an asker's scale, which is shown anyway, can be the reference.
  assert.equal(farOffThreshold({ typical: null, range: 20n, rangeSource: "asker" }), 1000n, "fifty times the asker's scale");
  assert.equal(farOffThreshold({ typical: null, range: 20n, rangeSource: "ai" }), null, "a hidden scale with nothing else is no reference: no check rather than a probeable one");
  assert.equal(farOffThreshold({ typical: null, range: null, rangeSource: null }), null);
  assert.deepEqual([1400n, 3700n, 250n, 100n, 7n, 999_999_999n].map(oneSignificant), [1000n, 4000n, 300n, 100n, 7n, 1_000_000_000n]);
});
