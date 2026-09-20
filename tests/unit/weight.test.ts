/**
 * The weight line's arithmetic. The worked example is the specification's own (docs/design.md 3.22, and the
 * "Weight, and the group's number" board): six people, a plain average of 6 in 10, a group's number of 4 in 10.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { weightCaption, bucketOf, buckets, groupsNumberBps, overHalf, showsMarker, sparkEligible, tenthOf, type Entry } from "@/lib/ledger/weight";

const e = (id: string, tenth: number, dollars: number): Entry => ({ id, stake: BigInt(dollars * 100), valueBps: BigInt(tenth * 1000) });
const fence = [e("you", 7, 10), e("priya", 7, 5), e("gabe", 7, 5), e("maya", 5, 10), e("theo", 9, 15), e("john", 2, 50)];

test("the fence question: six numbers average 6 in 10 and the group's number is 4 in 10, because weight is stake", () => {
  const plain = fence.reduce((a, x) => a + Number(x.valueBps), 0) / fence.length;
  assert.equal(Math.round(plain / 1000), 6);
  // By hand: (7*10 + 7*5 + 7*5 + 5*10 + 9*15 + 2*50) / (10+5+5+10+15+50) = 425 / 95 = 4.4737.
  assert.equal(groupsNumberBps(fence), 4473n);
  assert.equal(tenthOf(4473n), 4);
});

test("a bucket is the tenth a number falls in: 1 to 10 is the first, 61 to 70 the seventh, and zero has no tenth so it sits in the first", () => {
  assert.deepEqual([0n, 100n, 1000n, 1001n, 6100n, 7000n, 7001n, 10_000n].map(bucketOf), [1, 1, 1, 2, 7, 7, 8, 10]);
});

test("a column's height is what is riding there over what is riding in the tallest, never how many picked it", () => {
  const b = buckets(fence);
  assert.deepEqual(b.map((x) => x.heightPermille), [0, 1000, 0, 0, 200, 0, 400, 0, 300, 0]);
  assert.deepEqual([b[1]?.people, b[6]?.people], [1, 3], "three people at 7 stand shorter than one at 2");
});

test("someone with nothing on it is a person and no weight: a dot in their tenth, no height, no pull on the group's number", () => {
  const withWatcher = [...fence, { id: "sam", stake: 0n, valueBps: 10_000n }];
  assert.equal(groupsNumberBps(withWatcher), groupsNumberBps(fence));
  const last = buckets(withWatcher)[9];
  assert.deepEqual([last?.noStake, last?.heightPermille, last?.people], [1, 0, 1]);
});

test("when nobody has anything on it the picture is dots and the group's number is the plain mean, not nothing", () => {
  const dry = [3, 5, 8].map((t, i) => ({ id: String(i), stake: 0n, valueBps: BigInt(t * 1000) }));
  assert.deepEqual(buckets(dry).map((x) => x.heightPermille), Array(10).fill(0));
  assert.deepEqual(buckets(dry).map((x) => x.noStake), [0, 0, 1, 0, 1, 0, 0, 1, 0, 0]);
  assert.equal(groupsNumberBps(dry), 5333n);
  assert.equal(groupsNumberBps([]), null);
});

test("the group's number shows as the nearest whole tenth, halves up", () => {
  assert.deepEqual([4499n, 4500n, 5333n, 400n, 9999n].map(tenthOf), [4, 5, 5, 0, 10]);
});

test("the marker waits for a third entry", () => {
  assert.deepEqual([fence.slice(0, 1), fence.slice(0, 2), fence.slice(0, 3)].map(showsMarker), [false, false, true]);
});

test("one stake over half of everything riding is named, because the picture alone reads as agreement", () => {
  assert.equal(overHalf(fence)?.id, "john");
  assert.equal(overHalf([e("a", 5, 10), e("b", 6, 10)]), null, "exactly half is not over half");
  assert.equal(overHalf([e("a", 5, 10)]), null, "one person alone is not a story about weight");
});

const day = 86_400_000;
test("a line over time needs more than a day open and at least four in: a slow three and a fast six both get none", () => {
  const now = new Date("2026-09-20T12:00:00Z");
  const opened = (ms: number) => new Date(now.getTime() - ms);
  assert.equal(sparkEligible({ openedAt: opened(3 * day), now, entries: 4, points: 5 }), true);
  assert.equal(sparkEligible({ openedAt: opened(7 * day), now, entries: 3, points: 5 }), false);
  assert.equal(sparkEligible({ openedAt: opened(600_000), now, entries: 6, points: 9 }), false);
  assert.equal(sparkEligible({ openedAt: opened(day), now, entries: 6, points: 9 }), false, "exactly a day is not more than a day");
  assert.equal(sparkEligible({ openedAt: opened(3 * day), now, entries: 4, points: 1 }), false, "one point is not a line");
});

const say = (entries: Entry[], viewerId = "you") => weightCaption({ entries, viewerId, nameOf: (id) => id[0]?.toUpperCase() + id.slice(1), stakeWords: (s) => `$${Number(s) / 100}` });
test("the caption says in words what the picture says in shapes, and names the one stake that outweighs the rest", () => {
  assert.equal(say(fence), "Height is how much is riding on each number, not how many people picked it. John has $50 on 2, more than half of what’s riding, which is why the group’s number sits at 4.");
  assert.match(say(fence, "john"), /You have \$50 on 2/);
  assert.match(say(fence.slice(0, 1)), /^You’re first in\./);
  assert.match(say(fence.slice(0, 3)), /^Everyone’s on the same number\./);
});

test("nothing said about the group's number borrows a word from finance", () => {
  const all = [say(fence), say(fence.slice(0, 1)), say(fence.slice(0, 3)), say(fence.slice(0, 5)), say([3, 5].map((t, i) => ({ id: String(i), stake: 0n, valueBps: BigInt(t * 1000) })))].join(" ");
  assert.equal(/\b(odds|price|pot|house|buy|sell|shares|liquidity|market says|position size)\b/i.test(all), false, all);
});
