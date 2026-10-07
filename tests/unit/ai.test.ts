/**
 * The model's answers, read from responses recorded from the API (scripts/dev/record-ai.ts), never from a shape
 * written by hand. A model is never on the critical path, so the refusals matter as much as the reads: a
 * response with no tool call, the wrong tool, or an out-of-range number throws, and the caller falls back.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { answerFrom } from "@/lib/ai/client";
import { AnswerProposal, PickOneScope, Proposal, Scope, plainPickOneScope, plainScope } from "@/lib/ai/markets";
import { datesOf } from "@/lib/ledger/write-up";
import { AnswerArbitration } from "@/lib/ai/settler";

type Recorded = { content: Array<{ type: string; name?: string; input?: Record<string, unknown> }> };
const load = (name: string): Recorded => JSON.parse(readFileSync(new URL(`../fixtures/anthropic/${name}.json`, import.meta.url), "utf8")) as Recorded;
const withInput = (r: Recorded, patch: Record<string, unknown>): Recorded => ({ content: r.content.map((b) => (b.type === "tool_use" ? { ...b, input: { ...b.input, ...patch } } : b)) });

test("a recorded scoping response reads as a question and its terms", () => {
  const scope = answerFrom(load("scope-market"), "write_terms", Scope, "t");
  assert.match(scope.title, /\?$/);
  assert.ok(scope.terms.length > 10);
  assert.deepEqual(scope.criteria, []);
  // The anchor is gone (docs/decisions.md 2026-09-24): nothing generates a number for anyone to cluster around.
  assert.equal("anchorPercent" in scope, false);
});

test("a recorded outcome proposal reads as an outcome and a reason", () => {
  const p = answerFrom(load("propose-outcome"), "propose_outcome", Proposal, "t");
  assert.equal(p.outcome, "yes");
  assert.ok(p.rationale.length > 3);
});

test("a recorded response that is only prose is refused, not read as an answer", () => {
  assert.throws(() => answerFrom(load("prose-only"), "write_terms", Scope, "t"), /did not answer/);
});

test("an answer given through some other tool is refused", () => {
  assert.throws(() => answerFrom(load("propose-outcome"), "write_terms", Scope, "t"), /did not answer/);
});

// The one below varies one field of a recorded response. The string form of a list was seen from the API in 2A.
test("criteria sent as one string are read as a list", () => {
  const scope = answerFrom(withInput(load("scope-market"), { criteria: '["by chip time", "by gun time"]' }), "write_terms", Scope, "t");
  assert.deepEqual(scope.criteria, ["by chip time", "by gun time"]);
});

test("with no model, a line that ends in a full stop still reads as a question", () => {
  assert.equal(plainScope("The Holland Tunnel is longer than the Lincoln.").title, "The Holland Tunnel is longer than the Lincoln?");
});

test("with no model, the question is the line as typed, tidied", () => {
  const plain = plainScope("  does riley   finish ");
  assert.equal(plain.title, "does riley finish?");
});

// The pick-one calls (docs/design.md 3.29, 3.30), recorded with the same recorder: the write-up leaves the answers as the asker wrote
// them, the proposal names one by its number, and the arbitration does too or says the terms do not decide it.
test("a recorded pick-one write-up reads as a question and terms that say an unlisted answer cannot settle it, and leaves the answers alone", () => {
  const scope = answerFrom(load("scope-pick-one"), "write_pick_one_terms", PickOneScope, "t");
  assert.match(scope.title, /\?$/);
  assert.ok(scope.terms.length > 10);
  assert.equal("answers" in scope, false, "the answers are the asker's and the write-up does not return its own");
  assert.equal("outcomes" in scope, false, "no wells: a pick-one question has answers, not yes and no");
  const plain = plainPickOneScope("who falls asleep first");
  assert.equal(plain.title, "who falls asleep first?");
  assert.match(plain.terms, /none of them, it can’t be settled/);
});

test("a recorded answer proposal names one of the answers by its number, and a recorded answer arbitration does too", () => {
  const p = answerFrom(load("propose-answer"), "propose_answer", AnswerProposal, "t");
  assert.equal(p.outcome, "answer");
  assert.ok(p.answer !== null && p.answer >= 0 && p.answer < 5, "the answer's number in the asker's list");
  assert.ok(p.rationale.length > 3);
  const a = answerFrom(load("arbitrate-answer"), "arbitrate_answer", AnswerArbitration, "t");
  assert.ok(a.outcome === "cannot_decide" ? a.answer === null || true : a.answer !== null && a.answer >= 0 && a.answer < 5, "an answer, or that the terms do not decide it");
  assert.ok(a.ruling.length >= 20);
  assert.throws(() => answerFrom(load("propose-answer"), "propose_outcome", Proposal, "t"), /did not answer/, "an answer proposal is not a yes-or-no one");
});

// Recorded on 2026-10-06 with the furthest date in the prompt (scripts/dev/record-ai.ts far): two questions that cannot be
// known for decades. The write-up keeps their real dates and offers one nearer version each (the second-pass round).
test("a question that cannot be known for decades keeps its real date and offers one nearer version that fits, read from the recorded write-ups; a nearer one that does not fit is no offer", () => {
  const recordedOn = new Date("2026-10-06T16:00:00Z");
  const NY = "America/New_York";
  const country = datesOf(answerFrom(load("scope-pick-one-far"), "write_pick_one_terms", PickOneScope, "t"), recordedOn, NY);
  assert.equal(country.decideBy, null, "no date to start on, never one moved to fit");
  assert.deepEqual([country.tooFar?.knownBy, country.tooFar?.latest], ["2056-10-06", "2029-10-06"]);
  assert.equal(country.tooFar?.nearer?.decideBy, "2029-10-06", "the nearer version is decided by the furthest date");
  assert.match(country.tooFar?.nearer?.title ?? "", /3 years|three years/, "measured over the coming years");
  const mars = datesOf(answerFrom(load("scope-market-far"), "write_terms", Scope, "t"), recordedOn, NY);
  assert.deepEqual([mars.decideBy, mars.tooFar?.knownBy, mars.tooFar?.nearer?.decideBy], [null, "2060-12-31", "2029-10-06"]);
  // A write-up with no date at all (the earlier recording) has nothing to start on and nothing too far.
  assert.deepEqual(datesOf(answerFrom(load("scope-market"), "write_terms", Scope, "t"), recordedOn, NY), { decideBy: null, tooFar: null });
  // One field varied: a nearer version whose own date is past the furthest date is not offered.
  const late = answerFrom(withInput(load("scope-pick-one-far"), { nearer: { title: "Which country grows the most by 2033?", terms: "Growth from now to the start of 2033, on World Bank figures.", decideBy: "2033-01-01" } }), "write_pick_one_terms", PickOneScope, "t");
  assert.equal(datesOf(late, recordedOn, NY).tooFar?.nearer, null);
});

