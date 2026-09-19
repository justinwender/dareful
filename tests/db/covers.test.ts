/**
 * Covers: one total split across a group (the expense shape), and a unit named in the form and registered with
 * the group, or the dyad, only when the cover is saved.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ensureUnitInGroup } from "@/lib/ledger/denominations";
import { splitCover } from "@/lib/ledger/expenses";
import { createGroup, ensureDyad } from "@/lib/ledger/groups";
import { SplitError } from "@/lib/ledger/split";
import { cleanup, tempUser, track, type User } from "./fixture";

let P: User, A: User, B: User, C: User, outsider: User;
before(async () => {
  [P, A, B, C, outsider] = await Promise.all([tempUser("Payer"), tempUser("Ana"), tempUser("Ben"), tempUser("Cy"), tempUser("Outsider")]);
});
after(cleanup);

async function group() {
  const g = await createGroup({ name: "split check (temporary)", createdBy: P.id });
  track.group(g.id);
  await db.insert(schema.groupMembers).values([A, B, C].map((u) => ({ groupId: g.id, userId: u.id })));
  return g;
}
const proposalsOf = (expenseId: string) => db.select().from(schema.obligationProposals).where(eq(schema.obligationProposals.originId, expenseId));

test("one total becomes one pending proposal per person who was there, and the payer's share is nobody's", async () => {
  const g = await group();
  const r = await splitCover({ payerId: P.id, groupId: g.id, presentUserIds: [A.id, B.id, C.id], totalCents: 10000n, payerIn: true, settleExpected: true, memo: "Dinner" });
  const rows = await proposalsOf(r.expenseId);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((p) => p.quantity), [2500n, 2500n, 2500n]);
  assert.ok(rows.every((p) => p.toUser === P.id && p.origin === "expense" && p.status === "pending" && p.amountCents === p.quantity && p.memo === "Dinner"));
  assert.deepEqual(rows.map((p) => p.fromUser).sort(), [A.id, B.id, C.id].sort());
  assert.ok(!rows.some((p) => p.fromUser === P.id));
});

test("the expense rows reconcile: the claimed shares are exact fractions that sum to the whole", async () => {
  const g = await group();
  const r = await splitCover({ payerId: P.id, groupId: g.id, presentUserIds: [A.id, B.id], totalCents: 10000n, payerIn: true, settleExpected: true });
  const [expense] = await db.select().from(schema.expenses).where(eq(schema.expenses.id, r.expenseId));
  assert.equal(expense?.totalCents, 10000n);
  assert.equal(expense?.status, "finalized");
  assert.equal(expense?.source, "manual");
  const [item] = await db.select().from(schema.expenseItems).where(eq(schema.expenseItems.expenseId, r.expenseId));
  assert.ok(item);
  const claims = await db.select().from(schema.itemClaims).where(eq(schema.itemClaims.expenseItemId, item.id));
  assert.equal(claims.length, 3);
  assert.ok(claims.every((c) => c.shareDen === 10000));
  assert.equal(claims.reduce((a, c) => a + c.shareNum, 0), 10000);
  assert.equal(claims.find((c) => c.userId === P.id)?.shareNum, 3334); // the odd cent is the payer's
});

test("someone outside the group cannot be split with, and nothing is written", async () => {
  const g = await group();
  const before = (await db.select().from(schema.expenses).where(eq(schema.expenses.groupId, g.id))).length;
  await assert.rejects(() => splitCover({ payerId: P.id, groupId: g.id, presentUserIds: [A.id, outsider.id], totalCents: 5000n, payerIn: true, settleExpected: true }), SplitError);
  await assert.rejects(() => splitCover({ payerId: outsider.id, groupId: g.id, presentUserIds: [A.id], totalCents: 5000n, payerIn: true, settleExpected: true }), SplitError);
  assert.equal((await db.select().from(schema.expenses).where(eq(schema.expenses.groupId, g.id))).length, before);
});

test("the payer listed among those present is not asked to cover themselves", async () => {
  const g = await group();
  const r = await splitCover({ payerId: P.id, groupId: g.id, presentUserIds: [P.id, A.id], totalCents: 3000n, payerIn: true, settleExpected: true });
  const rows = await proposalsOf(r.expenseId);
  assert.deepEqual(rows.map((p) => [p.fromUser, p.quantity]), [[A.id, 1500n]]);
});

test("a person pinned at nothing gets no proposal", async () => {
  const g = await group();
  const r = await splitCover({ payerId: P.id, groupId: g.id, presentUserIds: [A.id, B.id], totalCents: 3000n, payerIn: false, fixed: new Map([[A.id, 0n]]), settleExpected: true });
  const rows = await proposalsOf(r.expenseId);
  assert.deepEqual(rows.map((p) => [p.fromUser, p.quantity]), [[B.id, 3000n]]);
});

test("a unit named between two people is registered with their dyad, once", async () => {
  const dyad = await ensureDyad(P.id, A.id);
  track.group(dyad.id);
  const one = await ensureUnitInGroup(dyad.id, P.id, { template: "next_time", label: "next_time" });
  const two = await ensureUnitInGroup(dyad.id, P.id, { template: "next_time", label: "anything" });
  assert.equal(one.id, two.id);
  assert.equal(one.groupId, dyad.id);
  assert.equal(one.quantifiable, false);
  assert.equal(one.monetary, false);
  assert.equal(one.label, "a next time");
});

test("a custom unit is found again whatever its capitalization, keeps its mark, and is separate per group", async () => {
  const g = await group();
  const other = await group();
  const one = await ensureUnitInGroup(g.id, P.id, { template: null, label: "Dumpling Run", markEmoji: "🥟" });
  const two = await ensureUnitInGroup(g.id, A.id, { template: null, label: "dumpling run" });
  const elsewhere = await ensureUnitInGroup(other.id, P.id, { template: null, label: "dumpling run" });
  assert.equal(one.id, two.id);
  assert.equal(one.markValue, "🥟");
  assert.equal(one.quantifiable, true);
  assert.notEqual(elsewhere.id, one.id);
});
