/**
 * Pick one, by hand first (docs/design.md 3.25, 3.30, 3.31; PLANNING.md 8c). The worked example below was computed
 * with a pencil before any of this code ran, and its working is in the comments: five people, five answers, a
 * spread of picks and unequal stakes, one answer that happens. It is met four ways, as the yes-or-no and the
 * number examples were: here by the mirror, in tests/db/scoring-chain.test.ts by the deployed contract's own
 * function, in tests/db/pick-one.test.ts on a real market with a dissent, and by verify-envio over every pick-one
 * market.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { nets, scoreCategorical, settle } from "@/lib/ledger/scoring";
import { answerLine, answerShares, calledItLine, pickOneCaption, saidAnswer, MAX_ANSWERS, PICK_ONE_CONFIDENCE } from "@/lib/ledger/pick-one";
import { pickOneCalls } from "@/lib/ledger/calibration";
import { callToOutcome, outcomeAllowed, valueAllowed, VOID_OUTCOME } from "@/lib/ledger/markets";
import { cleanResolutionOf } from "@/lib/ledger/settle";

// "Who falls asleep first?" Answers, in the asker's order: John (0), Priya (1), Gabe (2), Theo (3), Nobody (4).
// John does. Every pick carries 10000, so the right answer scores 10000 and a wrong one 0. Stakes in cents.
//   Priya  John    at $5      right   S = 10000
//   Gabe   Gabe    at $10     wrong   S = 0
//   Theo   John    at $20     right   S = 10000
//   Maya   Nobody  at $7.50   wrong   S = 0
//   John   Priya   at $9      wrong   S = 0
const ANSWERS = ["John", "Priya", "Gabe", "Theo", "Nobody"];
const PICKS = [
  { id: "priya", stake: 500n, pick: 0n },
  { id: "gabe", stake: 1000n, pick: 2n },
  { id: "theo", stake: 2000n, pick: 0n },
  { id: "maya", stake: 750n, pick: 4n },
  { id: "john", stake: 900n, pick: 1n },
];
const CONF = BigInt(PICK_ONE_CONFIDENCE);
const scored = PICKS.map((p) => ({ id: p.id, stake: p.stake, score: scoreCategorical(p.pick, CONF, 5n, 0n) }));

test("a pick carries everything: the answer that happened scores 10000, any other 0, on two to six answers", () => {
  assert.deepEqual(
    scored.map((p) => p.score),
    [10000n, 0n, 10000n, 0n, 0n],
  );
  for (const options of [2n, 3n, 6n]) {
    for (let pick = 0n; pick < options; pick += 1n) for (let outcome = 0n; outcome < options; outcome += 1n) assert.equal(scoreCategorical(pick, CONF, options, outcome), pick === outcome ? 10000n : 0n, `pick ${pick} of ${options}, outcome ${outcome}`);
  }
  // The formula, from the specification, for a confidence short of everything (the contract's own table, contracts/test/DarefulDares.t.sol).
  assert.equal(scoreCategorical(0n, 7000n, 3n, 0n), 9325n, "70% on the right one of three: others get 1500 each");
  assert.equal(scoreCategorical(0n, 7000n, 3n, 1n), 3825n);
  assert.equal(scoreCategorical(2n, 5000n, 4n, 2n), 8334n, "four answers at 50%: the others get 5000 / 3 = 1666, the remainder dropped");
  assert.equal(scoreCategorical(0n, 5000n, 2n, 1n), 7500n, "a coin flip over two answers is the same as a 50% yes-or-no");
  assert.throws(() => scoreCategorical(0n, CONF, 1n, 0n), RangeError, "one answer is no question");
  assert.throws(() => scoreCategorical(5n, CONF, 5n, 0n), RangeError, "a pick past the last answer");
  assert.throws(() => scoreCategorical(0n, CONF, 5n, 5n), RangeError, "an outcome past the last answer");
  assert.throws(() => scoreCategorical(0n, 10_001n, 5n, 0n), RangeError, "more than everything");
});

test("who falls asleep first: six edges, the wrong picks paying the right ones, each truncated on its own", () => {
  // Divisor (N - 1) x 10000 = 40000. Two right (Priya, Theo), three wrong (Gabe, Maya, John): only a right-wrong pair moves anything.
  //   Priya-Gabe   min(500, 1000) x 10000  = 5,000,000 / 40000 = 125        Gabe pays Priya 125
  //   Priya-Theo   both right                                               nothing
  //   Priya-Maya   min(500, 750) x 10000   = 5,000,000 / 40000 = 125        Maya pays Priya 125
  //   Priya-John   min(500, 900) x 10000   = 5,000,000 / 40000 = 125        John pays Priya 125
  //   Gabe-Theo    min(1000, 2000) x -10000 = -10,000,000 / 40000 = -250    Gabe pays Theo 250
  //   Gabe-Maya    both wrong                                               nothing
  //   Gabe-John    both wrong                                               nothing
  //   Theo-Maya    min(2000, 750) x 10000  = 7,500,000 / 40000 = 187.5 -> 187   Maya pays Theo 187
  //   Theo-John    min(2000, 900) x 10000  = 9,000,000 / 40000 = 225        John pays Theo 225
  //   Maya-John    both wrong                                               nothing
  assert.deepEqual(settle(scored), [
    { debtor: "gabe", creditor: "priya", qty: 125n },
    { debtor: "maya", creditor: "priya", qty: 125n },
    { debtor: "john", creditor: "priya", qty: 125n },
    { debtor: "gabe", creditor: "theo", qty: 250n },
    { debtor: "maya", creditor: "theo", qty: 187n },
    { debtor: "john", creditor: "theo", qty: 225n },
  ]);
});

test("who falls asleep first: nets +375, -375, +662, -312, -350, summing to zero and inside every stake", () => {
  const n = nets(scored, settle(scored));
  assert.deepEqual([n.get("priya"), n.get("gabe"), n.get("theo"), n.get("maya"), n.get("john")], [375n, -375n, 662n, -312n, -350n]);
  assert.equal([...n.values()].reduce((a, b) => a + b, 0n), 0n);
  for (const p of PICKS) {
    const net = n.get(p.id) as bigint;
    assert.ok((net < 0n ? -net : net) <= p.stake, `${p.id} moved more than their stake`);
  }
});

test("ties are not failures: everyone right, or everyone wrong, resolves with nothing changing hands and no toll", () => {
  const all = (pick: bigint) => PICKS.map((p) => ({ id: p.id, stake: p.stake, score: scoreCategorical(pick, CONF, 5n, 0n) }));
  assert.deepEqual(settle(all(0n)), [], "everyone picked John: every score 10000, nothing to settle");
  assert.deepEqual(settle(all(2n)), [], "everyone picked Gabe: every score 0, nobody was more right than anyone else");
  // A question that ended with an answer is a clean resolution whatever moved (PLANNING.md 8e): the toll is for a void.
  assert.deepEqual(cleanResolutionOf([{ outcome: 0n }, { outcome: 2n }, { outcome: VOID_OUTCOME }]), { ended: 3, clean: 2 });
  // Two beers each on a pick-one question: every transfer truncates to zero and the collapse rule applies, so a tie at either end mints nothing.
  const beers = PICKS.map((p, i) => ({ id: p.id, stake: 2n, score: i === 0 ? 10000n : 0n }));
  assert.deepEqual(settle(beers), [], "one right and four wrong at two beers: the wrong are tied at the bottom, nothing mints");
});

test("a pick-one entry names one of the answers and nothing else; a vote names one of them or nobody can tell", () => {
  assert.equal(valueAllowed("categorical", 0n, 5), true);
  assert.equal(valueAllowed("categorical", 4n, 5), true);
  assert.equal(valueAllowed("categorical", 5n, 5), false, "past the last answer");
  assert.equal(valueAllowed("categorical", 0n), false, "with no answers there is nothing to pick");
  assert.equal(outcomeAllowed("categorical", 3n, 5), true);
  assert.equal(outcomeAllowed("categorical", 5n, 5), false);
  assert.equal(outcomeAllowed("categorical", VOID_OUTCOME, 5), true, "I couldn't tell is the contract's void");
  assert.equal(callToOutcome("a:3"), 3n, "the browser names an answer by its index");
  assert.equal(callToOutcome("a:x"), null);
  assert.equal(callToOutcome("void"), VOID_OUTCOME);
});

test("an answer's share is its stake over all stake, by largest remainder, so the shares print to 100", () => {
  // The example: John 2500 (Priya 500 + Theo 2000), Priya 900, Gabe 1000, Theo 0, Nobody 750; total 5150.
  //   48.54, 17.48, 19.42, 0, 14.56 -> floors 48, 17, 19, 0, 14 = 98; the two largest remainders (.56, .54) take the two left.
  assert.deepEqual(answerShares([2500n, 900n, 1000n, 0n, 750n]), [49, 17, 19, 0, 15]);
  assert.deepEqual(answerShares([1n, 1n, 1n]), [34, 33, 33], "a third each: the first remainder in the asker's order takes the extra");
  assert.deepEqual(answerShares([0n, 0n]), [0, 0], "nothing riding anywhere");
  assert.deepEqual(answerShares([500n, 0n]), [100, 0], "an answer nobody picked shows 0");
});

test("the settled screen says who called it, in the design's four shapes, with the viewer as you", () => {
  assert.equal(calledItLine([], false), "Nobody called it.");
  assert.equal(calledItLine(["Theo"], false), "Theo called it. Nobody else did.");
  assert.equal(calledItLine(["You"], true), "You called it. Nobody else did.");
  assert.equal(calledItLine(["Theo", "Maya"], false), "Theo and Maya called it.");
  assert.equal(calledItLine(["Theo", "You"], true), "You and Theo called it.");
  assert.equal(calledItLine(["Theo", "Maya", "Gabe", "John"], false), "Four of you called it: Theo, Maya, Gabe and John.");
  assert.equal(calledItLine(["Theo", "You", "Gabe"], true), "Three of you called it: Theo, Gabe and you.");
  assert.equal(answerLine("Priya", "40 minutes in."), "Priya, 40 minutes in.");
  assert.equal(answerLine("Priya", null), "Priya.");
  assert.equal(answerLine("Priya", "x".repeat(61)), "Priya.", "a long line stays the caption");
  assert.equal(saidAnswer({ text: "A field goal", userId: null }), "a field goal", "words lose their capital after a name");
  assert.equal(saidAnswer({ text: "Nobody", userId: null }), "nobody");
  assert.equal(saidAnswer({ text: "John", userId: "u1" }), "John", "a person keeps it");
  assert.equal(saidAnswer({ text: "John", userId: null }), "John", "an answer typed as a name keeps its capital too (found in the real session: \"Say it: john\")");
});

test("the caption under the bars speaks only when one stake is more than half of everything riding", () => {
  const nameOf = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);
  const stakeWords = (s: bigint) => `$${s / 100n}`;
  assert.equal(pickOneCaption({ entries: PICKS.map((p) => ({ id: p.id, stake: p.stake, pick: Number(p.pick) })), answers: ANSWERS, viewerId: "priya", nameOf, stakeWords }), null, "nobody holds half: the bars say it all");
  assert.equal(pickOneCaption({ entries: [{ id: "theo", stake: 3000n, pick: 0 }, { id: "priya", stake: 500n, pick: 1 }, { id: "gabe", stake: 1000n, pick: 2 }], answers: ANSWERS, viewerId: "priya", nameOf, stakeWords }), "Theo has $30 on John, more than half of what’s riding.");
  assert.equal(pickOneCaption({ entries: [{ id: "priya", stake: 3000n, pick: 4 }, { id: "gabe", stake: 1000n, pick: 2 }], answers: ANSWERS, viewerId: "priya", nameOf, stakeWords }), "You have $30 on Nobody, more than half of what’s riding.");
  assert.equal(pickOneCaption({ entries: [{ id: "priya", stake: 3000n, pick: 4 }], answers: ANSWERS, viewerId: "priya", nameOf, stakeWords }), null, "one entry is not half of anything");
});

test("pick-one questions are counted on You and never plotted: how many ended, how many this person called", () => {
  assert.deepEqual(pickOneCalls([10000, 0, 10000, 10000, 0]), { resolved: 5, called: 3 });
  assert.deepEqual(pickOneCalls([10000, 9325, 0]), { resolved: 3, called: 1 }, "only a full score is the pick that happened; a score short of everything is not a call");
  assert.deepEqual(pickOneCalls([]), { resolved: 0, called: 0 });
  assert.equal(MAX_ANSWERS, 6, "six is what the entry sheet holds with the question in view (3.29)");
});
