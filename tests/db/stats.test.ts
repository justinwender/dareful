/**
 * The numbers (the field round, 3.1), against the real database: a counted account's events count, an excluded
 * account's never, a guest's always, and a day written twice is one row.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ensureUsd } from "@/lib/ledger/denominations";
import { createGroup } from "@/lib/ledger/groups";
import { draftMarket, VOID_OUTCOME } from "@/lib/ledger/markets";
import { cleanResolution } from "@/lib/ledger/settle";
import { syncSchedule } from "@/lib/sports";
import { parseScoreboard } from "@/lib/sports/espn";
import { countStats, dayOf, takeSnapshot } from "@/lib/usage/stats";
import { hashPhone } from "@/lib/auth/phone";
import { cleanup, fictionalPhone, tempUser, track, type User } from "./fixture";

let counted: User, excluded: User;
before(async () => {
  [counted, excluded] = await Promise.all([tempUser("Counted", undefined, { counted: true }), tempUser("Excluded")]);
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
  // Questions are counted from the ledger's own table (the submission round, section 2; tests/db/submission.test.ts holds
  // a counted asker's against an excluded one's there): an "asked" event with no question behind it is no question.
  assert.equal(day.questions, 0, "an ask event alone is not a question");
  assert.equal(day.askers, 1, "the counted account asked, the excluded one's ask never counts");
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
  const byPhone = await tempUser("By Phone", hashPhone(fictionalPhone()), { counted: true });
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

test("the four the pitch quotes: someone who came by a friend's question and then asked, sets with two or more questions, the clean-resolution rate as the profile counts it, and photos and stickers added", async () => {
  // A day in 2003 nobody else has rows in. Every row is made by this file's temporary accounts and moved there.
  const H = 3_600_000;
  const t0 = new Date("2003-03-03T12:00:00Z");
  const at = (hours: number) => new Date(t0.getTime() + hours * H);
  const win = { from: new Date("2003-03-03T05:00:00Z"), to: new Date("2003-03-04T05:00:00Z") };
  const joiner = await tempUser("Joiner", undefined, { counted: true });
  const sets = [] as Array<{ groupId: string; denomId: string }>;
  for (const name of ["one", "two", "three"]) {
    const g = await createGroup({ name: `stats check ${name} (temporary)`, createdBy: counted.id });
    track.group(g.id);
    await db.insert(schema.groupMembers).values([{ groupId: g.id, userId: joiner.id }, { groupId: g.id, userId: excluded.id }]);
    sets.push({ groupId: g.id, denomId: (await ensureUsd(g.id, counted.id)).id });
  }
  const [first, second, third] = sets as [typeof sets[number], typeof sets[number], typeof sets[number]];
  const ask = async (who: User, set: { groupId: string; denomId: string }, hours: number, more: Partial<typeof schema.dares.$inferInsert> = {}) => {
    const d = await draftMarket({ creatorId: who.id, groupId: set.groupId, denomId: set.denomId, title: "Does the page count it?", termsText: "Yes if the number moves. No if it does not.", resolvesBy: new Date(Date.now() + H) });
    await db.update(schema.dares).set({ creatorSignature: Buffer.from("01", "hex"), createdAt: at(hours), ...more }).where(eq(schema.dares.id, d.id));
    return d.id;
  };
  const enter = (dareId: string, who: User, hours: number) => db.insert(schema.darePositions).values({ dareId, userId: who.id, stake: 100n, value: 5000n, enteredBy: who.id, enteredAt: at(hours), acknowledgedAt: at(hours) });

  // The first set: the counted account asks, the joiner and the excluded account get in, and each then asks one of their own.
  const q1 = await ask(counted, first, 0, { resolvedAt: at(5), resolvedBy: "quorum", resolvedOutcome: 1n });
  await enter(q1, joiner, 1);
  await enter(q1, excluded, 1);
  const q2 = await ask(joiner, first, 2, { resolvedAt: at(5), resolvedBy: "arbitration", resolvedOutcome: VOID_OUTCOME });
  await ask(excluded, first, 3, { resolvedAt: at(5), resolvedBy: "quorum", resolvedOutcome: 1n });
  // The counted account gets into the joiner's question after asking its own: it did not come by a link.
  await enter(q2, counted, 3);
  await enter(q2, excluded, 3);
  // A question only its asker was in, answered by a vote: in neither number. A guest's question its quorum decided: counted.
  const alone = await ask(counted, first, 4, { resolvedAt: at(5), resolvedBy: "quorum", resolvedOutcome: 1n });
  await enter(alone, counted, 4);
  const guests = await ask(counted, first, 4, { resolvedAt: at(5), resolvedBy: "provisional", resolvedOutcome: 1n });
  await enter(guests, counted, 4);
  await enter(guests, joiner, 4);
  // The second set: one question that stands and one called off, so it is not a set with two.
  // The final score's own void with two in, so it is the void rule and not the headcount that keeps it out of the rate.
  const tie = await ask(counted, second, 1, { resolvedAt: at(5), resolvedBy: "feed", resolvedOutcome: VOID_OUTCOME });
  await enter(tie, counted, 1);
  await enter(tie, joiner, 1);
  await ask(counted, second, 1, { resolvedAt: at(5), resolvedBy: "removed" });
  // The third: two questions on one game, which count once, and one that expired.
  const RUN = Math.random().toString(36).slice(2, 8);
  track.gamePrefix(`test:${RUN}:`);
  const game = parseScoreboard("nfl", JSON.parse(readFileSync(new URL("../fixtures/sports/espn-nfl-scheduled.json", import.meta.url), "utf8"))).slice(0, 1).map((g) => ({ ...g, sourceId: `test:${RUN}:${g.sourceId}`, startsAt: new Date(Date.now() + 2 * H) }));
  await syncSchedule("nfl", new Date(), { name: "espn", listGames: async () => game });
  const [row] = await db.select().from(schema.sportsGames).where(and(eq(schema.sportsGames.source, "espn"), eq(schema.sportsGames.sourceId, game[0]!.sourceId)));
  const templates = await db.select().from(schema.publicQuestions).where(eq(schema.publicQuestions.gameId, row!.id));
  assert.ok(templates.length >= 2, "the game's questions");
  await ask(counted, third, 1, { templateId: templates[0]!.id, resolvedAt: at(5), resolvedBy: "expired" });
  await ask(counted, third, 1, { templateId: templates[1]!.id });

  // A photo by the counted account, one by the excluded one, a sticker by the joiner, and a picture that is not a sticker.
  await db.insert(schema.media).values([
    { dareId: q1, kind: "photo", storageKey: `test/${RUN}/a`, width: 10, height: 10, authorId: counted.id, createdAt: at(6) },
    { dareId: q1, kind: "photo", storageKey: `test/${RUN}/b`, width: 10, height: 10, authorId: excluded.id, createdAt: at(6) },
  ]);
  await db.insert(schema.pictureMarks).values([
    { ownerId: joiner.id, kind: "sticker", sourceKey: `test/${RUN}/s`, stampKey: `test/${RUN}/t`, width: 10, height: 10, createdAt: at(6) },
    { ownerId: counted.id, kind: "image", sourceKey: `test/${RUN}/i`, stampKey: `test/${RUN}/j`, width: 10, height: 10, createdAt: at(6) },
  ]);

  const day = await countStats(win);
  assert.equal(day.link_to_asker, 1, "the joiner alone: in a friend's question first, then asked; the counted account asked first, and the excluded one is nobody");
  assert.equal(day.sets_two_questions, 1, "the first set alone: a question called off does not make two, and a game's questions count once");
  assert.equal(day.media_added, 2, "the counted account's photo and the joiner's sticker; the excluded account's photo and a plain picture are not in it");
  // The rate, held to the profile's own rule on the same rows.
  const [mine, theirs] = await Promise.all([cleanResolution(counted.id), cleanResolution(joiner.id)]);
  assert.deepEqual([mine.ended + theirs.ended, mine.clean + theirs.clean], [3, 2], "a vote's answer, a guest's question decided by vote and the tiebreaker's void; the one-person question, the final score's void and the expiry are in neither number");
  assert.equal(day.clean_rate, 67, "two of the three that ended came to an answer");
  const before = await countStats({ from: new Date("2003-03-02T05:00:00Z"), to: win.from });
  assert.deepEqual([before.link_to_asker, before.sets_two_questions, before.clean_rate, before.media_added], [0, 0, 0, 0], "the window holds");
});
