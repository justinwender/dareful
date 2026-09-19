/** Group invite links: revocable, counted, hashed at rest, and never a way to learn whether a token is live. */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { activeInvites, createGroup, createInvite, ensureDyad, isMember, readInvite, redeemInvite, revokeInvite } from "@/lib/ledger/groups";
import { hashToken } from "@/lib/ledger/tokens";
import { cleanup, tempUser, track, type User } from "./fixture";

let a: User, b: User, c: User, d: User;
before(async () => {
  [a, b, c, d] = await Promise.all([tempUser("Ana"), tempUser("Ben"), tempUser("Cy"), tempUser("Dee")]);
});
after(cleanup);

async function group(): Promise<{ id: string; token: string }> {
  const g = await createGroup({ name: "invite check (temporary)", createdBy: a.id });
  track.group(g.id);
  return { id: g.id, token: await createInvite(g.id, a.id) };
}
async function useCount(token: string): Promise<number | null> {
  const h = hashToken(token);
  if (!h) return null;
  const [row] = await db.select({ n: schema.groupInvites.useCount }).from(schema.groupInvites).where(eq(schema.groupInvites.tokenHash, h));
  return row?.n ?? null;
}

test("a member can make a link, and it reads as live", async () => {
  const g = await group();
  assert.match(g.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal((await readInvite(g.token))?.groupId, g.id);
});

test("a non-member cannot make a link", async () => {
  const g = await group();
  await assert.rejects(() => createInvite(g.id, b.id));
});

test("redeeming joins the group and counts once", async () => {
  const g = await group();
  assert.equal(await isMember(g.id, b.id), false);
  assert.equal((await redeemInvite(g.token, b.id))?.id, g.id);
  assert.equal(await isMember(g.id, b.id), true);
  assert.equal(await useCount(g.token), 1);
});

test("an existing member tapping the link again is not a use", async () => {
  const g = await group();
  await redeemInvite(g.token, b.id);
  await redeemInvite(g.token, b.id);
  await redeemInvite(g.token, a.id);
  assert.equal(await useCount(g.token), 1);
});

test("two concurrent redemptions by one person count once", async () => {
  const g = await group();
  await Promise.all([redeemInvite(g.token, c.id), redeemInvite(g.token, c.id), redeemInvite(g.token, c.id)]);
  assert.equal(await useCount(g.token), 1);
  assert.equal((await db.select().from(schema.groupMembers).where(eq(schema.groupMembers.groupId, g.id))).filter((m) => m.userId === c.id).length, 1);
});

test("a malformed token, and the old signed-token shape, read as nothing", async () => {
  assert.equal(await readInvite("not-a-token"), null);
  assert.equal(await redeemInvite("not-a-token", d.id), null);
  assert.equal(await readInvite("eyJnIjoiYSJ9.c2ln"), null);
});

test("a live link is listed with its count and its maker", async () => {
  const g = await group();
  await redeemInvite(g.token, b.id);
  const listed = await activeInvites(g.id);
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.useCount, 1);
  assert.equal(listed[0]?.createdBy, a.id);
});

test("a non-member cannot turn a link off, and it still works afterwards", async () => {
  const g = await group();
  const id = (await activeInvites(g.id))[0]?.id ?? "";
  await assert.rejects(() => revokeInvite(g.id, id, d.id));
  assert.notEqual(await readInvite(g.token), null);
});

test("a member who did not make a link can turn it off, and then it joins no one and is not listed", async () => {
  const g = await group();
  await redeemInvite(g.token, b.id);
  const id = (await activeInvites(g.id))[0]?.id ?? "";
  await revokeInvite(g.id, id, b.id);
  assert.equal(await readInvite(g.token), null);
  assert.equal(await redeemInvite(g.token, d.id), null);
  assert.equal(await isMember(g.id, d.id), false);
  assert.equal((await activeInvites(g.id)).length, 0);
});

test("an expired link reads as nothing, joins no one, and is not listed", async () => {
  const g = await group();
  const h = hashToken(g.token);
  assert.ok(h);
  await db.update(schema.groupInvites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.groupInvites.tokenHash, h));
  assert.equal(await readInvite(g.token), null);
  assert.equal(await redeemInvite(g.token, d.id), null);
  assert.equal(await isMember(g.id, d.id), false);
  assert.equal((await activeInvites(g.id)).length, 0);
});

test("a new link is good for fourteen days", async () => {
  const g = await group();
  const h = hashToken(g.token);
  assert.ok(h);
  const [row] = await db.select().from(schema.groupInvites).where(eq(schema.groupInvites.tokenHash, h));
  assert.ok(row);
  const days = (row.expiresAt.getTime() - row.createdAt.getTime()) / 86_400_000;
  assert.ok(days > 13.9 && days < 14.1, `expires in ${days} days`);
});

test("a dyad cannot be joined by link", async () => {
  const dyad = await ensureDyad(a.id, d.id);
  track.group(dyad.id);
  await assert.rejects(() => createInvite(dyad.id, a.id));
});

test("only the hash is stored, never the token", async () => {
  const g = await group();
  const stored = await db.select({ h: schema.groupInvites.tokenHash }).from(schema.groupInvites).where(eq(schema.groupInvites.groupId, g.id));
  assert.equal(stored.length, 1);
  assert.deepEqual(stored[0]?.h, hashToken(g.token));
  assert.ok(!stored[0]?.h.toString("utf8").includes(g.token));
});
