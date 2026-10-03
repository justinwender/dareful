/**
 * The numbers (the field round, 3.1), against the real database: a counted account's events count, an excluded
 * account's never, a guest's always, and a day written twice is one row.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { countStats, dayOf, takeSnapshot } from "@/lib/usage/stats";
import { hashPhone } from "@/lib/auth/phone";
import { cleanup, fictionalPhone, tempUser, type User } from "./fixture";

let counted: User, excluded: User;
before(async () => {
  [counted, excluded] = await Promise.all([tempUser("Counted"), tempUser("Excluded")]);
  await db.update(schema.users).set({ excludedFromCounts: true }).where(eq(schema.users.id, excluded.id));
});
/** The one device this file's guest rows carry: a guest's row has no account to be removed with, so it is removed by this id, before and after, whatever a run under a mutant left behind. */
const DEVICE = "00000000-0000-4000-8000-00000000abcd";
const wipeGuestRows = () => db.delete(schema.usageEvents).where(eq(schema.usageEvents.deviceId, DEVICE));
after(async () => {
  await wipeGuestRows();
  await db.delete(schema.usageSnapshots).where(eq(schema.usageSnapshots.day, "1999-01-01"));
  await cleanup();
});

test("a counted account's events count in the window, an excluded account's never, and a guest's always", async () => {
  // A window nobody else has events in, so the suites running beside this one cannot move the numbers.
  const at = new Date("2002-02-02T17:00:00Z");
  const from = new Date("2002-02-02T05:00:00Z");
  const to = new Date("2002-02-03T05:00:00Z");
  const asked = { kind: "binary", pace: "dare", source: "direct", mark: "none" };
  await wipeGuestRows();
  await db.insert(schema.usageEvents).values([
    { name: "asked", userId: counted.id, at, props: asked },
    { name: "asked", userId: excluded.id, at, props: asked },
    { name: "entered", deviceId: DEVICE, at, props: { as: "guest" } },
    { name: "share", userId: excluded.id, at, props: { icon: "copy" } },
  ]);
  const day = await countStats({ from, to });
  assert.equal(day.questions, 1, "the counted account's question, not the excluded one's");
  assert.equal(day.askers, 1);
  assert.equal(day.guest_entries, 1, "a guest's entry counts with nobody to exclude");
  assert.equal(day.shares, 0, "the excluded account's share never counts");
  assert.equal(day.active_people, 1);
  const earlier = await countStats({ from: new Date("2002-02-01T05:00:00Z"), to: from });
  assert.deepEqual([earlier.questions, earlier.guest_entries], [0, 0], "the window holds");
  await wipeGuestRows();
});

test("a day written twice is one row, replaced", async () => {
  const day = "1999-01-01";
  await takeSnapshot(day);
  const [first] = await db.select().from(schema.usageSnapshots).where(eq(schema.usageSnapshots.day, day));
  await new Promise((r) => setTimeout(r, 25));
  await takeSnapshot(day);
  const rows = await db.select().from(schema.usageSnapshots).where(eq(schema.usageSnapshots.day, day));
  assert.equal(rows.length, 1);
  assert.ok(first && rows[0]!.takenAt.getTime() > first.takenAt.getTime(), "the second take replaced the first, not kept it");
  assert.equal(dayOf(rows[0]!.takenAt) >= "2026-01-01", true);
  assert.deepEqual((rows[0]!.counts as { questions: number }).questions, 0, "a day before launch counted nothing");
});

test("people with a channel: an email sign-in or a push subscription counts, a phone sign-in with neither does not, as a count and as a share of the people active in the window", async () => {
  const byPhone = await tempUser("By Phone", hashPhone(fictionalPhone()));
  // A window nobody else has events in, so the people active in it are these three alone.
  const at = new Date("2001-01-01T17:00:00Z");
  for (const u of [counted, byPhone, excluded]) await db.insert(schema.usageEvents).values({ name: "share", userId: u.id, at, props: { icon: "copy" } });
  const day = await countStats({ from: new Date("2001-01-01T05:00:00Z"), to: new Date("2001-01-02T05:00:00Z") });
  assert.deepEqual([day.active_people, day.with_channel, day.channel_share], [2, 1, 50], "the email sign-in is reachable, the phone sign-in is not, the excluded account is nobody");
  await db.insert(schema.pushSubscriptions).values({ userId: byPhone.id, endpoint: `https://push.invalid/${byPhone.id}`, p256dh: "k", auth: "a" });
  try {
    const after = await countStats({ from: new Date("2001-01-01T05:00:00Z"), to: new Date("2001-01-02T05:00:00Z") });
    assert.deepEqual([after.with_channel, after.channel_share], [2, 100], "a push subscription is a channel");
  } finally {
    await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, byPhone.id));
  }
});
