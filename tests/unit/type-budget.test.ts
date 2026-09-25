/**
 * The type-budget lint (docs/design.md 1.2, 4.8) can fail: run against a fixture tree, it refuses a screen with
 * five tokens, a screen with two serif sizes, and a token from the first design. A rule that cannot fail is worse
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

test("the type budget refuses a fifth token on a screen", () => {
  const r = lint();
  assert.equal(r.status, 1);
  assert.match(r.out, /src\/app\/page\.tsx: 5 tokens \(body, body-sm, caption, label, serif-l\): over the budget of 4/);
});

test("the type budget refuses a second serif size on a screen", () => {
  assert.match(lint().out, /src\/app\/fine\/page\.tsx: 2 serif sizes \(serif-xl, serif-m\); a screen has one/);
});

test("the type budget refuses a token from the first design", () => {
  assert.match(lint().out, /src\/app\/legacy\/page\.tsx: legacy token "text-question"/);
});

test("a control's label is outside the count: a page with four tokens on content and two more on a field and its label passes", () => {
  const r = lint();
  assert.match(r.out, /src\/app\/controls\/page\.tsx: 4 tokens \(body, body-sm, label, serif-l\)\n/);
  assert.doesNotMatch(r.out, /controls\/page\.tsx: [56] tokens/);
});
