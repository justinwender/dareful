/**
 * Photos on a market and stickers, against the real database and the real bucket (docs/marks-and-memories.md;
 * docs/decisions.md, the media phase): a memory is added to a settled market by someone who was in it and by
 * nobody else, and never before it is settled; a screenshot goes with what happened while it is being called,
 * three per person; both are seen by the participants and the group and by nobody else; the frame's query
 * returns memories only and the evidence query returns evidence only; a sticker belongs to its maker and is
 * seen by the people in a group where a question wears it; and a market takes a sticker as its mark only from
 * its own creator, with the sticker's ink. Every row and object is a temporary user's and is removed after.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db, schema } from "@/db";
import { ensureUsd } from "@/lib/ledger/denominations";
import { createGroup } from "@/lib/ledger/groups";
import * as markets from "@/lib/ledger/markets";
import { addMarketPhoto, canSee, mediaById, mediaOnMarket, MediaError, memoriesOnMarkets, frameKey, thumbKey } from "@/lib/media";
import { addSticker, canSeeMark, MarkError, stickersOf, stickerSourceKey, stickerStampKey } from "@/lib/media/marks";
import { removeObjects, storageConfigured } from "@/lib/media/storage";
import { cleanup, tempSigner, tempUser, track, type Signer, type User } from "./fixture";

let asker: Signer, friend: Signer, member: User, outsider: User, groupId: string, settledId: string, votingId: string, openId: string;
const objects: string[] = [];

/** A phone photo, drawn by sharp, with a capture time: what the pipeline strips and keeps is covered in the unit suite. */
const photo = () => sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 120, g: 90, b: 60 } } }).jpeg().withExif({ IFD2: { DateTimeOriginal: "2026:09:19 22:10:00" } }).toBuffer();
const cutout = () => sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><circle cx="150" cy="150" r="100" fill="rgb(40,170,165)"/></svg>')).png().toBuffer();
const code = (fn: () => Promise<unknown>) => fn().then(() => null, (e: unknown) => (e instanceof MediaError || e instanceof MarkError || e instanceof markets.MarketError ? e.code : `other: ${e instanceof Error ? e.message : e}`));

before(async () => {
  if (!storageConfigured()) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are needed: the bucket is real");
  [asker, friend, member, outsider] = await Promise.all([tempSigner("Priya Raman"), tempSigner("Dev"), tempUser("Maya"), tempUser("Stranger")]);
  const g = await createGroup({ name: "media check (temporary)", createdBy: asker.user.id });
  track.group(g.id);
  groupId = g.id;
  await db.insert(schema.groupMembers).values([{ groupId: g.id, userId: friend.user.id }, { groupId: g.id, userId: member.id }]);
  const usd = await ensureUsd(g.id, asker.user.id);
  const ask = async (title: string) => {
    const d0 = await markets.draftMarket({ creatorId: asker.user.id, groupId: g.id, denomId: usd.id, title, termsText: "Yes if it happens by Friday.", resolvesBy: new Date(Date.now() + 86_400_000) });
    const d = await markets.openMarket(d0.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(d0)));
    await markets.enterMarket({ dareId: d.id, userId: asker.user.id, stake: 500n, value: 8000n, signature: await asker.ledger.signTypedData(markets.enterTypedData(d, 500n, 8000n)) });
    await markets.enterMarket({ dareId: d.id, userId: friend.user.id, stake: 500n, value: 3000n, signature: await friend.ledger.signTypedData(markets.enterTypedData(d, 500n, 3000n)) });
    return d.id;
  };
  settledId = await ask("Did the kettle get descaled?");
  await db.update(schema.dares).set({ lockedAt: new Date(Date.now() - 7_200_000), resolvedAt: new Date(Date.now() - 3_600_000), resolvedOutcome: 1n, resolvedBy: "quorum" }).where(eq(schema.dares.id, settledId));
  votingId = await ask("Is the kettle being descaled right now?");
  await db.update(schema.dares).set({ lockedAt: new Date(Date.now() - 60_000) }).where(eq(schema.dares.id, votingId));
  openId = await ask("Will the kettle get descaled?");
});
after(async () => {
  if (objects.length) await removeObjects(objects);
  await cleanup();
});

test("a memory goes on a settled market by someone who was in it, once settled, and by nobody else", async () => {
  assert.equal(await code(async () => addMarketPhoto({ dareId: openId, authorId: asker.user.id, bytes: await photo(), viewerZone: null, role: "memory" })), "not_settled", "not while it runs");
  assert.equal(await code(async () => addMarketPhoto({ dareId: votingId, authorId: asker.user.id, bytes: await photo(), viewerZone: null, role: "memory" })), "not_settled", "not while it is being called");
  assert.equal(await code(async () => addMarketPhoto({ dareId: settledId, authorId: member.id, bytes: await photo(), viewerZone: null, role: "memory" })), "not_in", "someone in the group who was not in it");
  assert.equal(await code(async () => addMarketPhoto({ dareId: settledId, authorId: outsider.id, bytes: await photo(), viewerZone: null, role: "memory" })), "not_in");
  const first = await addMarketPhoto({ dareId: settledId, authorId: asker.user.id, bytes: await photo(), viewerZone: "America/New_York", role: "memory" });
  objects.push(frameKey(first.id), thumbKey(first.id));
  assert.equal(first.role, "memory");
  assert.equal(first.dareId, settledId);
  assert.equal(first.capturedAt?.toISOString(), "2026-09-20T02:10:00.000Z", "the capture time, read before the strip, in the viewer's zone");
  // Weeks later, by the other participant: adding later is the point.
  const second = await addMarketPhoto({ dareId: settledId, authorId: friend.user.id, bytes: await photo(), viewerZone: null, role: "memory" });
  objects.push(frameKey(second.id), thumbKey(second.id));
  const { memories } = await mediaOnMarket(settledId);
  assert.deepEqual(memories.map((m) => [m.id, m.author.displayName]), [[first.id, "Priya Raman"], [second.id, "Dev"]], "oldest first, credited to whoever added it");
});

test("a screenshot goes with what happened while it is being called, by anyone in the group, three at most, and never into the frame", async () => {
  assert.equal(await code(async () => addMarketPhoto({ dareId: settledId, authorId: asker.user.id, bytes: await photo(), viewerZone: null, role: "evidence" })), "not_voting", "nothing to prove once it is decided");
  assert.equal(await code(async () => addMarketPhoto({ dareId: votingId, authorId: outsider.id, bytes: await photo(), viewerZone: null, role: "evidence" })), "not_member");
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const row = await addMarketPhoto({ dareId: votingId, authorId: member.id, bytes: await photo(), viewerZone: null, role: "evidence" });
    objects.push(frameKey(row.id), thumbKey(row.id));
    ids.push(row.id);
  }
  assert.equal(await code(async () => addMarketPhoto({ dareId: votingId, authorId: member.id, bytes: await photo(), viewerZone: null, role: "evidence" })), "full", "three per person");
  const on = await mediaOnMarket(votingId);
  assert.deepEqual(on.evidence.map((e) => e.id), ids);
  assert.deepEqual(on.memories, [], "a scoreboard is not a memory of the night");
  assert.deepEqual((await memoriesOnMarkets([votingId, settledId])).get(votingId), [], "and the timeline's frame never gets it");
  assert.equal((await memoriesOnMarkets([settledId])).get(settledId)?.length, 2);
});

test("a market's media is seen by its participants and its group, and reads as nothing to anyone else", async () => {
  const { memories } = await mediaOnMarket(settledId);
  const row = await mediaById((memories[0] as { id: string }).id);
  assert.ok(row);
  assert.equal(await canSee(row, asker.user.id), true);
  assert.equal(await canSee(row, friend.user.id), true);
  assert.equal(await canSee(row, member.id), true, "the group it was asked in");
  assert.equal(await canSee(row, outsider.id), false);
  const { evidence } = await mediaOnMarket(votingId);
  const shot = await mediaById((evidence[0] as { id: string }).id);
  assert.ok(shot);
  assert.equal(await canSee(shot, friend.user.id), true, "evidence follows the same rule");
  assert.equal(await canSee(shot, outsider.id), false);
});

test("a sticker belongs to its maker, carries the ink measured from its pixels, and is seen by the people who can see a question wearing it", async () => {
  assert.equal(await code(async () => addSticker({ ownerId: asker.user.id, bytes: await photo() })), "not_a_cutout", "a photo is not a cutout");
  const s = await addSticker({ ownerId: asker.user.id, bytes: await cutout() });
  objects.push(stickerSourceKey(s.id), stickerStampKey(s.id));
  assert.equal(s.kind, "sticker");
  assert.equal(s.ink, "sea", "teal, measured from the disc alone");
  assert.deepEqual((await stickersOf(asker.user.id)).map((x) => x.id), [s.id]);
  assert.deepEqual(await stickersOf(friend.user.id), [], "your stickers are yours");
  assert.equal(await canSeeMark(s, asker.user.id), true);
  assert.equal(await canSeeMark(s, friend.user.id), false, "nobody else, until a question wears it");
  // The friend cannot use the asker's sticker as a mark; the asker can, and the market takes its ink.
  const usd = await ensureUsd(groupId, asker.user.id);
  const draft = (owner: Signer) => markets.draftMarket({ creatorId: owner.user.id, groupId, denomId: usd.id, title: "Does the sticker stick?", termsText: "Yes if it does.", resolvesBy: new Date(Date.now() + 86_400_000), mark: { kind: "sticker", id: s.id } });
  assert.equal(await code(() => draft(friend)), "bad_input");
  const d = await draft(asker);
  assert.equal(d.markKind, "sticker");
  assert.equal(d.markValue, s.id);
  assert.equal(d.ink, "sea");
  assert.equal(d.inkSource, "mark");
  await markets.openMarket(d.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(d)));
  assert.equal(await canSeeMark(s, friend.user.id), true, "in a group where a question wears it");
  assert.equal(await canSeeMark(s, member.id), true);
  assert.equal(await canSeeMark(s, outsider.id), false);
});
