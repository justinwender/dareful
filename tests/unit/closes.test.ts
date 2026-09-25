/**
 * Settling, forgiving and netting as rules (PLANNING.md 5a, 7; docs/design.md 6.3): the reason words map to the
 * chain's two codes, a Close is signed over the obligation's own counter, and what nets is exactly the pairs of
 * reciprocal fungible edges in one unit and one set of people, by the smaller side.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { closeTypedData, netTypedData, nettablePairs, reasonCode } from "@/lib/ledger/closes";
import { rallyRows } from "@/lib/ledger/person";
import { uuidToBytes16 } from "@/lib/ledger/ids";

const A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const C = "0xcccccccccccccccccccccccccccccccccccccccc";
const edge = (debtor: string, creditor: string, remaining: string, extra: Partial<{ groupId: string; denomId: string; unique: boolean }> = {}) => ({
  id: "0x00",
  tokenId: "1",
  groupId: extra.groupId ?? "0xg1",
  denomId: extra.denomId ?? "0xd1",
  debtor,
  creditor,
  qty: remaining,
  remaining,
  settled: "0",
  forgiven: "0",
  netted: "0",
  unique: extra.unique ?? false,
  confirmedAt: 0,
  lastClosedAt: null,
});

test("settled is 0 and forgiven is 1, the way the contract reads the reason", () => {
  assert.equal(reasonCode("settled"), 0);
  assert.equal(reasonCode("forgiven"), 1);
  const typed = closeTypedData({ obligationId: "8ffed2db-77af-40a1-8858-f8e33d440095", tokenId: 7n, qty: 3n, reason: "forgiven", nonce: 2n });
  assert.equal(typed.primaryType, "Close");
  assert.deepEqual(typed.message, { id: 7n, qty: 3n, reason: 1, obligationId: uuidToBytes16("8ffed2db-77af-40a1-8858-f8e33d440095"), nonce: 2n }, "the counter is in the message: a signature never replays");
  assert.equal(netTypedData({ groupId: "0x01", denomId: "0x02", a: A, b: B, nonce: 5n }).message.nonce, 5n);
});

test("what nets is each unit in each set of people that goes both ways, by the smaller side, and unique obligations never", () => {
  const open = [
    edge(A, B, "3"), // A owes B three beers
    edge(B, A, "2"), // B owes A two
    edge(B, A, "4", { denomId: "0xd2" }), // another unit, one way only: nothing to net
    edge(A, C, "5"), // someone else entirely
    edge(A, B, "1", { groupId: "0xg2" }), // the same unit in another set of people, one way: nothing to net there
    edge(B, A, "9", { unique: true }), // a unique obligation has its own token id
  ];
  const pairs = nettablePairs(open, A, B);
  assert.deepEqual(pairs, [{ groupId: "0xg1", denomId: "0xd1", aOwes: 3n, bOwes: 2n, cancels: 2n }]);
  assert.deepEqual(nettablePairs(open, A, C), [], "one way is nothing to net");
  assert.deepEqual(nettablePairs(open, "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", B), pairs, "addresses match whatever their case");
});

test("the rally is the last twelve pick-ups, one row per person, and needs four to show at all", () => {
  const me = "me";
  const them = "them";
  const at = (n: number) => new Date(2026, 8, n);
  assert.equal(rallyRows([{ userId: me, at: at(1) }, { userId: them, at: at(2) }, { userId: me, at: at(3) }], me, them), null, "fewer than four: no pattern to show");
  const rows = rallyRows(
    [
      { userId: them, at: at(5) },
      { userId: me, at: at(4) },
      { userId: me, at: at(3) },
      { userId: them, at: at(2) },
      { userId: me, at: at(1) },
    ],
    me,
    them,
  );
  assert.ok(rows);
  assert.equal(rows.length, 2, "one row per person: them first, then you");
  assert.deepEqual(rows[0]?.slots, [false, true, false, false, true], "oldest first, left-aligned, a dot where that person picked it up");
  assert.deepEqual(rows[1]?.slots, [true, false, true, true, false]);
  const many = rallyRows(Array.from({ length: 20 }, (_, i) => ({ userId: i % 3 === 0 ? them : me, at: at(20 - i) })), me, them);
  assert.equal(many?.[0]?.slots.length, 12, "never more than twelve slots");
});
