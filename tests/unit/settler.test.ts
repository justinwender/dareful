/**
 * The settler's rules, read from responses recorded from the API (scripts/dev/record-settler.ts). The triage
 * matters more than the ruling, so most of this is about what gets refused.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { keccak256, stringToHex } from "viem";
import { answerFrom } from "@/lib/ai/client";
import { Arbitration, CarefulQuestions, declined, DECLINE_FALLBACK, plainDashes, Ruling, Triage } from "@/lib/ai/settler";
import { shareTermsLine } from "@/lib/ledger/share";
import { arbitrationOpen, rulingHash, SIDE_BPS } from "@/lib/ledger/settle";
import { scoreBinary, pairwiseTransfer } from "@/lib/ledger/scoring";
import { deadlineNotice, rulingNotice } from "@/lib/notify/messages";

type Recorded = { content: Array<{ type: string; name?: string; input?: Record<string, unknown> }> };
const load = (name: string): Recorded => JSON.parse(readFileSync(new URL(`../fixtures/anthropic/${name}.json`, import.meta.url), "utf8")) as Recorded;
const withInput = (r: Recorded, patch: Record<string, unknown>): Recorded => ({ content: r.content.map((b) => (b.type === "tool_use" ? { ...b, input: { ...b.input, ...patch } } : b)) });
const triageOf = (r: Recorded) => answerFrom(r, "triage", Triage, "t");

test("a recorded checkable claim is let through with the claim restated, and no criteria asked for", () => {
  const t = triageOf(load("triage-checkable"));
  assert.equal(t.tier, "checkable");
  assert.equal(declined(t), null);
  assert.deepEqual(t.criteria, []);
});

test("a recorded contestable claim comes with up to three measurable criteria, and is not ruled on until one is picked", () => {
  const t = triageOf(load("triage-contestable"));
  assert.equal(t.tier, "contestable");
  assert.ok(t.criteria.length >= 1 && t.criteria.length <= 3);
  assert.equal(declined(t), null);
});

test("a recorded interpersonal dispute is declined, with a reason that judges neither person", () => {
  const no = declined(triageOf(load("triage-interpersonal")));
  assert.ok(no !== null && no.reason.length > 10);
  assert.equal(/\b(you were|he was|she was|they were) (right|wrong)\b/i.test(no?.reason ?? ""), false);
});

test("the refusal is not a soft guideline: no claim about the world, or no criterion, is a refusal whatever the model called it", () => {
  const base = load("triage-contestable");
  assert.ok(declined(triageOf(withInput(base, { tier: "taste" }))) !== null);
  // A dispute about a person can be phrased as a claim. The tier still refuses it, claim or no claim.
  assert.ok(declined(triageOf(withInput(load("triage-interpersonal"), { claim: "He should have come to the birthday dinner." }))) !== null);
  assert.ok(declined(triageOf(withInput(base, { criteria: [] }))) !== null, "contestable with nothing to measure is taste");
  assert.ok(declined(triageOf(withInput(load("triage-checkable"), { claim: "" }))) !== null, "checkable with no claim is nothing to check");
  assert.equal(declined(triageOf(withInput(load("triage-interpersonal"), { declineReason: "" })))?.reason, DECLINE_FALLBACK);
});

test("a dare offered in place of a declined dispute reads as a line, not as a label", () => {
  assert.equal(declined(triageOf(withInput(load("triage-interpersonal"), { dareInstead: "Dare: he picks the place and shows up on time" })))?.dareInstead, "He picks the place and shows up on time");
});

test("a recorded ruling reads as an answer, how sure, and what it rests on", () => {
  const r = answerFrom(load("rule-claim"), "rule", Ruling, "t");
  assert.equal(r.outcome, "no");
  assert.ok(r.confidencePercent >= 90, "a checkable claim is ruled firmly");
  assert.ok(r.rationale.length > 20);
});

test("a ruling that says 100, or 45, is still a ruling: the lean is clamped, never a reason to lose it", () => {
  assert.equal(answerFrom(withInput(load("rule-claim"), { confidencePercent: 100 }), "rule", Ruling, "t").confidencePercent, 99);
  assert.equal(answerFrom(withInput(load("rule-claim"), { confidencePercent: 45 }), "rule", Ruling, "t").confidencePercent, 50);
});

test("careful mode is exactly three questions", () => {
  assert.equal(answerFrom(load("careful-questions"), "ask_three", CarefulQuestions, "t").questions.length, 3);
  assert.throws(() => answerFrom(withInput(load("careful-questions"), { questions: ["Only one?"] }), "ask_three", CarefulQuestions, "t"));
});

test("a recorded arbitration is an outcome and a written ruling, and the hash is of exactly the words stored", () => {
  const a = answerFrom(load("arbitrate"), "arbitrate", Arbitration, "t");
  assert.equal(a.outcome, "yes");
  assert.equal(rulingHash(a.ruling), keccak256(stringToHex(a.ruling)));
  assert.notEqual(rulingHash(a.ruling), rulingHash(`${a.ruling} `), "one changed character is a different ruling");
});

test("nothing a model wrote keeps an em dash, and a score keeps its en dash", () => {
  assert.equal(plainDashes("The serve — not the fastball — wins"), "The serve, not the fastball, wins");
  assert.equal(plainDashes("Dallas won 4–2"), "Dallas won 4–2");
  const a = answerFrom(withInput(load("arbitrate"), { ruling: "The terms say walking counts — so it is a yes, and that settles it." }), "arbitrate", Arbitration, "t");
  assert.equal(a.ruling.includes("—"), false);
});

const locked = { lockedAt: new Date("2026-09-20T10:00:00Z"), resolvedAt: null, resolvedBy: null, resolvedOutcome: null, creatorSignature: Buffer.from([1]), onchainId: Buffer.from([1]), stalemate: "arbitrate", pace: "dare", resolvesBy: new Date("2026-09-21T10:00:00Z") };
test("the arbitrator can be asked once it is due and not before; an argument is due at once; the void rule never", () => {
  assert.equal(arbitrationOpen(locked as never, new Date("2026-09-21T09:59:00Z")), false);
  assert.equal(arbitrationOpen(locked as never, new Date("2026-09-21T10:01:00Z")), true);
  assert.equal(arbitrationOpen({ ...locked, pace: "argument", resolvesBy: null } as never, new Date("2026-09-20T10:00:01Z")), true);
  assert.equal(arbitrationOpen({ ...locked, stalemate: "void" } as never, new Date("2026-09-25T00:00:00Z")), false);
  assert.equal(arbitrationOpen({ ...locked, lockedAt: null, onchainId: null } as never, new Date("2026-09-25T00:00:00Z")), false);
});

test("an argument's default sides are all the way, so whoever is wrong is out the whole thing", () => {
  const stake = 1000n;
  const winner = scoreBinary(SIDE_BPS.yes, 1n);
  const loser = scoreBinary(SIDE_BPS.no, 1n);
  assert.deepEqual([winner, loser], [10000n, 0n]);
  assert.equal(pairwiseTransfer(stake, stake, loser, winner, 2n), -stake);
});

test("the criterion and the tiebreaker are on the card before anyone is in", () => {
  assert.equal(shareTermsLine({ criterion: "by elite success rate", stalemate: "arbitrate", argument: true }), "Decided by elite success rate. Take the other side. If nobody can agree, the app hears both sides and calls it.");
  assert.equal(shareTermsLine({ criterion: null, stalemate: "void", argument: false }), "Put your number on it. If nobody can agree, it goes unsettled.");
});

test("the deadline notice and the ruling notice say who acted and carry nothing it could cost", () => {
  const d = deadlineNotice({ title: "Does Riley finish?", marketId: "m1", appUrl: "https://dareful.app" });
  const r = rulingNotice({ askerName: "Sam", title: "Does Riley finish?", outcome: "yes", marketId: "m1", appUrl: "https://dareful.app" });
  assert.equal(d.url, "https://dareful.app/m/m1#ballot");
  assert.match(r.body, /^Yes\. Sam asked the app to hear it, the way everyone agreed going in\./);
  for (const n of [d, r]) assert.equal(/\$|%|owe|debt|overdue|late|\d+ (day|hour)/i.test(`${n.title} ${n.body}`), false);
});
