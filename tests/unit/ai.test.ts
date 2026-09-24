/**
 * The model's answers, read from responses recorded from the API (scripts/dev/record-ai.ts), never from a shape
 * written by hand. A model is never on the critical path, so the refusals matter as much as the reads: a
 * response with no tool call, the wrong tool, or an out-of-range number throws, and the caller falls back.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { answerFrom } from "@/lib/ai/client";
import { Proposal, Scope, plainScope } from "@/lib/ai/markets";

type Recorded = { content: Array<{ type: string; name?: string; input?: Record<string, unknown> }> };
const load = (name: string): Recorded => JSON.parse(readFileSync(new URL(`../fixtures/anthropic/${name}.json`, import.meta.url), "utf8")) as Recorded;
const withInput = (r: Recorded, patch: Record<string, unknown>): Recorded => ({ content: r.content.map((b) => (b.type === "tool_use" ? { ...b, input: { ...b.input, ...patch } } : b)) });

test("a recorded scoping response reads as terms and a starting number", () => {
  const scope = answerFrom(load("scope-market"), "write_terms", Scope, "t");
  assert.match(scope.title, /\?$/);
  assert.ok(scope.anchorPercent >= 1 && scope.anchorPercent <= 99);
  assert.deepEqual(scope.criteria, []);
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

// The two below vary one field of a recorded response. The string form of a list was seen from the API in 2A.
test("a starting number outside 1 to 99 is refused", () => {
  assert.throws(() => answerFrom(withInput(load("scope-market"), { anchorPercent: 100 }), "write_terms", Scope, "t"));
});

test("criteria sent as one string are read as a list", () => {
  const scope = answerFrom(withInput(load("scope-market"), { criteria: '["by chip time", "by gun time"]' }), "write_terms", Scope, "t");
  assert.deepEqual(scope.criteria, ["by chip time", "by gun time"]);
});

test("a long reason for the starting number is clipped, and never costs the terms that came with it", () => {
  const long = "x".repeat(300);
  const scope = answerFrom(withInput(load("scope-market"), { anchorRationale: long }), "write_terms", Scope, "t");
  assert.ok(scope.anchorRationale.length <= 140 && scope.anchorRationale.endsWith("…"));
  assert.ok(scope.terms.length > 10);
});

test("with no model, a line that ends in a full stop still reads as a question", () => {
  assert.equal(plainScope("The Holland Tunnel is longer than the Lincoln.").title, "The Holland Tunnel is longer than the Lincoln?");
});

test("with no model, the question is the line as typed and claims no number", () => {
  const plain = plainScope("  does riley   finish ");
  assert.equal(plain.title, "does riley finish?");
  assert.equal("anchorPercent" in plain, false);
});
