/**
 * The style-budget lint (docs/design.md 1.2, 4.8) can fail: run against a fixture tree, it refuses a screen with
 * five sizes, a screen with two serif sizes, a third weight at a size, and a token from the first design; and it
 * counts sizes rather than tokens, with controls and obligation tokens out. A rule that cannot fail is worse
 * than no rule, so this is the check on the check.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../fixtures/type-budget/", import.meta.url));
function lint(): { status: number | null; out: string } {
  const r = spawnSync("node", ["--import", "tsx", "scripts/lint-type-budget.ts"], { encoding: "utf8", env: { ...process.env, TYPE_BUDGET_ROOT: ROOT } });
  return { status: r.status, out: `${r.stdout}\n${r.stderr}` };
}

test("the type budget refuses a fifth size on a screen", () => {
  const r = lint();
  assert.equal(r.status, 1);
  assert.match(r.out, /src\/app\/page\.tsx: 5 sizes \(hanken 13, hanken 15, hanken 17, hanken 20, serif 26\): over the budget of 4/);
});

test("two tokens at one size count once: label and caption are one size, and weight is free inside it", () => {
  const r = lint();
  assert.match(r.out, /src\/app\/page\.tsx: 5 sizes/, "label (13/600) and caption (13/400) are one size, not two");
  assert.doesNotMatch(r.out, /src\/app\/page\.tsx: 6 sizes/);
  assert.doesNotMatch(r.out, /src\/app\/page\.tsx: hanken 13 at/, "400 and 600 at one size is the allowed pair");
});

test("the type budget refuses a second serif size on a screen", () => {
  assert.match(lint().out, /src\/app\/fine\/page\.tsx: 2 serif sizes \(serif 17, serif 40\); a screen has one/);
});

test("a third weight at a size is refused: a size carries 400 and 600 only", () => {
  assert.match(lint().out, /src\/app\/weights\/page\.tsx: hanken 17 at 400, 700 \(a size carries 400 and 600 only/);
});

test("the type budget refuses a token from the first design", () => {
  assert.match(lint().out, /src\/app\/legacy\/page\.tsx: legacy token "text-question"/);
});

test("a control's label is outside the count: a page with four sizes on content and a fifth on a field passes", () => {
  const r = lint();
  assert.match(r.out, /src\/app\/controls\/page\.tsx: 4 sizes \(hanken 13, hanken 15, hanken 17, serif 26\)\n/);
  assert.doesNotMatch(r.out, /controls\/page\.tsx: 5 sizes/);
});

test("text inside an obligation token is outside the count, its serif words included", () => {
  const r = lint();
  assert.match(r.out, /src\/app\/tokens\/page\.tsx: 4 sizes \(hanken 13, hanken 15, hanken 17, serif 26\)\n/);
  assert.doesNotMatch(r.out, /tokens\/page\.tsx: [56] sizes|tokens\/page\.tsx: 2 serif sizes/);
});
