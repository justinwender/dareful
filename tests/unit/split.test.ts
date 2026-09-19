/** One total, several people. Hand-computed expectations; the residual always lands on the payer. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { splitTotal, SplitError } from "@/lib/ledger/split";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const cents = (s: ReturnType<typeof splitTotal>) => s.shares.map((x) => x.cents);

test("a hundred dollars among five, the payer one of them, is twenty each", () => {
  const s = splitTotal({ totalCents: 10000n, present: ids(4), payerIn: true });
  assert.deepEqual(cents(s), [2000n, 2000n, 2000n, 2000n]);
  assert.equal(s.payerCents, 2000n);
});

test("a hundred dollars among three: thirty-three thirty-three each, and the odd cent is the payer's", () => {
  const s = splitTotal({ totalCents: 10000n, present: ids(2), payerIn: true });
  assert.deepEqual(cents(s), [3333n, 3333n]);
  assert.equal(s.payerCents, 3334n);
});

test("the shares and the payer's part always sum to the total exactly", () => {
  for (const total of [1n, 7n, 100n, 9999n, 10001n, 123457n]) {
    for (const n of [1, 2, 3, 6, 7]) {
      for (const payerIn of [true, false]) {
        const s = splitTotal({ totalCents: total, present: ids(n), payerIn });
        assert.equal(cents(s).reduce((a, b) => a + b, 0n) + s.payerCents, total, `${total} among ${n}, payerIn=${payerIn}`);
        assert.ok(cents(s).every((c) => c === cents(s)[0]), "even shares are equal");
      }
    }
  }
});

test("when the payer bought for the others, the total is split among the others only", () => {
  const s = splitTotal({ totalCents: 9000n, present: ids(3), payerIn: false });
  assert.deepEqual(cents(s), [3000n, 3000n, 3000n]);
  assert.equal(s.payerCents, 0n);
  const odd = splitTotal({ totalCents: 100n, present: ids(3), payerIn: false });
  assert.deepEqual(cents(odd), [33n, 33n, 33n]);
  assert.equal(odd.payerCents, 1n); // the payer absorbs the cent rather than anyone being asked for it
});

test("one person pinned to an amount, the rest split what is left", () => {
  // $100, five people in, one only had a $10 salad: the other four split $90.
  const s = splitTotal({ totalCents: 10000n, present: ids(4), payerIn: true, fixed: new Map([["p2", 1000n]]) });
  assert.deepEqual(cents(s), [2250n, 1000n, 2250n, 2250n]);
  assert.equal(s.payerCents, 2250n);
});

test("everyone pinned: what is left is the payer's", () => {
  const s = splitTotal({ totalCents: 5000n, present: ids(2), payerIn: true, fixed: new Map([["p1", 1000n], ["p2", 1500n]]) });
  assert.deepEqual(cents(s), [1000n, 1500n]);
  assert.equal(s.payerCents, 2500n);
});

test("amounts that cannot add up are refused out loud", () => {
  assert.throws(() => splitTotal({ totalCents: 0n, present: ids(2), payerIn: true }), SplitError);
  assert.throws(() => splitTotal({ totalCents: 1000n, present: [], payerIn: true }), /Who was there/);
  assert.throws(() => splitTotal({ totalCents: 1000n, present: ids(2), payerIn: true, fixed: new Map([["p1", 2000n]]) }), /more than the total/);
  assert.throws(() => splitTotal({ totalCents: 1000n, present: ids(2), payerIn: true, fixed: new Map([["zz", 100n]]) }), /wasn't there/);
  assert.throws(() => splitTotal({ totalCents: 1000n, present: ids(2), payerIn: false, fixed: new Map([["p1", 100n], ["p2", 100n]]) }), /don't add up/);
  assert.throws(() => splitTotal({ totalCents: 1000n, present: ids(2), payerIn: true, fixed: new Map([["p1", -1n]]) }), SplitError);
});

test("the same person listed twice is one person", () => {
  const s = splitTotal({ totalCents: 9000n, present: ["a", "a", "b"], payerIn: true });
  assert.deepEqual(s.shares.map((x) => x.personId), ["a", "b"]);
  assert.deepEqual(cents(s), [3000n, 3000n]);
});
