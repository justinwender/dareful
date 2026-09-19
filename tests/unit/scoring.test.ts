/**
 * The scoring rule and settlement. Every expectation here was worked by hand from the formulas in PLANNING.md
 * 5a and 8c (with truncation, per docs/decisions.md 2026-09-17), before this file or the code it tests was
 * run, and the working is in the comments so it can be checked with a pencil.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { groupNumber, nets, pairwiseTransfer, scoreBinary, settle, truncDiv } from "@/lib/ledger/scoring";

// Section 8c, John falls asleep (outcome 1). Stakes in cents.
//   Justin 1500 at 2000 bps: (2000-10000)^2 = 64,000,000; /10000 = 6400; S = 3600
//   Gabe   2000 at 7000 bps: 9,000,000/10000 = 900;   S = 9100
//   Alex    500 at 5000 bps: 25,000,000/10000 = 2500; S = 7500
//   John   5000 at    0 bps: 100,000,000/10000 = 10000; S = 0
const CAST = [
  { id: "justin", stake: 1500n, value: 2000n },
  { id: "gabe", stake: 2000n, value: 7000n },
  { id: "alex", stake: 500n, value: 5000n },
  { id: "john", stake: 5000n, value: 0n },
];

test("section 8c scores: 3600, 9100, 7500, 0", () => {
  assert.deepEqual(CAST.map((p) => scoreBinary(p.value, 1n)), [3600n, 9100n, 7500n, 0n]);
  // and if he had stayed awake, John's 0% is a perfect call
  assert.deepEqual(CAST.map((p) => scoreBinary(p.value, 0n)), [9600n, 5100n, 7500n, 10000n]);
});

test("section 8c edges, each truncated toward zero on its own", () => {
  // Divisor is (N-1) x 10000 = 30000.
  //   Justin-Gabe: 1500 x (3600-9100) = -8,250,000 / 30000 = -275        Justin pays Gabe 275
  //   Justin-Alex:  500 x (3600-7500) = -1,950,000 / 30000 = -65         Justin pays Alex 65
  //   Justin-John: 1500 x 3600        =  5,400,000 / 30000 = 180         John pays Justin 180
  //   Gabe-Alex:    500 x 1600        =    800,000 / 30000 = 26.67 -> 26 Alex pays Gabe 26
  //   Gabe-John:   2000 x 9100        = 18,200,000 / 30000 = 606.67 -> 606
  //   Alex-John:    500 x 7500        =  3,750,000 / 30000 = 125
  const edges = settle(CAST.map((p) => ({ id: p.id, stake: p.stake, score: scoreBinary(p.value, 1n) })));
  assert.deepEqual(edges, [
    { debtor: "justin", creditor: "gabe", qty: 275n },
    { debtor: "justin", creditor: "alex", qty: 65n },
    { debtor: "john", creditor: "justin", qty: 180n },
    { debtor: "alex", creditor: "gabe", qty: 26n },
    { debtor: "john", creditor: "gabe", qty: 606n },
    { debtor: "john", creditor: "alex", qty: 125n },
  ]);
});

test("section 8c nets: -160, +907, +164, -911, summing to zero", () => {
  const ps = CAST.map((p) => ({ id: p.id, stake: p.stake, score: scoreBinary(p.value, 1n) }));
  const n = nets(ps, settle(ps));
  assert.deepEqual([n.get("justin"), n.get("gabe"), n.get("alex"), n.get("john")], [-160n, 907n, 164n, -911n]);
  assert.equal([...n.values()].reduce((a, b) => a + b, 0n), 0n);
});

test("two beers each, four people: every transfer truncates to zero, so one beer moves, lowest to highest", () => {
  // The largest possible transfer is 2 x 10000 / 30000 = 0.67, which truncates to 0. Under nearest rounding it
  // would be 1, and the lowest scorer would owe three beers on a stake of two.
  const ps = CAST.map((p) => ({ id: p.id, stake: 2n, score: scoreBinary(p.value, 1n) }));
  assert.equal(pairwiseTransfer(2n, 2n, 10000n, 0n, 4n), 0n);
  const edges = settle(ps);
  assert.deepEqual(edges, [{ debtor: "john", creditor: "gabe", qty: 1n }]);
  for (const [id, net] of nets(ps, edges)) assert.ok((net < 0n ? -net : net) <= 2n, `${id} lost more than their stake`);
});

test("a tie at the top or the bottom of a collapsed market mints nothing", () => {
  const s = (scores: bigint[]) => settle(scores.map((score, i) => ({ id: `p${i}`, stake: 2n, score })));
  assert.deepEqual(s([10000n, 0n, 0n, 0n]), []); // three tied at the bottom
  assert.deepEqual(s([9100n, 9100n, 3600n, 0n]), []); // two tied at the top
  assert.deepEqual(s([7500n, 7500n, 7500n, 7500n]), []); // everyone tied
  assert.deepEqual(s([9100n, 7500n, 7500n, 0n]), [{ debtor: "p3", creditor: "p0", qty: 1n }]); // a tie in the middle is fine
});

test("a next time (every stake 1) is the same rule: one edge, lowest to highest", () => {
  const ps = [
    { id: "a", stake: 1n, score: 6400n },
    { id: "b", stake: 1n, score: 9900n },
  ];
  assert.deepEqual(settle(ps), [{ debtor: "a", creditor: "b", qty: 1n }]);
});

test("nobody's net exceeds their stake, and the nets sum to zero, across a sweep of markets", () => {
  let seed = 12345;
  const rand = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
  for (let m = 0; m < 400; m += 1) {
    const size = 2 + rand(6);
    const ps = Array.from({ length: size }, (_, i) => ({ id: `p${i}`, stake: BigInt(1 + rand(m % 2 ? 5 : 5000)), score: scoreBinary(BigInt(rand(10001)), BigInt(rand(2))) }));
    const n = nets(ps, settle(ps));
    assert.equal([...n.values()].reduce((a, b) => a + b, 0n), 0n);
    for (const p of ps) {
      const net = n.get(p.id) ?? 0n;
      assert.ok((net < 0n ? -net : net) <= p.stake, `market ${m}: ${p.id} net ${net} on a stake of ${p.stake}`);
    }
  }
});

test("truncation is toward zero for either sign, and a transfer is antisymmetric", () => {
  assert.equal(truncDiv(20n, 30n), 0n);
  assert.equal(truncDiv(-20n, 30n), 0n);
  assert.equal(truncDiv(-50n, 30n), -1n);
  assert.equal(pairwiseTransfer(500n, 2000n, 7500n, 9100n, 4n), -26n);
  assert.equal(pairwiseTransfer(2000n, 500n, 9100n, 7500n, 4n), 26n);
});

test("a probability outside 0 to 10000, or an outcome that is not 0 or 1, is refused", () => {
  assert.throws(() => scoreBinary(10001n, 1n), RangeError);
  assert.throws(() => scoreBinary(-1n, 1n), RangeError);
  assert.throws(() => scoreBinary(5000n, 2n), RangeError);
});

test("the group's number is the stake-weighted mean, and nothing when nobody is in", () => {
  // (1500 x 2000 + 2000 x 7000 + 500 x 5000 + 5000 x 0) / 9000 = 19,500,000 / 9000 = 2166.67 -> 2166
  assert.equal(groupNumber(CAST), 2166n);
  assert.equal(groupNumber([]), null);
});
