/**
 * The rendered pages over HTTP, against a running server (TEST_BASE_URL, default http://localhost:3000) that
 * shares this database. Sessions are forged with SESSION_SECRET for temporary users, which is what a real
 * session cookie is. Asserts on what a visitor, or a link-preview bot, actually receives.
 */
import { chromeIsHere, watchOpening } from "../../scripts/dev/opening-check";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { SignJWT } from "jose";
import { db, schema } from "@/db";
import * as claims from "@/lib/ledger/claims";
import { createGroup, createOccasionGroup } from "@/lib/ledger/groups";
import { ensureUsd } from "@/lib/ledger/denominations";
import * as markets from "@/lib/ledger/markets";
import { gameTile, marketTile } from "@/lib/ledger/share";
import { INKS, inkOf } from "@/lib/ui/ink";
import { thumbKey } from "@/lib/media";
import { stickerStampKey } from "@/lib/media/marks";
import { putObject, removeObjects, storageConfigured } from "@/lib/media/storage";
import sharp from "sharp";
import { cleanup, cover, fictionalPhone, ghost, tempSigner, tempUser, track, type Signer, type User } from "../db/fixture";
import { hashPhone } from "@/lib/auth/phone";
import { enterAsGhost } from "@/lib/ledger/ghost-entry";
import { removeMarket } from "@/lib/ledger/now-swipes";
import { settleProvisional } from "@/lib/ledger/provisional";
import { readFileSync } from "node:fs";
import { syncSchedule } from "@/lib/sports";
import { parseScoreboard } from "@/lib/sports/espn";
import { FEED_RULING } from "@/lib/sports";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

type Got = { status: number; type: string | null; loc: string | null; setCookie: string | null; html: string; /** The markup alone, without the scripts: Now answers in pieces (11.5), and what the framework carries for the browser repeats the page's words ahead of the markup that draws them. */ dom: string; text: string; bytes: Buffer };
async function get(path: string, cookie?: string, rawCookie?: string): Promise<Got> {
  const cookies = [cookie ? `dareful_session=${cookie}` : null, rawCookie ?? null].filter(Boolean).join("; ");
  const r = await fetch(BASE + path, { headers: cookies ? { cookie: cookies } : {}, redirect: "manual" });
  const bytes = Buffer.from(await r.arrayBuffer());
  const html = bytes.toString("utf8");
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    // Next streams the <title> into the body at a position that varies between requests; it is not page text.
    .replace(/<title>[\s\S]*?<\/title>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&rsquo;/g, "’")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
  return { status: r.status, type: r.headers.get("content-type"), loc: r.headers.get("location"), setCookie: r.headers.get("set-cookie"), html, dom: html.replace(/<script[\s\S]*?<\/script>/g, ""), text, bytes };
}
const meta = (html: string, property: string) => new RegExp(`<meta property="${property}" content="([^"]*)"`).exec(html)?.[1] ?? null;
async function cookieFor(userId: string): Promise<string> {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(s));
}

let A: User, B: User, C: User, U: User;
let cA: string, cB: string, cU: string;
let gabe: string, linkToken: string, groupId: string, boundId: string, ghostCoverId: string;
let asker: Signer, friend: Signer, stranger: Signer, cAsker: string, cFriend: string, cStranger: string, marketId: string, draftId: string, owedId: string, photoId: string, settledMarketId: string, mintedId: string;
let numberId: string, aiScaleId: string, blindNumberId: string, answeredId: string;
let memoryIds: string[] = [], evidenceOnSettledId: string, evidenceId: string, evidenceMarketId: string, stickerId: string, stickerMarketId: string;
let nia: Signer, rae: Signer, cNia: string, calledId: string, calledClipId: string, voidedId: string, memoryId: string;
let pickOpenId: string, pickBlindId: string, pickLockedId: string, pickVotingId: string, pickSettledId: string;
let windowId: string, windowPhotoId: string;
let feedOpenId: string, feedMarginId: string, feedVotingId: string, feedSettledId: string, feedHome = "", feedAway = "", feedHomeAbbr = "", feedAwayAbbr = "", cRae: string, feedGameId: string, feedGroupId: string, nightGameId: string, nightGroupId: string;
const bucketKeys: string[] = [];

before(async () => {
  const up = await fetch(BASE).catch(() => null);
  if (!up) throw new Error(`nothing is listening at ${BASE}; start the app first`);
  [A, B, C, U] = await Promise.all([tempUser("Alex Rivera"), tempUser("Ben"), tempUser("Cy"), tempUser("Nico")]);
  [cA, cB, cU] = await Promise.all([cookieFor(A.id), cookieFor(B.id), cookieFor(U.id)]);
  gabe = await ghost(A.id, "Gabe");
  ghostCoverId = (await cover(A.id, gabe, "Dinner at Sal’s", 4720n)).id;
  await cover(A.id, gabe, "Cab home", 1800n);
  linkToken = await claims.createClaimLink(gabe, A.id);
  for (const [creditor, memo, amt] of [[A, "Concert tickets", 6500n], [C, "Brunch", 2300n], [A, "Parking", 900n]] as const) {
    const g = await ghost(creditor.id, "Nico");
    const p = await cover(creditor.id, g, memo, amt);
    if (memo === "Concert tickets") boundId = p.id;
    await claims.bindClaimToUser(g, U.id);
  }
  const group = await createGroup({ name: "Thursday Poker (check)", createdBy: A.id });
  groupId = track.group(group.id);

  // A question in a group of two, with the asker in at a distinctive number, and a draft beside it.
  [asker, friend, stranger] = await Promise.all([tempSigner("Priya Raman"), tempSigner("Dev"), tempSigner("Stranger")]);
  [cAsker, cFriend, cStranger] = await Promise.all([cookieFor(asker.user.id), cookieFor(friend.user.id), cookieFor(stranger.user.id)]);
  const mg = await createGroup({ name: "Question check", createdBy: asker.user.id });
  track.group(mg.id);
  await db.insert(schema.groupMembers).values({ groupId: mg.id, userId: friend.user.id });
  const usd = await ensureUsd(mg.id, asker.user.id);
  const ask = (title: string) => markets.draftMarket({ creatorId: asker.user.id, groupId: mg.id, denomId: usd.id, title, termsText: "Yes if the kettle is descaled by Friday.", resolvesBy: new Date(Date.now() + 86_400_000) });
  draftId = (await ask("Is this draft still a secret?")).id;
  const d0 = await ask("Does the kettle get descaled by Friday?");
  const d = await markets.openMarket(d0.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(d0)));
  await markets.enterMarket({ dareId: d.id, userId: asker.user.id, stake: 1700n, value: 8300n, signature: await asker.ledger.signTypedData(markets.enterTypedData(d, 1700n, 8300n)) });
  marketId = d.id;

  // Between the asker and the friend: one cover the friend has to pick up, and four nobody expects to settle.
  const row = (from: Signer, to: Signer, qty: bigint, settleExpected: boolean, memo: string | null, daysAgo: number) => ({ id: randomUUID(), tokenId: 1n, groupId: mg.id, fromUser: from.user.id, toUser: to.user.id, denomId: usd.id, quantity: qty, uniqueObligation: false, amountCents: qty, origin: "manual", settleExpected, memo, confirmTx: Buffer.alloc(32), createdAt: new Date(Date.now() - daysAgo * 86_400_000) });
  const owed = row(friend, asker, 2300n, true, "Brunch at Ida’s", 1);
  owedId = owed.id;
  await db.insert(schema.obligations).values([owed, row(friend, asker, 900n, false, null, 9), row(asker, friend, 700n, false, null, 7), row(friend, asker, 1200n, false, null, 5), row(asker, friend, 400n, false, null, 3)]);
  const [photo] = await db.insert(schema.media).values({ obligationId: owed.id, kind: "photo", storageKey: "frames/check.jpg", width: 810, height: 1080, authorId: asker.user.id }).returning({ id: schema.media.id });
  photoId = (photo as { id: string }).id;
  await db.update(schema.obligations).set({ mediaId: photoId }).where(eq(schema.obligations.id, owed.id));
  // The thumbnail itself, in the real bucket (there is no other one), so the door can be seen to open for the two people in it. Removed after.
  if (storageConfigured()) await putObject(thumbKey(photoId), await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 60, g: 40, b: 30 } } }).jpeg().toBuffer(), "image/jpeg");
  // One the asker settled an hour ago, for "Just happened" (4.7): the moment is the app's clock, the reason the chain's.
  await db.insert(schema.obligations).values({ ...row(friend, asker, 1500n, true, "Cab home", 2), closedAt: new Date(Date.now() - 3_600_000) });
  // A settled question both were in that minted one obligation the asker is owed: closable from its story (6.3).
  const d2draft = await ask("Did the kettle get descaled?");
  const d2 = await markets.openMarket(d2draft.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(d2draft)));
  await markets.enterMarket({ dareId: d2.id, userId: asker.user.id, stake: 600n, value: 8000n, signature: await asker.ledger.signTypedData(markets.enterTypedData(d2, 600n, 8000n)) });
  await markets.enterMarket({ dareId: d2.id, userId: friend.user.id, stake: 600n, value: 3000n, signature: await friend.ledger.signTypedData(markets.enterTypedData(d2, 600n, 3000n)) });
  // Resolved a minute ago, not an hour: a settled screen becomes the memory view on the next calendar day in the viewer's zone (UTC here), and an hour crossed midnight in the first hour of the day.
  await db.update(schema.dares).set({ lockedAt: new Date(Date.now() - 7_200_000), resolvedAt: new Date(Date.now() - 60_000), resolvedOutcome: 1n, resolvedBy: "quorum" }).where(eq(schema.dares.id, d2.id));
  settledMarketId = d2.id;
  const minted = { ...row(friend, asker, 600n, true, null, 1), origin: "dare", originId: d2.id };
  mintedId = minted.id;
  await db.insert(schema.obligations).values(minted);

  // Number questions (docs/design.md 3.26): one on a scale the asker set with the asker in at 14 shirts; one on a scale the
  // model set; one blind with the asker in; and one answered at 14, where the friend said 12.
  const number = async (title: string, scale: { range: bigint; source: "asker" | "ai" }, revealMode: "open" | "blind" = "open", typical: bigint | null = null) =>
    markets.draftMarket({ creatorId: asker.user.id, groupId: mg.id, denomId: usd.id, title, termsText: "Gabe puts on shirts one over another until he stops or one tears. The count is what is on him then.", resolvesBy: new Date(Date.now() + 86_400_000), kind: "numeric", unit: { singular: "shirt", plural: "shirts" }, scale, revealMode, typical });
  const enterNumber = async (d: markets.DareRow, who: Signer, stake: bigint, value: bigint) => markets.enterMarket({ dareId: d.id, userId: who.user.id, stake, value, signature: await who.ledger.signTypedData(markets.enterTypedData(d, stake, value)) });
  const draftN = await number("How many shirts can Gabe wear at once?", { range: 20n, source: "asker" });
  const n = await markets.openMarket(draftN.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(draftN)));
  await enterNumber(n, asker, 500n, 14n);
  numberId = n.id;
  // The model's scale (30, hidden) and its most likely answer (37, hidden): the far-off check's reference.
  const draftAi = await number("How many minutes late is Theo?", { range: 30n, source: "ai" }, "open", 37n);
  const ai = await markets.openMarket(draftAi.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(draftAi)));
  // The asker is in every question they asked, so nothing with a clock waits on them (the Now test's "a draft can sit").
  await enterNumber(ai, asker, 500n, 20n);
  aiScaleId = ai.id;
  const draftBlind = await number("How many people turn up?", { range: 40n, source: "asker" }, "blind");
  const blind = await markets.openMarket(draftBlind.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(draftBlind)));
  await enterNumber(blind, asker, 500n, 22n);
  blindNumberId = blind.id;
  const draftDone = await number("How many shirts did Gabe wear?", { range: 20n, source: "asker" });
  const done = await markets.openMarket(draftDone.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(draftDone)));
  await enterNumber(done, asker, 500n, 14n);
  await enterNumber(done, friend, 500n, 12n);
  await db.update(schema.dares).set({ lockedAt: new Date(Date.now() - 7_200_000), resolvedAt: new Date(Date.now() - 60_000), resolvedOutcome: 14n, resolvedBy: "quorum" }).where(eq(schema.dares.id, done.id));
  await db.update(schema.darePositions).set({ score: 10000 }).where(and(eq(schema.darePositions.dareId, done.id), eq(schema.darePositions.userId, asker.user.id)));
  await db.update(schema.darePositions).set({ score: 9000 }).where(and(eq(schema.darePositions.dareId, done.id), eq(schema.darePositions.userId, friend.user.id)));
  answeredId = done.id;

  // The memory it leaves (docs/marks-and-memories.md): two photos on the answered question, the asker's first, then the friend's
  // three weeks on; and a screenshot attached to it while it was being called, which is evidence and never the frame's.
  const tiny = async () => sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 60, g: 40, b: 30 } } }).jpeg().toBuffer();
  const mem = async (authorId: string, minutesAgo: number) => {
    const [row] = await db.insert(schema.media).values({ dareId: done.id, kind: "photo", role: "memory", storageKey: "frames/check.jpg", width: 810, height: 1080, authorId, createdAt: new Date(Date.now() - minutesAgo * 60_000) }).returning({ id: schema.media.id });
    return (row as { id: string }).id;
  };
  memoryIds = [await mem(asker.user.id, 50), await mem(friend.user.id, 5)];
  evidenceOnSettledId = ((await db.insert(schema.media).values({ dareId: done.id, kind: "photo", role: "evidence", storageKey: "frames/check.jpg", width: 800, height: 500, authorId: asker.user.id, createdAt: new Date(Date.now() - 90 * 60_000) }).returning({ id: schema.media.id }))[0] as { id: string }).id;
  if (storageConfigured()) for (const id of memoryIds) { await putObject(thumbKey(id), await tiny(), "image/jpeg"); bucketKeys.push(thumbKey(id)); }

  // A question being called with a screenshot attached by the claimant, the app's read of it written, and the claimant's vote in.
  const evDraft = await ask("Did the kettle boil dry?");
  const ev = await markets.openMarket(evDraft.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(evDraft)));
  await markets.enterMarket({ dareId: ev.id, userId: asker.user.id, stake: 600n, value: 8000n, signature: await asker.ledger.signTypedData(markets.enterTypedData(ev, 600n, 8000n)) });
  await markets.enterMarket({ dareId: ev.id, userId: friend.user.id, stake: 600n, value: 3000n, signature: await friend.ledger.signTypedData(markets.enterTypedData(ev, 600n, 3000n)) });
  await db.update(schema.dares).set({ lockedAt: new Date(Date.now() - 600_000), aiOutcome: 1n, aiConfidenceBps: 8000, aiRationale: "The screenshot Priya supplied shows the kettle's base scorched.", aiProposedAt: new Date(), outcomeWords: ["The kettle boiled dry", "The kettle held", "It boiled dry.", "It held."] }).where(eq(schema.dares.id, ev.id));
  await db.insert(schema.dareStatements).values({ dareId: ev.id, userId: asker.user.id, kind: "update", statement: "Scorched the base. Photo attached." });
  await db.insert(schema.dareVotes).values({ dareId: ev.id, userId: asker.user.id, outcome: 1n, signature: Buffer.alloc(65) });
  evidenceId = ((await db.insert(schema.media).values({ dareId: ev.id, kind: "photo", role: "evidence", storageKey: "frames/check.jpg", width: 800, height: 500, authorId: asker.user.id }).returning({ id: schema.media.id }))[0] as { id: string }).id;
  evidenceMarketId = ev.id;

  // A set of three for what has ended (3.37): the asker, the friend, and Nia, who is in the group and in none of these questions (frame B).
  nia = await tempSigner("Nia");
  cNia = await cookieFor(nia.user.id);
  const eg = await createGroup({ name: "Ended check", createdBy: asker.user.id });
  track.group(eg.id);
  await db.insert(schema.groupMembers).values([{ groupId: eg.id, userId: friend.user.id }, { groupId: eg.id, userId: nia.user.id }]);
  const egUsd = await ensureUsd(eg.id, asker.user.id);
  const askEnded = (title: string) => markets.draftMarket({ creatorId: asker.user.id, groupId: eg.id, denomId: egUsd.id, title, termsText: "Yes if the kettle is descaled by Friday.", resolvesBy: new Date(Date.now() + 86_400_000) });
  // Called and settled, with the claimant's clip: the resolving clip leads the frame (3.8, 4.3), in the market's own words.
  const calledDraft = await askEnded("Did the kettle boil dry on Tuesday?");
  const called = await markets.openMarket(calledDraft.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(calledDraft)));
  await markets.enterMarket({ dareId: called.id, userId: asker.user.id, stake: 600n, value: 8000n, signature: await asker.ledger.signTypedData(markets.enterTypedData(called, 600n, 8000n)) });
  await markets.enterMarket({ dareId: called.id, userId: friend.user.id, stake: 600n, value: 3000n, signature: await friend.ledger.signTypedData(markets.enterTypedData(called, 600n, 3000n)) });
  await db.insert(schema.dareVotes).values({ dareId: called.id, userId: asker.user.id, outcome: 1n, signature: Buffer.alloc(65) });
  calledClipId = ((await db.insert(schema.media).values({ dareId: called.id, kind: "photo", role: "evidence", storageKey: "frames/check.jpg", width: 800, height: 500, authorId: asker.user.id }).returning({ id: schema.media.id }))[0] as { id: string }).id;
  await db.update(schema.dares).set({ lockedAt: new Date(Date.now() - 7_200_000), resolvedAt: new Date(Date.now() - 60_000), resolvedOutcome: 1n, resolvedBy: "quorum", outcomeWords: ["The kettle boiled dry", "The kettle held", "It boiled dry.", "It held."] }).where(eq(schema.dares.id, called.id));
  await db.update(schema.darePositions).set({ score: 9600 }).where(and(eq(schema.darePositions.dareId, called.id), eq(schema.darePositions.userId, asker.user.id)));
  await db.update(schema.darePositions).set({ score: 5100 }).where(and(eq(schema.darePositions.dareId, called.id), eq(schema.darePositions.userId, friend.user.id)));
  calledId = called.id;
  // Voided: a void was still a night, so it takes photos (3.8).
  const voidDraft = await askEnded("Did anyone see the kettle at all?");
  const voided = await markets.openMarket(voidDraft.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(voidDraft)));
  await markets.enterMarket({ dareId: voided.id, userId: asker.user.id, stake: 600n, value: 8000n, signature: await asker.ledger.signTypedData(markets.enterTypedData(voided, 600n, 8000n)) });
  await markets.enterMarket({ dareId: voided.id, userId: friend.user.id, stake: 600n, value: 3000n, signature: await friend.ledger.signTypedData(markets.enterTypedData(voided, 600n, 3000n)) });
  await db.update(schema.dares).set({ lockedAt: new Date(Date.now() - 7_200_000), resolvedAt: new Date(Date.now() - 60_000), resolvedOutcome: -1n, resolvedBy: "quorum" }).where(eq(schema.dares.id, voided.id));
  voidedId = voided.id;
  // A void was still a night (3.4, 3.37): a memory on it, so its story carries the frame on a timeline.
  await db.insert(schema.media).values({ dareId: voided.id, kind: "photo", role: "memory", storageKey: "frames/check.jpg", width: 800, height: 500, authorId: asker.user.id });
  // The memory it leaves (3.37): the same screen from the second calendar day, here three days on, with one photo.
  const recallDraft = await askEnded("Did the kettle survive the week?");
  const recall = await markets.openMarket(recallDraft.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(recallDraft)));
  await markets.enterMarket({ dareId: recall.id, userId: asker.user.id, stake: 600n, value: 8000n, signature: await asker.ledger.signTypedData(markets.enterTypedData(recall, 600n, 8000n)) });
  await markets.enterMarket({ dareId: recall.id, userId: friend.user.id, stake: 600n, value: 3000n, signature: await friend.ledger.signTypedData(markets.enterTypedData(recall, 600n, 3000n)) });
  await db.update(schema.dares).set({ lockedAt: new Date(Date.now() - 3 * 86_400_000 - 7_200_000), resolvedAt: new Date(Date.now() - 3 * 86_400_000), resolvedOutcome: 1n, resolvedBy: "quorum" }).where(eq(schema.dares.id, recall.id));
  await db.insert(schema.media).values({ dareId: recall.id, kind: "photo", role: "memory", storageKey: "frames/check.jpg", width: 810, height: 1080, authorId: asker.user.id });
  memoryId = recall.id;

  // Pick-one questions (docs/design.md 3.29 to 3.31, 3.25): a set of three (the asker, the friend as a person answer, Nia), one open with the
  // asker in on John, one blind, one locked with nothing said, one being called with the asker's claim for Dev, and one settled on Dev.
  const pg = await createGroup({ name: "Pick one check", createdBy: asker.user.id });
  track.group(pg.id);
  await db.insert(schema.groupMembers).values([{ groupId: pg.id, userId: friend.user.id }, { groupId: pg.id, userId: nia.user.id }]);
  const pgUsd = await ensureUsd(pg.id, asker.user.id);
  const askPick = (title: string, revealMode: "open" | "blind" = "open") => markets.draftMarket({ creatorId: asker.user.id, groupId: pg.id, denomId: pgUsd.id, title, termsText: "Whoever is asleep first once the movie starts. If everyone makes it, Nobody.", resolvesBy: new Date(Date.now() + 86_400_000), kind: "categorical", revealMode, answers: [{ text: "John" }, { text: "Dev", userId: friend.user.id }, { text: "Nobody" }] });
  const enterPick = async (d: markets.DareRow, who: Signer, stake: bigint, pick: bigint) => markets.enterMarket({ dareId: d.id, userId: who.user.id, stake, value: pick, signature: await who.ledger.signTypedData(markets.enterTypedData(d, stake, pick)) });
  const pOpen = await markets.openMarket((await askPick("Who falls asleep first?")).id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(await askPick("Who falls asleep first?"))))
    .catch(() => null);
  void pOpen;
  const pOpenDraft = await askPick("Who falls asleep first?");
  const pOpenRow = await markets.openMarket(pOpenDraft.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(pOpenDraft)));
  await enterPick(pOpenRow, asker, 500n, 0n);
  pickOpenId = pOpenRow.id;
  const pBlindDraft = await askPick("Who gets there first?", "blind");
  const pBlind = await markets.openMarket(pBlindDraft.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(pBlindDraft)));
  await enterPick(pBlind, asker, 500n, 2n);
  pickBlindId = pBlind.id;
  // Locked with nothing said, in a set of Nia and the friend: a locked question with a clock waits on everyone in its set who has not
  // called it, and the asker's Now is checked elsewhere for having nothing time-bound on it.
  const pl = await createGroup({ name: "Pick one, locked", createdBy: nia.user.id });
  track.group(pl.id);
  await db.insert(schema.groupMembers).values({ groupId: pl.id, userId: friend.user.id });
  const plUsd = await ensureUsd(pl.id, nia.user.id);
  const pLockedDraft = await markets.draftMarket({ creatorId: nia.user.id, groupId: pl.id, denomId: plUsd.id, title: "Who orders dessert?", termsText: "Whoever asks for the dessert menu first. If nobody does, Nobody.", resolvesBy: new Date(Date.now() + 86_400_000), kind: "categorical", answers: [{ text: "John" }, { text: "Dev", userId: friend.user.id }, { text: "Nobody" }] });
  const pLocked = await markets.openMarket(pLockedDraft.id, nia.user.id, await nia.ledger.signTypedData(markets.createTypedData(pLockedDraft)));
  await enterPick(pLocked, nia, 500n, 1n);
  await enterPick(pLocked, friend, 500n, 0n);
  await db.update(schema.dares).set({ lockedAt: new Date(Date.now() - 600_000) }).where(eq(schema.dares.id, pLocked.id));
  pickLockedId = pLocked.id;
  const pVotingDraft = await askPick("Who picks the movie?");
  const pVoting = await markets.openMarket(pVotingDraft.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(pVotingDraft)));
  await enterPick(pVoting, asker, 600n, 1n);
  await enterPick(pVoting, friend, 600n, 0n);
  await db.update(schema.dares).set({ lockedAt: new Date(Date.now() - 600_000), aiOutcome: 1n, aiConfidenceBps: 8000, aiRationale: "Priya says Dev picked it, and nobody has said otherwise.", aiProposedAt: new Date() }).where(eq(schema.dares.id, pVoting.id));
  await db.insert(schema.dareStatements).values({ dareId: pVoting.id, userId: asker.user.id, kind: "update", statement: "Dev had the remote the whole time." });
  await db.insert(schema.dareVotes).values({ dareId: pVoting.id, userId: asker.user.id, outcome: 1n, signature: Buffer.alloc(65) });
  pickVotingId = pVoting.id;
  const pSettledDraft = await askPick("Who fell asleep first?");
  const pSettled = await markets.openMarket(pSettledDraft.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(pSettledDraft)));
  await enterPick(pSettled, asker, 600n, 1n);
  await enterPick(pSettled, friend, 600n, 0n);
  // The friend is the first to say what happened and votes for Dev; the asker picked Dev, so the asker called it and the friend, who spoke first, did not (3.25).
  await db.insert(schema.dareStatements).values({ dareId: pSettled.id, userId: friend.user.id, kind: "update", statement: "Twenty minutes in" });
  await db.insert(schema.dareVotes).values({ dareId: pSettled.id, userId: friend.user.id, outcome: 1n, signature: Buffer.alloc(65) });
  await db.update(schema.dares).set({ lockedAt: new Date(Date.now() - 7_200_000), resolvedAt: new Date(Date.now() - 60_000), resolvedOutcome: 1n, resolvedBy: "quorum" }).where(eq(schema.dares.id, pSettled.id));
  await db.update(schema.darePositions).set({ score: 10000, net: 600n }).where(and(eq(schema.darePositions.dareId, pSettled.id), eq(schema.darePositions.userId, asker.user.id)));
  await db.update(schema.darePositions).set({ score: 0, net: -600n }).where(and(eq(schema.darePositions.dareId, pSettled.id), eq(schema.darePositions.userId, friend.user.id)));
  await db.insert(schema.obligations).values({ ...row(friend, asker, 600n, true, null, 0), groupId: pg.id, denomId: pgUsd.id, origin: "dare", originId: pSettled.id });
  pickSettledId = pSettled.id;

  // A sticker of the asker's, worn by a question in the group (docs/design.md 3.28).
  const [sticker] = await db.insert(schema.pictureMarks).values({ ownerId: asker.user.id, kind: "sticker", sourceKey: "stickers/check.png", stampKey: "stamps/check.png", width: 512, height: 512, ink: "sea" }).returning({ id: schema.pictureMarks.id });
  stickerId = (sticker as { id: string }).id;
  await db.update(schema.pictureMarks).set({ stampKey: stickerStampKey(stickerId), sourceKey: `stickers/${stickerId}.png` }).where(eq(schema.pictureMarks.id, stickerId));
  if (storageConfigured()) { await putObject(stickerStampKey(stickerId), await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 40, g: 170, b: 165, alpha: 1 } } }).png().toBuffer(), "image/png"); bucketKeys.push(stickerStampKey(stickerId)); }
  const stDraft = await markets.draftMarket({ creatorId: asker.user.id, groupId: mg.id, denomId: usd.id, title: "Does the sticker ride the band?", termsText: "Yes if it does.", resolvesBy: new Date(Date.now() + 86_400_000), mark: { kind: "sticker", id: stickerId } });
  const st = await markets.openMarket(stDraft.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(stDraft)));
  await markets.enterMarket({ dareId: st.id, userId: asker.user.id, stake: 500n, value: 7000n, signature: await asker.ledger.signTypedData(markets.enterTypedData(st, 500n, 7000n)) });
  stickerMarketId = st.id;

  // A photo taken while a question is open (docs/design.md 3.39): nia and the friend in, a third person not yet, nia's photo in the
  // bucket, and nobody else's to see until it ends. A set of three, so everyone is not in and nobody's Now lights a lock.
  rae = await tempSigner("Rae");
  const wg = await createGroup({ name: "Open window (check)", createdBy: nia.user.id });
  track.group(wg.id);
  await db.insert(schema.groupMembers).values([{ groupId: wg.id, userId: friend.user.id }, { groupId: wg.id, userId: rae.user.id }]);
  const wUsd = await ensureUsd(wg.id, nia.user.id);
  const wDraft = await markets.draftMarket({ creatorId: nia.user.id, groupId: wg.id, denomId: wUsd.id, title: "Does the pizza come before the second act?", termsText: "Yes if the pizza is on the table before the second act starts.", resolvesBy: new Date(Date.now() + 86_400_000) });
  const w = await markets.openMarket(wDraft.id, nia.user.id, await nia.ledger.signTypedData(markets.createTypedData(wDraft)));
  await markets.enterMarket({ dareId: w.id, userId: nia.user.id, stake: 500n, value: 8000n, signature: await nia.ledger.signTypedData(markets.enterTypedData(w, 500n, 8000n)) });
  await markets.enterMarket({ dareId: w.id, userId: friend.user.id, stake: 500n, value: 3000n, signature: await friend.ledger.signTypedData(markets.enterTypedData(w, 500n, 3000n)) });
  windowId = w.id;
  windowPhotoId = ((await db.insert(schema.media).values({ dareId: w.id, kind: "photo", role: "memory", storageKey: "frames/check.jpg", width: 810, height: 1080, authorId: nia.user.id }).returning({ id: schema.media.id }))[0] as { id: string }).id;
  if (storageConfigured()) { await putObject(thumbKey(windowPhotoId), await tiny(), "image/jpeg"); bucketKeys.push(thumbKey(windowPhotoId)); }

  // What's on (docs/design.md 3.33, 3.35): a game from the recorded scoreboard, its ids this test's own, and four questions from it:
  // who wins with the asker in, the margin with the asker in, who wins locked with the final score proposing, and one the final score settled.
  const scoreboard = JSON.parse(readFileSync(new URL("../fixtures/sports/espn-nfl-scheduled.json", import.meta.url), "utf8")) as unknown;
  // This run's games carry one prefix, registered so cleanup takes them and no other run's (tests/db/fixture.ts).
  const gamePrefix = track.gamePrefix(`test:pages:${randomUUID().slice(0, 8)}:`);
  const feedGame = parseScoreboard("nfl", scoreboard).slice(0, 1).map((g) => ({ ...g, sourceId: `${gamePrefix}${g.sourceId}`, startsAt: new Date(Date.now() + 5 * 86_400_000) }));
  await syncSchedule("nfl", new Date(), { name: "espn", listGames: async () => feedGame });
  const [gameRow] = await db.select().from(schema.sportsGames).where(eq(schema.sportsGames.sourceId, feedGame[0]!.sourceId));
  feedGameId = (gameRow as { id: string }).id;
  feedGroupId = mg.id;
  const templates = await db.select().from(schema.publicQuestions).where(eq(schema.publicQuestions.gameId, (gameRow as { id: string }).id));
  const tpl = (key: string) => templates.find((t) => t.key === key) as { id: string; shift: bigint | null };
  feedHome = feedGame[0]!.home.short;
  feedAway = feedGame[0]!.away.short;
  feedHomeAbbr = feedGame[0]!.home.abbr;
  feedAwayAbbr = feedGame[0]!.away.abbr;
  const fromTemplate = async (key: string, by: Signer = asker, inGroup: string = mg.id, denom: string = usd.id) => {
    const d0 = await markets.draftFromTemplate({ templateId: tpl(key).id, creatorId: by.user.id, groupId: inGroup, denomId: denom });
    return markets.openMarket(d0.id, by.user.id, await by.ledger.signTypedData(markets.createTypedData(d0)));
  };
  const fo = await fromTemplate("home_wins");
  await markets.enterMarket({ dareId: fo.id, userId: asker.user.id, stake: 500n, value: 7000n, signature: await asker.ledger.signTypedData(markets.enterTypedData(fo, 500n, 7000n)) });
  feedOpenId = fo.id;
  const fm = await fromTemplate("margin");
  const stored = 3n + (tpl("margin").shift ?? 0n);
  await markets.enterMarket({ dareId: fm.id, userId: asker.user.id, stake: 500n, value: stored, signature: await asker.ledger.signTypedData(markets.enterTypedData(fm, 500n, stored)) });
  feedMarginId = fm.id;
  // The ballot and the settled screen live in a set of nia and rae, so no older Now row moves.
  cRae = await cookieFor(rae.user.id);
  const fg = await createGroup({ name: "From the final score (check)", createdBy: nia.user.id });
  track.group(fg.id);
  await db.insert(schema.groupMembers).values({ groupId: fg.id, userId: rae.user.id });
  const fgUsd = await ensureUsd(fg.id, nia.user.id);
  const fv = await fromTemplate("home_wins", nia, fg.id, fgUsd.id);
  await markets.enterMarket({ dareId: fv.id, userId: nia.user.id, stake: 500n, value: 7000n, signature: await nia.ledger.signTypedData(markets.enterTypedData(fv, 500n, 7000n)) });
  await markets.enterMarket({ dareId: fv.id, userId: rae.user.id, stake: 500n, value: 4000n, signature: await rae.ledger.signTypedData(markets.enterTypedData(fv, 500n, 4000n)) });
  await db.update(schema.dares).set({ lockedAt: new Date(Date.now() - 4 * 3_600_000), resolvesBy: new Date(Date.now() - 4 * 3_600_000), feedOutcome: 1n, feedOutcomeAt: new Date(Date.now() - 60_000) }).where(eq(schema.dares.id, fv.id));
  await db.update(schema.sportsGames).set({ status: "final", completed: true, homeScore: 24, awayScore: 17, finalSeenAt: new Date(Date.now() - 20 * 60_000), expectedEndAt: new Date(Date.now() - 60 * 60_000) }).where(eq(schema.sportsGames.id, (gameRow as { id: string }).id));
  feedVotingId = fv.id;
  const fs = await fromTemplate("home_wins", nia, fg.id, fgUsd.id);
  await markets.enterMarket({ dareId: fs.id, userId: nia.user.id, stake: 500n, value: 7000n, signature: await nia.ledger.signTypedData(markets.enterTypedData(fs, 500n, 7000n)) });
  await markets.enterMarket({ dareId: fs.id, userId: rae.user.id, stake: 500n, value: 4000n, signature: await rae.ledger.signTypedData(markets.enterTypedData(fs, 500n, 4000n)) });
  await db.update(schema.dares).set({ lockedAt: new Date(Date.now() - 30 * 3_600_000), resolvesBy: new Date(Date.now() - 30 * 3_600_000), resolvedAt: new Date(Date.now() - 60_000), resolvedOutcome: 1n, resolvedBy: "feed", feedEnding: "agreed", rulingText: `${FEED_RULING} ${feedHome} 24, ${feedAway} 17.`, rulingHash: Buffer.alloc(32, 1) }).where(eq(schema.dares.id, fs.id));
  feedSettledId = fs.id;
  // A game that is over (3.37, the night): a second recorded game, started thirty hours ago and complete, with two questions the final score settled in nia and rae's set.
  // Drafted while the game was ahead (a template refuses a kickoff that has passed), then the game and its questions moved back in time.
  const nightGame = parseScoreboard("nfl", scoreboard).slice(1, 2).map((g) => ({ ...g, sourceId: `${gamePrefix}${g.sourceId}`, startsAt: new Date(Date.now() + 2 * 3_600_000) }));
  await syncSchedule("nfl", new Date(), { name: "espn", listGames: async () => nightGame });
  const [nightRow] = await db.select().from(schema.sportsGames).where(eq(schema.sportsGames.sourceId, nightGame[0]!.sourceId));
  nightGameId = (nightRow as { id: string }).id;
  nightGroupId = fg.id;
  const nightTemplates = await db.select().from(schema.publicQuestions).where(eq(schema.publicQuestions.gameId, nightGameId));
  for (const key of ["home_wins", "total"] as const) {
    const t = nightTemplates.find((x) => x.key === key) as { id: string };
    const d0 = await markets.draftFromTemplate({ templateId: t.id, creatorId: nia.user.id, groupId: fg.id, denomId: fgUsd.id });
    const d = await markets.openMarket(d0.id, nia.user.id, await nia.ledger.signTypedData(markets.createTypedData(d0)));
    const [a, b] = key === "home_wins" ? [7000n, 4000n] : [44n, 38n];
    await markets.enterMarket({ dareId: d.id, userId: nia.user.id, stake: 500n, value: a, signature: await nia.ledger.signTypedData(markets.enterTypedData(d, 500n, a)) });
    await markets.enterMarket({ dareId: d.id, userId: rae.user.id, stake: 500n, value: b, signature: await rae.ledger.signTypedData(markets.enterTypedData(d, 500n, b)) });
    await db.update(schema.dares).set({ lockedAt: new Date(Date.now() - 30 * 3_600_000), resolvesBy: new Date(Date.now() - 30 * 3_600_000), resolvedAt: new Date(Date.now() - 120_000), resolvedOutcome: key === "home_wins" ? 1n : 41n, resolvedBy: "feed", feedEnding: "agreed", rulingText: `${FEED_RULING} ${nightGame[0]!.home.short} 24, ${nightGame[0]!.away.short} 17.`, rulingHash: Buffer.alloc(32, 1) }).where(eq(schema.dares.id, d.id));
    // Scored as the chain would have: nia closer on both.
    await db.update(schema.darePositions).set({ score: 9100, net: 0n }).where(and(eq(schema.darePositions.dareId, d.id), eq(schema.darePositions.userId, nia.user.id)));
    await db.update(schema.darePositions).set({ score: 6400, net: 0n }).where(and(eq(schema.darePositions.dareId, d.id), eq(schema.darePositions.userId, rae.user.id)));
  }
  await db.update(schema.sportsGames).set({ startsAt: new Date(Date.now() - 30 * 3_600_000), status: "final", completed: true, homeScore: 24, awayScore: 17, finalSeenAt: new Date(Date.now() - 26 * 3_600_000), finalConfirmedAt: new Date(Date.now() - 25 * 3_600_000), expectedEndAt: new Date(Date.now() - 27 * 3_600_000) }).where(eq(schema.sportsGames.id, nightGameId));
});
after(async () => {
  if (storageConfigured()) await removeObjects([...(photoId ? [thumbKey(photoId)] : []), ...bucketKeys]);
  await cleanup();
});

// ------------------------------------------------------------------------------ the claim link, signed out

test("the claim landing page says who the sender thinks you are and what they covered", async () => {
  const r = await get(`/c/${linkToken}`);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes("Alex Rivera thinks you’re"), "who");
  assert.ok(r.text.includes("Alex Rivera got these."), "headline");
  assert.ok(r.text.includes("Dinner at Sal’s") && r.text.includes("Cab home"), "memos");
});

test("it offers that's-me and sign-in, and nothing that acts before someone says who they are", async () => {
  const r = await get(`/c/${linkToken}`);
  assert.ok(r.text.includes("That’s me"));
  assert.ok(r.text.includes("I already have an account"));
  assert.ok(!r.text.includes("Fine, you got me"));
  assert.ok(r.text.includes("Nothing counts until you say so"));
  assert.ok(!r.text.includes("Tap to confirm"));
});

test("opening a claim link sets no cookie and issues no token", async () => {
  const r = await get(`/c/${linkToken}`);
  assert.equal(r.status, 200);
  assert.equal(r.setCookie, null);
  await get(`/c/${linkToken}/opengraph-image`);
  assert.equal((await db.select().from(schema.claimTokens).where(eq(schema.claimTokens.claimId, gabe))).length, 0);
});

// `next dev` always points a generated card at localhost whatever `metadataBase` says, so this can only be
// checked against a deployed app (TEST_BASE_URL=https://dareful.app). It is skipped locally rather than
// asserted in a form that could not fail, and no local mutant covers it.
test("on a deployed app, the preview image is on the app's own origin", { skip: /\/\/(localhost|127\.)/.test(BASE) }, async () => {
  const r = await get(`/c/${linkToken}`);
  // A plain message, not assert.equal: its character diff of two URLs prints as one spliced string
  // ("locdarefulhost") in a terminal, which reads like a bug in the app rather than a wrong value.
  const actual = new URL(meta(r.html, "og:image") ?? "").origin;
  const expected = new URL(BASE).origin;
  assert.ok(actual === expected, `og:image is served from ${actual}; expected ${expected}. NEXT_PUBLIC_APP_URL was wrong when this deployment was built.`);
});

test("the claim preview names the sender by first name only", async () => {
  const r = await get(`/c/${linkToken}`);
  assert.equal(meta(r.html, "og:title"), "Alex got this one");
  // The image metas carry a build hash in their query string, which can spell any digits: the words are checked in the text metas alone.
  const head = r.dom.slice(0, r.dom.indexOf("</head>")).replace(/<meta [^>]*(?:og:image|twitter:image)[^>]*>/g, "");
  for (const s of ["Rivera", "Sal", "47", "Cab", "Gabe"]) assert.ok(!new RegExp(`content="[^"]*${s}`).test(head), `the preview leaks "${s}"`);
});

test("a malformed link and an unknown well-formed link read exactly the same", async () => {
  const bad = await get("/c/not-a-real-token");
  const unknown = await get(`/c/${"A".repeat(43)}`);
  assert.equal(bad.status, 200);
  assert.ok(bad.text.includes("That link has expired"));
  assert.equal(unknown.text, bad.text);
  assert.equal(meta(unknown.html, "og:title"), "Dareful");
});

// ------------------------------------------------------------------------------------------------- cards

test("the claim card and the cover card are PNGs, and differ from the plain card", async () => {
  const plain = await get(`/c/${"A".repeat(43)}/opengraph-image`);
  assert.equal(plain.type, "image/png");
  for (const path of [`/c/${linkToken}/opengraph-image`, `/o/${boundId}/opengraph-image`]) {
    const r = await get(path);
    assert.equal(r.status, 200, path);
    assert.equal(r.type, "image/png", path);
    assert.ok(r.bytes.length > 5000, path);
    assert.ok(!r.bytes.equals(plain.bytes), `${path} is the plain card`);
  }
});

test("dead links of every kind get byte-identical plain cards", async () => {
  const plain = await get(`/c/${"A".repeat(43)}/opengraph-image`);
  for (const path of ["/c/junk/opengraph-image", "/o/00000000-0000-4000-8000-000000000000/opengraph-image", "/o/junk/opengraph-image"]) {
    const r = await get(path);
    assert.equal(r.type, "image/png", path);
    assert.ok(r.bytes.equals(plain.bytes), `${path} differs from the plain card`);
  }
});

// ------------------------------------------------------------------------------ the cover link, signed out

test("a shared cover answers a preview bot with a card: first name, and nothing about what or how much", async () => {
  const r = await get(`/o/${boundId}`);
  assert.equal(r.status, 200);
  assert.equal(meta(r.html, "og:title"), "Alex got this one");
  assert.match(meta(r.html, "og:image") ?? "", /^https?:\/\/.*\/o\/.*opengraph-image/);
  assert.ok(r.text.includes("Alex got this one."));
  // The whole response, scripts and serialized props included: a value that is not rendered can still be sent.
  for (const s of ["Rivera", "Concert", "65.00", "6500", "Nico"]) assert.ok(!r.html.includes(s), `the signed-out page leaks "${s}"`);
});

test("an unknown cover link, signed out, says nothing and looks like the plain brand", async () => {
  const r = await get("/o/00000000-0000-4000-8000-000000000000");
  assert.equal(r.status, 200);
  assert.equal(meta(r.html, "og:title"), "Dareful");
  assert.ok(!r.text.includes("got this one"));
});

test("a cover is shown in full only to the two people in it", async () => {
  const mine = await get(`/o/${boundId}`, cU);
  assert.equal(mine.status, 200);
  assert.ok(mine.text.includes("Concert tickets") && mine.text.includes("$65.00"));
  assert.equal((await get(`/o/${boundId}`, cB)).status, 404);
});

test("a cover against someone not here yet is visible to the person who logged it, and to nobody else", async () => {
  const mine = await get(`/o/${ghostCoverId}`, cA);
  assert.equal(mine.status, 200);
  assert.ok(mine.text.includes("You got this one.") && mine.text.includes("Waiting for Gabe."));
  assert.equal((await get(`/o/${ghostCoverId}`, cB)).status, 404);
});

// ----------------------------------------------------------------------- the creator and everyone else

test("the creator sees their ghost's page, with the link and the way to let them go", async () => {
  const r = await get(`/p/c/${gabe}`, cA);
  assert.equal(r.status, 200);
  for (const s of ["Gabe", "not here yet", "Make a link for Gabe", "Let them go"]) assert.ok(r.text.includes(s), s);
});

test("someone else gets a 404 for that ghost, and a signed-out visitor is sent home", async () => {
  assert.equal((await get(`/p/c/${gabe}`, cB)).status, 404);
  const out = await get(`/p/c/${gabe}`);
  assert.ok(out.status === 307 || out.status === 302);
  assert.equal(out.loc, "/");
});

test("the creator opening their own link is told it does nothing for them", async () => {
  const r = await get(`/c/${linkToken}`, cA);
  assert.ok(r.text.includes("This is the link you made for Gabe"));
  assert.ok(!r.text.includes("That’s me"));
});

test("a signed-in friend gets one explicit tap, not a silent bind", async () => {
  const r = await get(`/c/${linkToken}`, cB);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes("That’s me") && r.text.includes("Nothing happens unless you tap"));
  assert.equal((await claims.claimById(gabe))?.claimedBy, null);
});

test("the people tab lists the ghost among people, and the old full-page cover form is gone", async () => {
  const people = await get("/people", cA);
  assert.ok(people.text.includes("Gabe") && people.text.includes("not here yet"));
  assert.ok(!(await get("/", cA)).text.includes("not here yet"), "people are a root of their own, not a section of Now (design 4.7)");
  // The cover is logged from the person it is with (3.43); the full-page form nothing linked to is gone (Round C), and its address is the code screen (5.4).
  const gone = await get("/new", cA);
  assert.ok(gone.html.includes('data-dead-link=""') && !gone.text.includes("+ someone new"), "the old cover form's address is nothing");
});

test("a cover started from a person's page is for that person, with nothing to pick; the share text is the question alone", async () => {
  const m = await get(`/m/${marketId}`, cAsker);
  assert.ok(!m.html.includes("Put your number on it"), "the question stands alone in the chat");
  assert.ok(!(await get("/", cAsker)).html.includes("I got this one"), "the cover left the Start sheet");
  // "I got this one" rests at the foot of the person's page and raises into the cover (3.43): nothing links out to a form.
  const page = await get(`/p/${B.id}`, cA);
  assert.ok(page.html.includes('data-cover-open=""') && page.text.includes("I got this one") && !page.html.includes("/new?for="), "the chalk at the foot of the person view, raising into the cover");
  assert.ok(page.html.includes('data-cover-sheet=""') && page.text.includes("Who picks up next") && page.text.includes("Nobody’s paying it back"), "the raised sheet: what, how many, who picks up next");
  // The memo and the private cost (Principle 4; the owner's ruling of 2026-09-27): optional, below the choices, no example text in the field (4.9).
  const notes = page.dom.split('data-cover-notes=""')[1]?.split('data-cover-submit=""')[0] ?? "";
  assert.ok(page.dom.indexOf('data-cover-notes=""') > page.dom.indexOf("Who picks up next") && notes.includes('data-cover-memo=""') && notes.includes("What was it"), "what it was, under who picks up next and above the primary");
  assert.ok(!/placeholder=/.test(notes), "no example text in the fields");
  const ghostPage = await get(`/p/c/${gabe}`, cA);
  assert.ok(ghostPage.html.includes('data-cover-open=""') && !ghostPage.html.includes("/new?for="), "a ghost's page too");
});

// ------------------------------------------------------------------------- the claimant's first screen

test("the first screen groups what was waiting by who it is with, and offers one yes for all", async () => {
  const r = await get("/welcome", cU);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes("Alex Rivera") && r.text.includes("Cy"), "one group per person, named");
  // The claimant screen as drawn (3.38, Round C part 2): the headline counts the stories, one group per person with its count, claim rows with a check pressed by default and labelled "Confirm: Priya's got you", the chalk counting the pressed rows.
  assert.ok(r.text.includes("You were already in 3 stories.") && /kept under your name, /.test(r.text), "the headline and the line");
  assert.equal((r.html.match(/data-claim-group="/g) ?? []).length, 2, "one group per person");
  assert.equal((r.html.match(/data-claim-row="/g) ?? []).length, 3, "a row per cover");
  // Round D, the owner's correction: a cover someone recorded against this person starts unpressed, and the chalk waits for a deliberate yep.
  assert.equal((r.html.match(/role="checkbox" aria-checked="false" aria-label="Confirm: [^"]+ got you"/g) ?? []).length, 3, "every row's check, unpressed until this person presses it, named for the tap");
  assert.equal((r.html.match(/role="checkbox" aria-checked="true"/g) ?? []).length, 0, "nothing pressed for them");
  for (const s of ["Concert tickets", "Brunch", "Parking", "Yep, these are right", "Covered · "]) assert.ok(r.text.includes(s), s);
  assert.ok(!r.text.includes("Here’s what was waiting") && !r.text.includes("With "), "the old lines are gone");
});

test("home carries what arrived by binding as yep rows and no strip, and someone with nothing waiting is sent home instead of an empty inbox", async () => {
  // Nothing sits above Needs you (4.7, Round C): what arrived by binding is a yep row like any cover to confirm.
  const bound = await get("/", cU);
  assert.ok(bound.text.includes("Needs you") && bound.text.includes("Yep") && !bound.text.includes("waiting for you"), "the yep rows, and no strip");
  const quiet = await get("/", cAsker);
  assert.ok(quiet.text.includes("Needs you") && !quiet.text.includes("waiting for you"));
  const r = await get("/welcome", cB);
  assert.ok(r.status === 307 || r.status === 302);
  assert.equal(r.loc, "/");
});

// -------------------------------------------------------------------------------------------- questions

test("a shared question answers a preview bot with the question, and nothing about who is in or at what", async () => {
  const r = await get(`/m/${marketId}`);
  assert.equal(r.status, 200);
  assert.equal(meta(r.html, "og:title"), "Does the kettle get descaled by Friday?");
  assert.ok(r.text.includes("Does the kettle get descaled by Friday?"));
  // Arriving from a link with no account (docs/design.md 3.17): who asked, by first name, the set's name, a count in words, and the
  // line untouched; never the asker's full name, anyone else's, a number, what is riding, or the terms.
  assert.ok(r.text.includes("Priya asked the Question check"), "who asked, by first name, and which set, as a sentence names it (3.17: Priya asked the Friday crew)");
  assert.ok(r.text.includes("One friend is in"), "the count in words");
  assert.ok(r.text.includes("Slide to your prediction") && /I’m in at 50%/.test(r.text), "the way in, without an account: the thumb at 50% under the prompt (3.13 as amended 2026-10-04)");
  // Distinctive spellings: a bare "83" turns up in script file names, and "$17" is how the page's own serialization writes a reference.
  for (const s of ["Raman", "83%", "8300", "17.00", "Kettles rarely", "kettle is descaled", "Dev"]) assert.ok(!r.html.includes(s), `the signed-out page leaks "${s}"`);
  const card = await get(`/m/${marketId}/opengraph-image`);
  const plain = await get(`/m/00000000-0000-4000-8000-000000000000/opengraph-image`);
  assert.equal(card.type, "image/png");
  assert.ok(!card.bytes.equals(plain.bytes));
});

test("a draft is a 404 to everyone but the person who asked it, and its preview says nothing", async () => {
  const draft = await get(`/m/${draftId}`, cAsker);
  assert.equal(draft.status, 200);
  // The draft's band (3.25): a dashed edge, "Not sent yet" after the dotted ring, and no paragraph explaining it (4.9).
  assert.ok(draft.html.includes('data-band-state="draft"') && draft.text.includes("Not sent yet") && /outline-dashed/.test(draft.html), "the draft's band says it");
  assert.ok(!draft.text.includes("Only you can see this so far") && !draft.text.includes("Put your own number"), "the paragraph is gone");
  assert.equal((await get(`/m/${draftId}`, cFriend)).status, 404);
  const out = await get(`/m/${draftId}`);
  assert.equal(meta(out.html, "og:title"), "Dareful");
  assert.ok(!out.html.includes("still a secret"));
});

test("someone in the group who has not picked sees who is in and no number; someone outside sees neither", async () => {
  const mine = await get(`/m/${marketId}`, cFriend);
  assert.equal(mine.status, 200);
  // Before you're in (3.38, the eleventh session): who is in, in words, and that where they landed shows once you are; no icons, since sharing belongs to people who are in (3.42).
  assert.ok(mine.text.includes("One friend is in. Where they landed shows once you are."), "the count");
  assert.ok(!mine.text.includes("shows once you pick") && !mine.html.includes('data-whos-in=""'), "no old caption, and no row with icons before you're in");
  // Sent, not merely shown: the page's data travels in the HTML, so a number hidden by a component is still leaked.
  for (const s of ["83%", "You’re in at", "8300", "\"stake\":\"1700\"", "buckets"]) assert.ok(!mine.html.includes(s), `someone who has not picked is sent "${s}"`);
  // The asker is in: the receipt is on the screen every time it opens, not for a second after the tap.
  const asked = await get(`/m/${marketId}`, cAsker);
  assert.ok(asked.text.includes("You’re in at 83%"), "the receipt");
  assert.ok(asked.text.includes("yours to change until"), "the caption");
  assert.ok(asked.text.includes("Where the stake sits"), "the weight line's heading");
  const outside = await get(`/m/${marketId}`, cStranger);
  assert.equal(outside.status, 200);
  // The invitation (docs/design.md 3.17): what it is and who asked, by first name, and nothing it could cost.
  assert.ok(outside.text.includes("Priya invited you"), "who asked, by first name");
  assert.ok(outside.text.includes("One friend is in"), "the count in words");
  assert.ok(outside.text.includes("Join as"), "the way in");
  for (const s of ["Priya Raman", "Raman", "83%", "8300", "17.00", "Kettles rarely", "kettle is descaled", "1 of 2 in"]) assert.ok(!outside.html.includes(s), `someone outside the group is sent "${s}"`);
});

test("the terms and the stalemate rule are on the screen before anyone is in", async () => {
  const r = await get(`/m/${marketId}`, cFriend);
  assert.ok(r.text.includes("Yes if the kettle is descaled by Friday."));
  // The tiebreaker is one of the four facts in the details (3.25); the consent sentence lives on the invitation.
  // The tiebreaker is credited to the agreement, never to the app (docs/decisions.md 2026-09-25).
  assert.ok(r.text.includes("If it’s unclear") && r.text.includes("Everyone says their piece and the tiebreaker everyone agreed to calls it."));
});

// ------------------------------------------------------------------------------------------ 2B: home, joining

async function send(path: string, method: string, body: unknown, cookie?: string): Promise<{ status: number }> {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie: `dareful_session=${cookie}` } : {}) }, body: JSON.stringify(body) });
  return { status: r.status };
}

test("Now holds what needs this person, then what is running, then what just happened, and nothing that starts something", async () => {
  const r = await get("/", cFriend);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes("Needs you"), "the heading");
  assert.ok(r.text.includes("Does the kettle get descaled by Friday?"), "the question the friend has not entered");
  assert.ok(/1 of 2 in/.test(r.text), "how many are in, on the row");
  assert.ok(r.text.includes("Enter"), "the verb");
  // Creating things lives behind Start (design 6.1): nothing on Now asks, joins or logs, and the one chalk control is the button.
  assert.ok(!r.text.includes("Ask something") && !r.text.includes("I got this one"), "Now starts nothing itself");
  const start = /<a[^>]*aria-label="Ask something"[^>]*>/.exec(r.html)?.[0] ?? "";
  assert.ok(start.includes('href="/m/new"'), "the Start button only asks: a link to the question step (6.1), no sheet");
  assert.ok(!/focus-visible:(outline-none|ring)/.test(start), "Start takes the global focus outline, 2px outside its edge (5.1), not a ring flush with it");
  assert.ok(!r.text.includes("Measure the screen") && !/data-probe/.test(r.html), "no instrument on Now: the band's cause is settled, and the probe left with it (3.34, amended 2026-09-29)");
  // "Got a code?" at Now's top right, placed as the question step places it (6.1, amended 2026-09-27): joining by code is one tap from home.
  const codeLink = /<a[^>]*data-got-a-code=""[^>]*>/.exec(r.html)?.[0] ?? "";
  assert.ok(codeLink.includes('href="/join"') && r.text.includes("Got a code?"), "the code link on Now");
  // Nothing on Now counts or ages (3.15): no badge on the heading, no days waiting.
  assert.ok(!/Needs you\s*\(?\d/.test(r.text) && !/waiting \d|\d+ days/.test(r.text));
  // The dot on Now means something with a clock is waiting (6.4): a question to get into has one; a draft to finish does not.
  assert.equal((r.html.match(/data-soonest=""/g) ?? []).length, 1, "one citron dot per viewport, on the soonest row with a clock (3.15, 4.5)");
  assert.ok(!/bg-live/.test(/<nav aria-label="Main"[\s\S]*?<\/nav>/.exec(r.html)?.[0] ?? ""), "nothing on the tab bar: no dot, no badge (the owner's ruling, Round C)");
  assert.ok(!r.html.includes("waiting for you") && !r.text.includes("Is this you?") || r.html.includes('data-claim-need='), "no section above or between the three (4.7)");
  // The asker has a draft to finish and a question they are in: needs first, then running, and the running row has no verb.
  const a = await get("/", cAsker);
  const needs = a.text.indexOf("Needs you");
  const running = a.text.indexOf("Running");
  assert.ok(needs >= 0 && running > needs, `needs you, then running: ${needs}, ${running}`);
  assert.ok(/Running.*Does the kettle get descaled by Friday\?.*You’re in at \d+% · just you so far/.test(a.text), "your entry and how many are in, on the row (3.15)");
  assert.ok(!/Running[\s\S]*?closes tonight/.test(a.text.slice(a.text.indexOf("Running"), a.text.indexOf("Running") + 400)), "no open clock on a running row");
  assert.ok(/<svg role="img" aria-label="You’re in"/.test(a.html), "the running row's mark says you're in (3.23)");
  // The action lives on the question's screen, never on a running row (design 4.7): no verb anywhere under Running.
  assert.equal(/\b(Enter|Vote|Yep|Finish|Close|Lock)\b/.exec(a.text.slice(running))?.[0], undefined, "a verb on a running row");
  assert.ok(!a.html.includes('data-soonest=""'), "a draft can sit: no dot");
  // A settlement told it was on its way and dropped wears the didn't-go-through mark with "Try again" (5.2); one still going through is in Just happened, on its way.
  const plant = async (status: "dropped" | "pending") => {
    const hash = randomBytes(32);
    await db.insert(schema.chainWrites).values({ hash, raw: randomBytes(64), label: "test close", kind: "close", subject: JSON.stringify({ obligationId: owedId, reason: "settled" }), nonce: 7, status, actorId: asker.user.id, toldAt: new Date(), createdAt: new Date(Date.now() - 120_000), updatedAt: new Date() });
    return hash;
  };
  const dropped = await plant("dropped");
  try {
    const failed = await get("/", cAsker);
    assert.ok(/aria-label="Didn’t go through"/.test(failed.html) && /Didn’t go through/.test(failed.text) && /Try again/.test(failed.text) && failed.text.includes("Settling with Dev"), "the didn't-go-through mark, the words, and the verb");
    assert.ok(!failed.text.includes("last time") && !/waiting \d|\d+ days/.test(failed.text), "no clock and no ageing beside it");
  } finally {
    await db.delete(schema.chainWrites).where(eq(schema.chainWrites.hash, dropped));
  }
  const pending = await plant("pending");
  try {
    const onway = await get("/", cAsker);
    assert.ok(onway.html.includes('data-onway=""') && /aria-label="On its way"/.test(onway.html) && onway.text.includes("Settling with Dev"), "a tap still going through, in Just happened with the on-its-way mark");
    assert.ok(!onway.text.includes("Sent, and still going through"), "no sentence about it (3.23)");
  } finally {
    await db.delete(schema.chainWrites).where(eq(schema.chainWrites.hash, pending));
  }
});

test("every screen paints a band behind the status bar, and on a market screen it sits inside the market's ink", async () => {
  // docs/testing.md session 7: scrolled content ran under the translucent status bar and into the clock.
  const now = await get("/", cFriend);
  assert.equal(now.status, 200);
  assert.ok(/data-status-band=""/.test(now.html), "the band on a root");
  // The band under the tab bar in the installed app (docs/testing.md item 61): iOS lays a page that fits the screen out short, so a root is at least tall enough to scroll, and the bar is pinned at the viewport's bottom.
  assert.ok(/<main[^>]*min-h-\[calc\(100lvh_\+_1px\)\]/.test(now.html), "a root is at least one pixel taller than the large viewport");
  assert.ok(/<nav aria-label="Main"[^>]*bottom-0/.test(now.html), "the tab bar is pinned at the viewport's bottom edge, with no adjustment");
  const m = await get(`/m/${marketId}`, cFriend);
  assert.equal(m.status, 200);
  const ink = m.dom.indexOf("--ground:");
  const band = m.dom.indexOf('data-status-band=""');
  assert.ok(ink >= 0 && band > ink, `the band is inside the inked root, so it reads the market's ground: ink at ${ink}, band at ${band}`);
});

test("the person owed sees the row as the move to settle it or call it even, with its photo; the person who has it sees a row and the rally", async () => {
  // docs/design.md 6.3: settling or forgiving is the person view, the obligation row, a sheet. Only the creditor closes (PLANNING.md 7).
  const mine = await get(`/p/${friend.user.id}`, cAsker);
  assert.equal(mine.status, 200);
  assert.match(mine.html, /aria-label="Dev(&#x27;|')s got you\. Settle it, or call it even"/, "the creditor's row is the move");
  assert.doesNotMatch(mine.html, /aria-label="You(&#x27;|')ve got[^"]*Settle it, or call it even"/, "what the viewer has to pick up is never theirs to close");
  assert.ok(mine.html.includes(`/api/media/${photoId}?size=thumb`), "the settlement photo rides the row as its 84px thumbnail (3.4)");
  assert.ok(/data-rally=""/.test(mine.html), "four unsettled pick-ups make a rally strip (3.11)");
  assert.ok(!/\bnet\b|\bowes\b|\bbalance\b/i.test(mine.text), "nothing on the person view says net, owes or balance");
  const theirs = await get(`/p/${asker.user.id}`, cFriend);
  assert.equal(theirs.status, 200);
  assert.doesNotMatch(theirs.html, /aria-label="You(&#x27;|')ve got[^"]*Settle it, or call it even"/, "the person who has it cannot close it: the friend's own rows to pick up are plain");
  assert.match(theirs.html, /aria-label="Priya Raman(&#x27;|')s got you\. Settle it, or call it even"/, "and what the friend is owed in the rally is theirs to close");
  assert.ok(/data-rally=""/.test(theirs.html));
  assert.ok(owedId.length > 0);
});

test("a closed obligation sits in Just happened at the moment it closed, with the mark that says how", async () => {
  const r = await get("/", cAsker);
  assert.equal(r.status, 200);
  const happened = r.text.indexOf("Just happened");
  assert.ok(happened >= 0 && r.text.indexOf("Cab home") > happened, "the settled cover is under Just happened");
  // A row (3.15): the subject, then the meta line with the mark; so the mark follows the memo in the markup.
  const at = r.dom.indexOf("Cab home");
  const card = r.dom.slice(Math.max(0, at - 600), at + 1200);
  assert.match(card, /aria-label="Settled"/, "its state mark reads settled (3.23), derived from the chain, never stored");
  assert.ok(!card.includes("<article"), "a row, never a story card (4.7)");
});

test("an obligation a market minted is settleable and forgivable from its story, the same way a cover is", async () => {
  const r = await get(`/p/${friend.user.id}`, cAsker);
  assert.equal(r.status, 200);
  // The story's own article, and nothing past it: the cover rows beneath carry the same control for a different reason.
  const article = (html: string) => {
    const at = html.indexOf("Did the kettle get descaled?");
    assert.ok(at >= 0, "the settled question is a story on the person view");
    return html.slice(at, html.indexOf("</article>", at));
  };
  assert.match(article(r.html), /aria-label="Dev(&#x27;|')s got you\. Settle it, or call it even"/, "the consequence the asker is owed is the move, inside the story");
  assert.ok(mintedId.length > 0 && settledMarketId.length > 0);
  const theirs = await get(`/p/${asker.user.id}`, cFriend);
  assert.doesNotMatch(article(theirs.html), /Settle it, or call it even/, "what the friend has to pick up is never theirs to close");
});

test("a settlement photo is served to the two people in it and reads as nothing to anyone else", async () => {
  assert.equal((await get(`/api/media/${photoId}`)).status, 404, "signed out: nothing");
  assert.equal((await get(`/api/media/${photoId}?size=thumb`, cStranger)).status, 404, "someone else signed in: nothing, not even that it exists");
  assert.equal((await get(`/api/media/${randomUUID()}`, cAsker)).status, 404, "an unknown photo");
  const party = await get(`/api/media/${photoId}?size=thumb`, cFriend);
  if (storageConfigured()) {
    assert.equal(party.status, 302, "one of the two people in it is sent to the photo");
    assert.match(party.loc ?? "", /\/storage\/v1\/object\/sign\/media\/thumbs\//, "a signed URL into the private bucket, never a public path");
    assert.equal((await get(`/api/media/${photoId}?size=thumb`, cAsker)).status, 302, "and so is the other");
  } else {
    assert.equal(party.status, 503, "with no key here the door says the store is off, never that there is nothing");
  }
});

test("the joining screen is for someone signed in; signed out it sends them home", async () => {
  const out = await get("/join");
  assert.ok(out.status === 307 || out.status === 302);
  const r = await get("/join?code=k7qm", cFriend);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes("Got a code?") && r.text.includes("no O, I, Z, zero or one") && r.text.includes("Got a link instead?") && r.text.includes("Paste a link"), "the six boxes, the one caption, the link row (3.16, 3.38)");
  assert.ok(!r.text.includes("Someone read you a code") && !r.text.includes("Pasting works") && !r.html.includes("K7QMD3"), "no sentence explains a code, and no example sits in the boxes (4.9)");
});

test("the app is installable and its worker is served from the root, where a push needs it", async () => {
  const m = await get("/manifest.webmanifest");
  assert.equal(m.status, 200);
  const manifest = JSON.parse(m.html) as { display: string; start_url: string; icons: Array<{ src: string }> };
  assert.deepEqual([manifest.display, manifest.start_url], ["standalone", "/"]);
  for (const icon of manifest.icons) assert.equal((await get(icon.src)).type, "image/png", icon.src);
  const sw = await get("/sw.js");
  assert.ok(sw.status === 200 && sw.html.includes("notificationclick") && !sw.html.includes('addEventListener("fetch"'), "a worker that caches would serve somebody a stale ledger");
});

test("a push subscription is taken only from someone signed in, and only for a real push service", async () => {
  const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } });
  assert.equal((await send("/api/push/subscribe", "POST", sub("https://fcm.googleapis.com/fcm/send/check-" + marketId))).status, 401);
  assert.equal((await send("/api/push/subscribe", "POST", sub("https://evil.example.com/collect"), cFriend)).status, 400);
  assert.equal((await send("/api/push/subscribe", "POST", sub("http://fcm.googleapis.com/fcm/send/x"), cFriend)).status, 400);
  assert.equal((await send("/api/push/subscribe", "POST", sub("https://fcm.googleapis.com/fcm/send/check-" + marketId), cFriend)).status, 200);
});

test("a device that cannot approve is only ever reported by the person it belongs to", async () => {
  assert.equal((await send("/api/device-state", "POST", { state: "signed-out", standalone: false })).status, 400);
  assert.equal((await send("/api/device-state", "POST", { state: "anything", standalone: false }, cFriend)).status, 400);
  assert.equal((await send("/api/device-state", "POST", { state: "signed-out", standalone: true }, cFriend)).status, 200);
});

test("nothing on a question borrows a word from finance", async () => {
  const FINANCE = /\b(odds|implied|price|pot|house|buy|sell|shares|liquidity|position size)\b|the market says/i;
  for (const who of [cFriend, cAsker]) {
    const r = await get(`/m/${marketId}`, who);
    // The one exception the vocabulary boundary makes (docs/design.md 4.6): the question the odds line asks.
    const m = FINANCE.exec(r.text.replace(/What are the odds(, in percent)?\?/g, "").replace(/Slide to pick your odds/g, ""));
    assert.equal(m, null, m ? `found "${m[0]}" in: ...${r.text.slice(Math.max(0, m.index - 40), m.index + 40)}...` : "");
  }
});

test("Now has no groups and no way to leave; people and the account have their own roots", async () => {
  const now = await get("/", cAsker);
  assert.ok(!/Sign out/.test(now.text) && !/\bGroups\b/.test(now.text) && !/Nothing open/.test(now.text));
  const you = await get("/you", cAsker);
  assert.ok(you.text.includes("Sign out") && you.text.includes(asker.user.displayName), "the account lives behind You");
  const self = await get(`/p/${asker.user.id}`, cAsker);
  assert.ok((self.status === 307 || self.status === 302) && self.loc === "/you", "your own person view is the You root");
  const gone = await get(`/g/${groupId}`, cA);
  assert.ok((gone.status === 307 || gone.status === 302) && gone.loc === "/", "there is no group screen; an old address goes home");
});

// --------------------------------------------------------------------------------------- 2C: the settler

test("the scheduler's door answers only to its secret, and tells a stranger nothing, not even that it exists", async () => {
  const post = (headers: Record<string, string>) => fetch(`${BASE}/api/tick`, { method: "POST", headers });
  assert.equal((await post({})).status, 404);
  assert.equal((await post({ authorization: "Bearer not-the-secret" })).status, 404);
  assert.equal((await post({ authorization: `Bearer ${"x".repeat((process.env.TICK_SECRET ?? "").length)}` })).status, 404, "same length, wrong value");
  assert.equal((await fetch(`${BASE}/api/tick`)).status, 405, "there is nothing to GET");
});

test("the bar is on the four roots and nowhere else, every other screen has a back control, and signed out there is only the wordmark", async () => {
  for (const path of ["/", "/on", "/people", "/you"]) {
    const r = await get(path, cAsker);
    assert.ok(/<nav aria-label="Main"/.test(r.html) && /aria-label="Ask something"/.test(r.html) && !/aria-label="Back"/.test(r.html), `${path} is a root`);
    assert.ok(/<main[^>]*min-h-\[calc\(100lvh_\+_1px\)\]/.test(r.html), `${path} is at least tall enough to scroll (docs/testing.md item 61)`);
    assert.equal((r.html.match(/aria-current="page"/g) ?? []).length, 1, `${path} marks one tab as where you are`);
  }
  for (const path of ["/m/new", "/join", `/m/${marketId}`, `/p/${friend.user.id}`, "/welcome", `/on/${feedGameId}?g=${feedGroupId}`]) {
    const r = await get(path, cAsker);
    assert.ok(r.status === 200 || r.loc === "/", `${path}: ${r.status}`);
    // The question step's top-left control is Close, a down chevron, since it rises from the + (9.5); every other task screen has Back.
    // A task screen is the document's own and is at least a pixel taller than the large viewport like a root (the sheet stood above the edge on one that fit; docs/decisions.md 2026-09-29); only a step inside the ask layer is not.
    if (r.status === 200) assert.ok((path === "/m/new" ? /aria-label="Close"/.test(r.html) : /aria-label="Back"/.test(r.html)) && !/<nav aria-label="Main"/.test(r.html) && !/aria-label="Ask something"/.test(r.html) && /<main[^>]*min-h-\[calc\(100lvh_\+_1px\)\]/.test(r.html), `${path} is a task screen`);
  }
  const out = await get(`/m/${marketId}`);
  assert.ok(!/aria-label="Back"/.test(out.html) && !/<nav aria-label="Main"/.test(out.html) && /<header[^>]*data-top-bar=""[^>]*>(?:(?!<\/header>)[\s\S])*<svg[^>]*aria-label="dareful"[^>]*data-wordmark=""/.test(out.html), "someone signed out has nowhere in the app to go back to: the wordmark, the logo's own outlines, where back would be");
  // The claimant screen (3.38): the wordmark alone and no back, because nothing is behind it.
  const claimant = await get("/welcome", cU);
  if (claimant.status === 200) assert.ok(!/aria-label="Back"/.test(claimant.html) && /data-wordmark=""/.test(claimant.html) && /data-info-icon="claimant"/.test(claimant.html), "the claimant screen's header is the wordmark alone");
  const signedOut = await get("/");
  assert.ok(/data-wordmark=""/.test(signedOut.html) && signedOut.text.includes("Will dinner start on time?") && signedOut.text.includes("Ask your friends. Everyone says how sure they are") && !signedOut.text.includes("Who’s got the next one?") && !/<nav aria-label="Main"/.test(signedOut.html), "signed out on Now: the wordmark and the way in");
  // The owner's line (2026-10-02, the field round), word for word, and the earlier lines gone with it: the literal, so a change to the constant is seen here.
  assert.ok(signedOut.text.includes("Ask your friends. Everyone says how sure they are, with a beer or a few dollars riding on it, and Dareful keeps score.") && !signedOut.text.includes("Everyone makes their call, and Dareful keeps track") && !signedOut.text.includes("No spreadsheet") && !signedOut.text.includes("The dares, the rounds"), "signed out on Now: what the app is, in the owner's words");
  // An empty Now (3.14): "Ask something" is the one chalk control, so Start stays hidden, and the bar is still there.
  const empty = await get("/", cA);
  assert.ok(empty.text.includes("Nothing happens here until somebody else is in it.") && empty.text.includes("Ask something"), "the first-run state");
  // The shell goes out before Now has been read (11.5), so the + is in it; what arrives says Now is empty, and the stylesheet hides the + and "Got a code?" on that word.
  assert.ok(/<nav aria-label="Main"/.test(empty.html) && /data-now="empty"/.test(empty.html) && !/data-now="full"/.test(empty.html), "Start is hidden where Ask something already is the chalk: the content says Now is empty");
  const sheet = /<link rel="stylesheet" href="([^"]+)"/.exec(empty.html)?.[1];
  assert.ok(sheet, "the stylesheet");
  const css = await (await fetch(BASE + sheet)).text();
  assert.ok(/html:has\(\[data-now="?empty"?\]\) :is\(\[data-start\], ?\[data-now-full\]\)/.test(css) && /\[data-now-hint="?empty"?\]/.test(css), "and the stylesheet hides the + and Got a code? on an empty Now, by what the content says and by what the phone remembers");
  assert.ok(/data-now-full=""[^>]*>(?:(?!<\/span>)[\s\S])*data-got-a-code=""/.test(empty.html) && /data-now-empty=""[^>]*>(?:(?!<\/span>)[\s\S])*data-info-icon="now-first-run"/.test(empty.html), "Got a code? and the live screen's sheet answer to the same word; first run's sheet is there for it");
  assert.ok(empty.html.includes('data-code-join="compact"') && !empty.html.includes("K7QMD3") && !empty.text.includes("Ask your group chat"), "six boxes with no example in them, and no line explaining the screen (3.14, 3.16, 4.9)");
});

test("asking offers both paces and both ways of writing the terms, and the settler says up front what it will not call", async () => {
  const r = await get("/m/new", cAsker);
  for (const t of ["Something that’ll happen", "Settle an argument", "Quick setup", "Help define the terms"]) assert.ok(r.text.includes(t), t);
  // The first-contact round, the owner's labels: "Market type" with "Pick a number", then more room and the "AI market setup" heading over its two choices, each keeping its line.
  assert.ok(r.text.includes("Market type") && r.text.includes("Pick a number") && !r.text.includes("How people answer") && !r.text.includes("How the rules get written"), "the type's label and its chips, in the owner's words");
  assert.ok(/data-pace-row=""[^>]*class="[^"]*\bmt-2\b[^"]*"[^>]*>\s*<h2[^>]*>AI market setup<\/h2>(?:(?!<h2)[\s\S])*Quick setup(?:(?!<h2)[\s\S])*One line in, terms out\./.test(r.html), "the setup is a section of its own, with room above it and its line under the choices");
  // Start's "Settle an argument" row lands on the same screen, on the settler's pace.
  const arg = await get("/m/new?pace=argument", cAsker);
  assert.ok(/aria-pressed="true"[^>]*>\s*<span[^>]*>\s*Settle an argument/.test(arg.html) && arg.text.includes("What are you two arguing about?"), "the settler preselected");
});

test("someone not yet in is shown the tiebreaker they would be agreeing to", async () => {
  const r = await get(`/m/${marketId}`, cStranger);
  assert.ok(r.text.includes("If nobody can agree how it came out, the tiebreaker everyone agreed to hears both sides and calls it. Being in means you’re fine with that."), "the ruling is credited to the agreement, never to the app (4.6)");
  assert.ok(!/the app (hears|heard|calls|called)/.test(r.text), "nothing credits the app with the call");
});

// ------------------------------------------------------------------------------------- the v2 migration

test("state is a mark with a name, never a sentence: a question to get into is Open, and a cover to confirm is Proposed", async () => {
  const r = await get("/", cFriend);
  // Inside the row for the question to get into, not anywhere on the page (a game row carries its own mark).
  const enterRow = /<a[^>]*data-need="enter"[^>]*>[\s\S]*?<\/a>/.exec(r.html)?.[0] ?? "";
  assert.ok(enterRow && /<svg role="img" aria-label="Open"/.test(enterRow), "the needs-you row carries the open mark");
  // Apostrophes are compared plain: the code types both kinds, and a search for one kind alone could never fail against the other (the "Everyone's in" that stood on the asker's Close row).
  const plain = r.text.replace(/’/g, "'");
  for (const s of ["Waiting on an answer", "Waiting on how it came out", "Nobody's in yet", "Everyone's in", "Squared up", "Called it even"]) assert.ok(!plain.includes(s), `state prose "${s}" on Now`);
  const u = await get("/welcome", cU);
  assert.ok(/<svg role="img" aria-label="Proposed"/.test(u.html), "a cover to confirm carries the proposed mark");
});

test("a market's own screen is its ink: the ground, surface and line swapped for its layers, its band on its field, and the details as four facts", async () => {
  const [d] = await db.select({ id: schema.dares.id, ink: schema.dares.ink }).from(schema.dares).where(eq(schema.dares.id, marketId));
  assert.ok(d);
  const layers = INKS[inkOf(d)];
  const r = await get(`/m/${marketId}`, cAsker);
  assert.ok(r.html.includes(`--ground:${layers.ground}`) && r.html.includes(`--surface:${layers.surface}`) && r.html.includes(`--field:${layers.field}`), "the ink's layers on the screen's root");
  assert.ok(!r.html.includes("--ink:") && !r.html.includes("--chalk:"), "type colours and the chalk button are never tinted");
  assert.ok(/<svg role="img" aria-label="You’re in"/.test(r.html), "the band's mark: the asker is in");
  for (const s of ["Counts if", "Decided", "Stakes", "If it’s unclear"]) assert.ok(r.text.includes(s), `the details carry ${s}`);
  assert.ok(!r.text.includes("Every pair squares") && !r.text.includes("How we’ll know"), "scoring and the terms disclosure left the screen (4.9)");
  const s = await get(`/m/${marketId}`, cStranger);
  assert.ok(!s.html.includes(`--ground:${layers.ground}`), "the invitation is the neutral room, not the market's place");
});

// ---------------------------------------------------------------------------------- the v2 migration, second half

test("the market screen keeps its one move in the pinned sheet: the odds line before you are in, and no sheet once you are, with the icons on the who's-in row", async () => {
  const before = await get(`/m/${marketId}`, cFriend);
  assert.ok(/<section aria-label="Your number"/.test(before.html), "the sheet, labelled as the move");
  assert.ok(before.text.includes("What are the odds?") && before.text.includes("Slide to your prediction") && /I’m in at 50%/.test(before.text), "the odds line, untouched: the thumb at 50% under the prompt, and the primary saying the 50% it would send (3.13 as amended 2026-10-04)");
  assert.ok(before.html.includes('aria-valuetext="50%, '), "the thumb starts at 50%, the owner's call over the old rule that nothing starts picked");
  const after = await get(`/m/${marketId}`, cAsker);
  assert.ok(!/<section aria-label="Your number"/.test(after.html) && !/<section aria-label="Get people in"/.test(after.html), "once in, nothing is your move: no sheet (3.24)");
  assert.ok(!after.html.includes("data-stake-fact"), "the fact is the stake step's alone: nowhere once in");
  assert.ok(after.html.includes('data-holdouts="1"') && after.html.includes('data-holdout=""') && after.html.includes('data-whos-in-list=""'), "the friend, asked and not in, follows the stack as a dashed avatar, and the stack opens who's in (3.42)");
  assert.ok(!after.html.includes("data-ghost-entries"), "no list of ghosts: who is in is behind the stack");
  assert.ok(after.html.includes('data-nudge=""') && after.text.includes(`Waiting on ${friend.user.displayName.split(" ")[0]}.`) && after.text.includes("Nudge "), "the nudge is back (Round B): the only way someone in reaches the people not in");
  assert.ok(after.html.includes('data-whos-in=""') && after.html.includes('data-share=""') && after.html.includes('data-copy=""') && after.html.includes('data-code=""'), "the icons end the who's-in row: share, copy, the code to scan (3.42)");
  assert.ok(after.text.includes("1 of 2 in") && !after.text.includes("Just you so far") && /data-share=""[^>]*bg-chalk/.test(after.html), "alone with someone named: the holdouts rule from the first entry, and share still the chalk (ruled 2026-09-27)");
  assert.ok(!after.text.includes("Send it to the chat") && !after.text.includes("Anyone with the link") && !after.text.includes("show a code"), "the four sentences and buttons are gone (4.9)");
  assert.ok(!after.text.includes("Slide to your prediction"), "the odds line has become the weight line");
  assert.ok(!before.html.includes('data-whos-in=""') && before.text.includes("One friend is in. Where they landed shows once you are."), "before you're in: who is in and no number, and no icons, since sharing belongs to people who are in (3.38, 3.42)");
  for (const s of ["in 10", "Fine-tune", "Not once", "Every time"]) assert.ok(!after.text.includes(s) && !before.text.includes(s), `tenths copy "${s}" came back`);
});

test("a task screen's primary is in the sheet too: the ask flow, the code screen", async () => {
  const ask = await get("/m/new", cAsker);
  assert.ok(/<section aria-label="Next"[^>]*>[\s\S]*?Next: who’s in/.test(ask.html), "the ask flow's first move (3.29: one chalk, Next: who's in)");
  const join = await get("/join", cA);
  assert.ok(/<section aria-label="Join"[^>]*>[\s\S]*?>Join</.test(join.html), "Join, in the sheet");
});

test("the asking tile carries the asker's first name and the mechanic, and never who is in or at what", async () => {
  const r = await get(`/m/${marketId}/opengraph-image`);
  assert.equal(r.status, 200);
  assert.equal(r.type, "image/png");
  // A different picture from the plain card and from a cover's card: it is drawn from the market.
  const plain = await get(`/m/00000000-0000-4000-8000-000000000000/opengraph-image`);
  assert.ok(!r.bytes.equals(plain.bytes));
  assert.ok(r.bytes.length > 10_000, "a drawn tile, not an empty frame");
});

// ------------------------------------------------------------------------------------------ Phase 5: numbers, refresh, the picker

test("a number question takes a whole number in the field, never an odds line, and shows its scale only when the asker set it", async () => {
  const before = await get(`/m/${numberId}`, cFriend);
  assert.equal(before.status, 200);
  assert.ok(before.text.includes("What’s your number?") && before.text.includes("Type your number") && !before.text.includes("Any whole number"), "the number field, empty, the primary waiting, and no caption under a field with a keypad (4.9)");
  // React serialises the attribute as `inputMode`; the browser reads either spelling.
  assert.ok(/<input[^>]*inputmode="numeric"[^>]*pattern="\[0-9\]\*"/i.test(before.html) && !/type="number"/.test(before.html), "a text input with the numeric keypad, never type=number (3.26)");
  assert.ok(!before.text.includes("Slide to pick your odds") && !before.text.includes("What are the odds?"), "no odds line on a number question");
  assert.ok(before.text.includes("Scored on") && before.text.includes("Off by 20 shirts or more scores nothing"), "the asker's scale, once, in the details");
  for (const s of ["You’re in at", "14 shirts", "\"stake\":\"500\"", "columns"]) assert.ok(!before.html.includes(s), `someone who has not picked is sent "${s}"`);
  const after = await get(`/m/${numberId}`, cAsker);
  assert.ok(after.text.includes("You’re in at 14 shirts") && after.text.includes("Where the stake sits"), "the entry line in the unit's words");
  assert.ok(after.text.includes("13") && after.text.includes("15 shirts"), "one entry draws its number with one either side, the unit on the right end only (3.22)");
  const ai = await get(`/m/${aiScaleId}`, cFriend);
  assert.ok(!ai.text.includes("Scored on") && !ai.html.includes("scores nothing"), "a scale the app set appears on no screen (3.26)");
});

test("the far-off check's threshold reaches the screen as a round figure far past the scale, and the hidden scale does not", async () => {
  // The model set the scale (30) around a most likely answer of 37: the screen gets the threshold, 4,000, and no scale to name.
  // The stage's props travel in the page's flight data with their quotes escaped; read them flat.
  const flat = (h: string) => h.replace(/\\+"/g, '"');
  const hidden = flat((await get(`/m/${aiScaleId}`, cFriend)).html);
  assert.ok(hidden.includes('"farOff":{"threshold":"4000","scale":null}'), "a hundred times the most likely answer, to one figure, with no scale beside it");
  assert.ok(!hidden.includes('"threshold":"3700"') && !hidden.includes('"scale":"30"'), "neither the answer to the digit nor the hidden scale");
  // The asker set this one's scale (20), which the details already show, so the check may name it; with no most likely answer it stands at fifty times the scale.
  const shown = flat((await get(`/m/${numberId}`, cFriend)).html);
  assert.ok(shown.includes('"farOff":{"threshold":"1000","scale":"20"}'), "the asker's scale, named");
});

test("a blind number question shows the asker their own axis once in, with the entry final, and nothing to someone not in", async () => {
  const r = await get(`/m/${blindNumberId}`, cAsker);
  assert.ok(r.text.includes("You’re in at 22 shirts") && r.text.includes("$5 · final"), "the entry line, and its caption says final (3.22, 3.31)");
  assert.ok(!r.text.includes("Numbers show when everyone’s in") && !r.html.includes("data-blind-line"), "the lock chip is gone, and the sheet is gone once in");
  assert.ok(!/>Change</.test(r.html), "no Change on a blind market");
  assert.ok(r.text.includes("Where the stake sits"), "once in, the axis and the columns show like any number market's");
  const notIn = await get(`/m/${blindNumberId}`, cFriend);
  assert.ok(notIn.html.includes("data-blind-line") && notIn.text.includes("You see everyone’s once you’re in. Yours is final then."), "before entering, the one line above the primary says what is about to happen");
  assert.ok(!/\b22 shirts\b/.test(notIn.text) && !notIn.text.includes("Where the stake sits"), "nothing of where anyone landed before you're in");
});

test("a blind number question's axis is not sent to someone not in", async () => {
  const r = await get(`/m/${blindNumberId}`, cFriend);
  assert.ok(!r.text.includes("Numbers show when everyone’s in"), "the lock chip is gone");
  // No axis drawn, and none sent: the labels either side of the one entry, the heading, and the axis data a component would read.
  assert.ok(!/\b21\b/.test(r.text) && !r.text.includes("23 shirts") && !r.text.includes("Where the stake sits"), "a blind number question draws its ends");
  for (const s of ["\"columns\"", "xPermille"]) assert.ok(!r.html.includes(s), `a blind number question is sent an axis: "${s}"`);
});

test("an answered number question says the answer as a sentence, stands the ruler where the call line was, and ranks closest first by distance", async () => {
  const r = await get(`/m/${answeredId}`, cAsker);
  assert.ok(r.text.includes("14 shirts.") && r.text.includes("You were closest, dead on."), "the outcome sentence and the caption (3.25)");
  assert.ok(r.text.includes("Closest first") && r.text.includes("said 12") && r.text.includes("off by 2"), "the leaderboard in the unit's numbers (3.7)");
  assert.ok(r.text.includes("14 shirts") && r.text.includes("12") && !r.text.includes("Said no"), "the ruler's ends, never No and Yes");
  // The story on a timeline (the person view lists every question both are in) carries the answer as its sentence and the ruler, never a side.
  const story = await get(`/p/${asker.user.id}`, cFriend);
  const card = (story.dom.split("<article").find((a) => a.includes("How many shirts did Gabe wear?")) ?? "").replace(/<[^>]+>/g, " ");
  assert.ok(card.includes("14 shirts.") && card.includes("12") && !card.includes("Said no") && !card.includes("Yes."), "the story carries the answer and the ruler, never a side");
});

test("a market in voting can be watched: its pulse is Postgres only, answers the people in its group, and is nothing to anyone else", async () => {
  await db.update(schema.dares).set({ lockedAt: new Date() }).where(eq(schema.dares.id, numberId));
  const r = await fetch(`${BASE}/api/m/${numberId}/pulse`, { headers: { cookie: `dareful_session=${cFriend}` } });
  assert.equal(r.status, 200);
  const body = (await r.json()) as { pulse: string; resolved: boolean };
  assert.equal(body.resolved, false);
  assert.match(body.pulse, /^v\[\] s\[\] e\[\] r0 p0 f0$/, "nothing said, nothing voted, nothing attached, no score");
  assert.equal(r.headers.get("cache-control"), "no-store");
  await markets.sayWhatHappened(numberId, asker.user.id, "14, then a seam gave out");
  const again = (await (await fetch(`${BASE}/api/m/${numberId}/pulse`, { headers: { cookie: `dareful_session=${cFriend}` } })).json()) as { pulse: string };
  assert.notEqual(again.pulse, body.pulse, "what was said moves the pulse");
  assert.equal((await fetch(`${BASE}/api/m/${numberId}/pulse`, { headers: { cookie: `dareful_session=${cStranger}` } })).status, 404, "someone outside the group");
  assert.equal((await fetch(`${BASE}/api/m/${numberId}/pulse`)).status, 404, "signed out");
  assert.equal((await fetch(`${BASE}/api/m/00000000-0000-4000-8000-000000000000/pulse`, { headers: { cookie: `dareful_session=${cFriend}` } })).status, 404, "an id that matches nothing");
  const page = await get(`/m/${numberId}`, cAsker);
  assert.ok(page.text.includes("When it’s clear, say what it was.") && page.text.includes("Type what it was"), "closed, not yet known: the number field, empty (3.24)");
  const outside = await get(`/m/${numberId}`, cFriend);
  assert.ok(outside.status === 200 && !outside.text.includes("Type what it was") && !outside.text.includes("When it’s clear"), "someone in the set who never got in watches, and gets no ballot (the first-contact round)");
  await db.update(schema.dares).set({ lockedAt: null }).where(eq(schema.dares.id, numberId));
});

test("asking offers a number beside yes or no, and the question step carries the mark row with Optional said once", async () => {
  const r = await get("/m/new", cAsker);
  for (const t of ["Yes or no", "Pick a number", "Add a mark", "Optional", "Your question", "Next: who’s in", "Got a code?", "Market type"]) assert.ok(r.text.includes(t), t);
  assert.ok(!r.text.includes("It picks this market") && !r.html.includes("John falls asleep during the movie"), "the retint shows what a mark does, and no example sits in the question (4.9)");
  assert.equal((r.text.match(/Optional/g) ?? []).length, 1, "Optional is said once, on the row, and never again (3.29)");
  assert.ok(!r.text.includes("Everyone puts their odds on it") && !r.text.includes("closest wins") && !r.text.includes("whoever's right is paid"), "no caption under the kind chips (3.29, 4.9, Round C)");
  assert.ok(/<span[^>]*border-ink-3 bg-surface-2 text-ink[^>]*>Yes or no<\/span>/.test(r.html), "the selected kind chip is a choice among words, a surface-2 fill and an ink-3 border, never ink on ground (3.3, 3.29)");
  assert.ok(/aria-haspopup="dialog"/.test(r.html), "the mark row opens the picker");
  // Focus outlines (5.1, Round C): the global 2px ink outline, 2px outside the control, on every field; nothing removes it.
  assert.ok(!/outline-none/.test(r.html) && !/focus:border/.test(r.html), "no field on the ask flow removes its focus outline");
});

test("a number question's asking tile is drawn, and differs from a yes-or-no question's", async () => {
  const r = await get(`/m/${numberId}/opengraph-image`);
  assert.equal(r.status, 200);
  assert.equal(r.type, "image/png");
  const yesNo = await get(`/m/${marketId}/opengraph-image`);
  assert.ok(!r.bytes.equals(yesNo.bytes), "the empty field and the unit, not the odds line");
  const answered = await get(`/m/${answeredId}/opengraph-image`);
  assert.equal(answered.status, 200);
  assert.ok(!answered.bytes.equals(r.bytes) && answered.bytes.length > 10_000, "the result tile: the answer and the ruler");
  // What the tiles are drawn from (3.27): the asking tile names the unit in place of the odds line, and the result tile carries the
  // answer, the ruler with the answer's place, and who was closest. Never a number anyone picked while it runs.
  const asking = await marketTile(numberId);
  assert.ok(asking?.kind === "ask" && asking.frame === "Name a number." && asking.unit === "shirts", "the empty field and the unit in serif");
  const plain = await marketTile(marketId);
  assert.ok(plain?.kind === "ask" && plain.unit === null, "a yes-or-no question's tile has no unit: the odds line");
  const result = await marketTile(answeredId);
  assert.ok(result?.kind === "number" && result.outcomeLine === "14 shirts." && result.ruler.leftLabel === "12" && result.ruler.rightLabel === "14 shirts" && result.ruler.pins.some((p) => p.closest), "the answer, the ruler, whoever was closest ringed");
});

// ------------------------------------------------------------------------------------------------ media

test("a settled question shows its frame with the credit and the counter, a voter's screenshot behind More only, and the sheet's chalk to someone who was in it", async () => {
  const r = await get(`/m/${answeredId}`, cAsker);
  assert.equal(r.status, 200);
  assert.ok(r.html.includes("data-media-frame"), "the frame (3.8, 3.37)");
  assert.ok(r.html.includes(`/api/media/${memoryIds[0]}"`) && r.html.includes("Photo 1 of 2, added by Priya"), "the first photo added is the frame, credited by first name");
  assert.ok(r.html.includes(`/api/media/${memoryIds[1]}?size=thumb`), "the second is a square in the strip");
  assert.ok(r.text.includes("1 / 2"), "the counter");
  assert.ok(!r.html.includes(`/api/media/${evidenceOnSettledId}"`), "a screenshot nobody's claim carried is not in the frame");
  assert.ok(r.html.includes('data-add-tile=""') && r.html.includes("Add photos from"), "the add tile ends the strip for someone who was in it (3.8)");
  assert.ok(r.html.includes('data-share=""') && !r.text.includes("Send how it ended") && !r.html.includes("data-add-photos"), "sending is the share icon on the who's-in row, and there is no sheet (3.24, 3.42)");
  assert.ok(r.text.includes("Closest first") && r.text.includes("Who’s got who"), "the settled screen's order (3.37)");
  const outsider = await get(`/m/${answeredId}`, cStranger);
  assert.ok(!outsider.html.includes(memoryIds[0] ?? "x"), "someone outside the group gets neither the story nor its photos");
});

test("a settled question with no photos shows the empty slot as the move, for someone who was in it, with sending still available", async () => {
  const r = await get(`/m/${settledMarketId}`, cAsker);
  assert.equal(r.status, 200);
  assert.ok(r.html.includes("data-empty-slot") && r.html.includes("Add the first photo from"), "the empty slot is itself the button (3.8)");
  assert.ok(!r.html.includes("data-media-frame"), "no empty frame");
  assert.ok(!r.html.includes("data-add-tile") && !r.html.includes("data-add-photos"), "the slot alone while there are none: no tile, no sheet");
  assert.ok(r.html.includes('data-share=""'), "share on the row");
  assert.ok(r.html.includes("Yes.") || r.text.includes("Yes."), "a market made before the outcome words says Yes.");
});

test("once it is called, the claimant's clip leads the frame on the settled screen, in the market's own words; a voided market takes a photo too", async () => {
  const r = await get(`/m/${calledId}`, cFriend);
  assert.equal(r.status, 200);
  assert.ok(r.html.includes(`/api/media/${calledClipId}"`) && r.html.includes("Photo 1 of 1, added by Priya"), "the resolving clip leads the frame, credited to the claimant (3.8, 4.3)");
  assert.ok(r.text.includes("It boiled dry."), "the outcome in the market's own words (3.25)");
  assert.ok(r.text.includes("Closest first"));
  const band = (html: string) => /<section[^>]*data-band-state="[^"]*"[^>]*>[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
  assert.ok(/Settled (at |\w{3} at )/.test(band(r.html)), "the band's clock after the end: Settled and when (3.37, Round C part 2)");
  const voided = await get(`/m/${voidedId}`, cAsker);
  assert.equal(voided.status, 200);
  assert.ok(/Voided (at |\w{3} at )/.test(band(voided.html)), "Voided and when, in the band");
  assert.ok(voided.text.includes("Nobody could tell.") && voided.text.includes("Nothing changes hands."), "the voided screen (3.37)");
  assert.ok(voided.html.includes("data-media-frame") && voided.html.includes("data-add-tile") && !voided.html.includes("data-empty-slot"), "a void was still a night: its photo in the frame, and the add tile for someone who was in");
  assert.ok(!voided.html.includes('data-share=""') && !voided.html.includes('data-whos-in=""'), "no tile tells a void, so no row and nothing to send (3.42)");
  assert.ok(!voided.text.includes("Closest first"));
});

test("someone who wasn't in sees the frame and never an add: no empty slot, and the sheet is sending alone", async () => {
  const r = await get(`/m/${calledId}`, cNia);
  assert.equal(r.status, 200);
  assert.ok(!r.html.includes("data-empty-slot") && !r.html.includes("data-add-tile"), "no add anywhere (3.37, frame B)");
  assert.ok(r.html.includes('data-share=""'), "share is on the who's-in row, for everyone who can see it");
  const v = await get(`/m/${voidedId}`, cNia);
  assert.equal(v.status, 200);
  assert.ok(v.text.includes("Nobody could tell."), "the story is the whole screen");
  assert.ok(!v.html.includes('data-share=""') && !v.html.includes("data-empty-slot") && !v.html.includes("data-add-tile"), "a void for someone who wasn't in: nothing to add and nothing to send");
});

test("the day after it ended, the same market opens as the memory: the photos first at 260, no ranking, the date where the clock was", async () => {
  const r = await get(`/m/${memoryId}`, cAsker);
  assert.equal(r.status, 200);
  assert.ok(r.html.includes("height:260px") || r.html.includes("height: 260px"), "the frame at 260 (3.37)");
  assert.ok(!r.text.includes("Closest first"), "closest first leaves the memory screen");
  assert.ok(r.text.includes("Nothing changed hands.") || r.text.includes("got"), "what it left");
  assert.ok(r.html.includes('data-add-tile="') || r.html.includes('data-empty-slot=""'), "adding stays one tap away, weeks later included (3.24)");
  assert.ok(r.html.includes('data-share=""'), "and the row with its icons (3.37)");
});

test("the person view: what is still ahead under Coming up, the past after it with no Show earlier while it is short, and a voided story keeps its frame (3.4, 3.38)", async () => {
  const r = await get(`/p/${friend.user.id}`, cAsker);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes("Coming up"), "the kettle question, still open between the two, is ahead");
  const comingUp = r.dom.indexOf("Coming up");
  const past = r.dom.indexOf('data-past-starts=""');
  assert.ok(comingUp >= 0 && past > comingUp, "the past starts after what is ahead");
  assert.ok(!r.html.includes('data-show-earlier=""'), "a short history has nothing earlier to show");
  // A void was still a night (3.4): its story carries the frame, drawn without controls, like a resolved one.
  const voidedStory = r.dom.slice(r.dom.indexOf(`href="/m/${voidedId}"`));
  assert.ok(voidedStory.includes("data-media-frame") && voidedStory.indexOf("data-media-frame") < voidedStory.indexOf("</article>"), "the voided story's frame");
  assert.ok(!/<a[^>]*data-show-earlier/.test(r.html) || r.html.includes("earlier=1"), "Show earlier, when it shows, is the same screen asked for earlier");
});

test("a market's photo is served to its participants and reads as nothing to anyone else; the story on a person view carries the frame", async () => {
  const id = memoryIds[0] ?? "";
  assert.equal((await get(`/api/media/${id}`)).status, 404, "signed out: nothing");
  assert.equal((await get(`/api/media/${id}?size=thumb`, cStranger)).status, 404, "someone else signed in: nothing, not even that it exists");
  const party = await get(`/api/media/${id}?size=thumb`, cFriend);
  if (storageConfigured()) {
    assert.equal(party.status, 302, "the other participant is sent to the photo");
    assert.match(party.loc ?? "", /\/storage\/v1\/object\/sign\/media\/thumbs\//, "a signed URL into the private bucket");
  } else {
    assert.equal(party.status, 503);
  }
  const timeline = await get(`/p/${friend.user.id}`, cAsker);
  assert.equal(timeline.status, 200);
  assert.ok(timeline.html.includes("data-media-frame") && timeline.html.includes(`/api/media/${id}"`) && timeline.html.includes("data-media-counter"), "the story in a timeline carries the frame at 180 (3.4)");
});

test("a photo attached with what happened sits on the claim card and in the sheet, and the app's read of it says who supplied it", async () => {
  const r = await get(`/m/${evidenceMarketId}`, cFriend);
  assert.equal(r.status, 200);
  const shots = r.html.match(new RegExp(`data-evidence="${evidenceId}"`, "g")) ?? [];
  assert.ok(shots.length >= 2, `the claim card's 72px clip and the sheet's attached list (3.37): found ${shots.length}`);
  assert.ok(r.html.includes(`width="72"`), "the clip on the claim card is 72px");
  assert.ok(r.text.includes("Priya says the kettle boiled dry"), "the claim in the market's own words (3.25)");
  assert.ok(!r.html.includes("data-media-frame"), "no frame while it is being called: the clip is on the claim card");
  assert.ok(r.text.includes("The screenshot Priya supplied"), "the read names who supplied what");
  // Once voting opens the entry line leaves (3.38, Voting): the claim card stands where it stood, then where everyone landed.
  assert.ok(!r.text.includes("You’re in at 30%") && r.text.includes("Where everyone landed"), "the friend's entry line is gone under the claim card, and the picture remains");
  assert.ok(r.text.indexOf("Priya says the kettle boiled dry") < r.text.indexOf("Where everyone landed"), "the claim card directly under the band, then the picture");
  const asker = await get(`/m/${evidenceMarketId}`, cAsker);
  assert.ok(!asker.text.includes("You’re in at 80%") && asker.text.includes("You say the kettle boiled dry"), "the claimant's own entry line leaves too");
});

test("a sticker mark rides the band behind its own door: seen by its owner and the group, nothing to anyone else", async () => {
  const r = await get(`/m/${stickerMarketId}`, cFriend);
  assert.equal(r.status, 200);
  assert.ok(r.html.includes(`/api/mark/${stickerId}?size=stamp`) && r.html.includes('data-mark="sticker"'), "the 256 derivative with its edge, fit to the stamp (1.7, 3.9)");
  assert.equal((await get(`/api/mark/${stickerId}`)).status, 404, "signed out");
  assert.equal((await get(`/api/mark/${stickerId}?size=stamp`, cStranger)).status, 404, "outside the group: not even that it exists");
  if (storageConfigured()) {
    assert.equal((await get(`/api/mark/${stickerId}?size=stamp`, cFriend)).status, 302, "in a group where a question wears it");
    assert.equal((await get(`/api/mark/${stickerId}?size=stamp`, cAsker)).status, 302, "its owner");
  }
  const ask = await get("/m/new", cAsker);
  assert.ok(ask.html.includes(stickerId), "the ask screen carries this person's stickers for the picker (3.29)");
  assert.ok(!(await get("/m/new", cStranger)).html.includes(stickerId), "and nobody else's");
});

test("a result tile for a question with photos says there are photos and never carries one", async () => {
  const withPhotos = await marketTile(answeredId);
  assert.ok(withPhotos?.kind === "number" && withPhotos.photos === true, "the line is a reason to tap through");
  const without = await marketTile(settledMarketId);
  assert.ok(without?.kind === "called" && without.photos === false);
  const asJson = JSON.stringify(withPhotos);
  assert.ok(!asJson.includes("/api/media") && !memoryIds.some((id) => asJson.includes(id)) && !asJson.includes("storage/v1"), "nothing on the tile can fetch a photo: a preview lands in chats with people outside the market");
  const tile = await get(`/m/${answeredId}/opengraph-image`);
  assert.equal(tile.status, 200);
  assert.equal(tile.type, "image/png");
});

// ------------------------------------------------------------------------------------------------ dates

test("a timestamp is painted in the zone the browser reported, not the server's", async () => {
  const at = new Date(Date.now() - 20 * 86_400_000);
  at.setUTCHours(2, 0, 0, 0); // 2am UTC: the evening before in Los Angeles, the same day in Tokyo
  await db.update(schema.obligationProposals).set({ createdAt: at }).where(eq(schema.obligationProposals.id, ghostCoverId));
  const label = (zone: string) => at.toLocaleDateString("en-US", { timeZone: zone, weekday: "short", month: "short", day: "numeric" });
  assert.notEqual(label("America/Los_Angeles"), label("Asia/Tokyo"));
  for (const zone of ["America/Los_Angeles", "Asia/Tokyo"]) {
    const r = await fetch(`${BASE}/o/${ghostCoverId}`, { headers: { cookie: `dareful_session=${cA}; dareful_tz=${encodeURIComponent(zone)}` } });
    assert.ok((await r.text()).includes(label(zone)), `${zone}: expected ${label(zone)}`);
  }
});

// ---------------------------------------------------------------------------------------- round D: how it feels

test("every root and task screen keeps its fixed layers free of a captured ancestor (9.3): the tab bar, the Start button and the sheet, walked in the markup", async () => {
  const { ancestorsInMarkup, capturesAbove } = await import("@/lib/ui/layers");
  const screens: Array<[string, string | undefined]> = [["/", cAsker], ["/on", cAsker], ["/people", cAsker], ["/you", cAsker], [`/m/${marketId}`, cFriend], [`/m/${marketId}`, cAsker], [`/p/${friend.user.id}`, cAsker], ["/join", cAsker], ["/welcome", cU], ["/m/new", cAsker], [`/on/${feedGameId}?g=${nightGroupId}`, cRae]];
  for (const [path, cookie] of screens) {
    const r = await get(path, cookie);
    assert.equal(r.status, 200, path);
    assert.ok(r.html.includes('id="layers"') && r.html.includes('data-layer="grain"') && r.html.includes('data-layer="status-band"'), `${path}: the layers host, the grain and the band behind the status bar are the shell's`);
    for (const [name, match] of [["the tab bar", (el: { tag: string; attrs: Record<string, string> }) => el.tag === "nav" && el.attrs["aria-label"] === "Main"], ["the Start button", (el: { tag: string; attrs: Record<string, string> }) => el.tag === "a" && el.attrs["aria-label"] === "Ask something"], ["the sheet", (el: { tag: string; attrs: Record<string, string> }) => el.tag === "section" && "data-pinned-sheet" in el.attrs]] as const) {
      const chain = ancestorsInMarkup(r.html, match);
      if (!chain) continue;
      assert.deepEqual(capturesAbove(chain), [], `${path}: ${name} has an ancestor that would capture it`);
      assert.ok(chain.some((a) => a.attrs["id"] === "app"), `${path}: ${name} sits under the app root`);
    }
    assert.ok(!/class="[^"]*\b(transform|translate-[xy]-\d|backdrop-blur|will-change-transform)\b[^"]*"[^>]*>(?:(?!<\/main>)[\s\S])*<main/.test(r.html), `${path}: nothing above the page carries a transform`);
  }
});

test("the opening (11) and the theme (8.1): the first frame is inline, in the phone's own scheme, with a launch image per iPhone in both sets, and the stored appearance goes onto html before paint", async () => {
  const r = await get("/", cAsker);
  const head = /<head>([\s\S]*?)<\/head>/.exec(r.html)?.[1] ?? "";
  assert.ok(head.includes("--tally-beat: 200ms;") && head.includes("#opening { position: fixed; inset: 0; z-index: 100; background: #121110; }"), "the first frame's style is in the head, the count's four values with it");
  assert.ok(head.includes("html:not([data-dressed]), html:not([data-dressed]) body { margin: 0; background: #121110; color-scheme: dark; }") && head.includes("html:not([data-dressed]), html:not([data-dressed]) body, #opening { background: #F5EFE4; }") && !/[;}\s]html, body \{/.test(head), "the ground in the phone's own scheme, never white, and the tokens' once dressed");
  const opening = /<div id="opening" aria-hidden="true">([\s\S]*?)<div id="app"/.exec(r.html)?.[1] ?? "";
  assert.equal((opening.match(/<div class="s s\d">/g) ?? []).length, 5, "the tally's five strokes, inline, outside the app root");
  assert.ok(/<body[^>]*>(?:<div hidden="">(?:(?!<\/div>)[\s\S])*<\/div>)?<div data-opening-host="" class="contents"><div id="opening"/.test(r.html), "the opening is the first thing the body draws, in the box the app keeps");
  const scripts = (r.html.match(/<script>[\s\S]*?<\/script>/g) ?? []).filter((x) => !x.includes("__next_f"));
  assert.equal(scripts.filter((x) => x.includes("afterFirstPaint(function(){")).length, 1, "one handoff");
  assert.ok(scripts.some((x) => x.includes("el.classList.add('handoff')") && x.includes('setAttribute("data-dressed","")') && x.includes("requestAnimationFrame(() => requestAnimationFrame(fn))")), "the design's, after the first paint, marking the document dressed");
  const links = r.html.match(/<link [^>]*rel="apple-touch-startup-image"[^>]*>/g) ?? [];
  assert.equal(links.length, 26, "a launch image per iPhone size, in a dark and a light set");
  assert.ok(links[0]?.includes("prefers-color-scheme: dark") && links[0]?.includes("/launch/") && links[0]?.includes("-dark.png"), "dark first");
  assert.ok(/<meta name="theme-color" content="#121110" media="\(prefers-color-scheme: dark\)"/.test(r.html) && /<meta name="theme-color" content="#F5EFE4" media="\(prefers-color-scheme: light\)"/.test(r.html), "one theme colour per scheme");
  assert.ok(r.html.includes('localStorage.getItem("dareful.theme")') && r.html.includes('setAttribute("data-theme",t)'), "the appearance script in the head");
  assert.ok(r.html.includes('content="width=device-width, initial-scale=1, viewport-fit=cover"'), "viewport-fit=cover");
  for (const path of ["/launch/launch-1179x2556-dark.png", "/launch/launch-1179x2556-light.png", "/apple-touch-icon.png", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/badge-96.png", "/og-image.png", "/favicon.ico", "/favicon.svg"]) {
    const f = await fetch(BASE + path);
    assert.equal(f.status, 200, path);
    assert.ok((f.headers.get("content-type") ?? "").includes(path.endsWith(".ico") ? "icon" : path.endsWith(".svg") ? "svg" : "image/png"), `${path} is an image`);
  }
  // The head names the logo's files as LOGO.md places them, and the manifest the three icons, one of them safe for Android's cropping.
  assert.ok(/<link rel="icon" href="\/favicon\.ico" sizes="48x48"/.test(r.html) && /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml"/.test(r.html) && /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png"/.test(r.html), "the favicon drawn to the grid, the one that follows the scheme, and the home-screen icon");
  assert.ok((meta(r.html, "og:image") ?? "").endsWith("/og-image.png"), "the app's own link preview");
  const manifest = (await (await fetch(BASE + "/manifest.webmanifest")).json()) as { icons: Array<{ src: string; purpose: string }> };
  assert.deepEqual(manifest.icons.map((i) => [i.src, i.purpose]), [["/icon-192.png", "any"], ["/icon-512.png", "any"], ["/icon-maskable-512.png", "maskable"]]);
  const you = await get("/you", cAsker);
  assert.ok(you.html.includes('data-account-row="appearance"') && you.text.includes("Appearance") && you.text.includes("Match your phone"), "the Appearance row on You (8.1)");
});

test("Now answers in pieces (11.5): the shell's piece has the header row, the tab bar, the + and the handoff, and it is on its way before the account or Now has been read", async () => {
  const r = await fetch(BASE + "/", { headers: { cookie: `dareful_session=${cAsker}` }, redirect: "manual" });
  assert.equal(r.status, 200);
  assert.ok(r.body, "a body to read");
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let html = "";
  let shell: string | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
    // The shell's piece is whole once the handoff has arrived: what the page held at that moment is what painted first.
    if (shell === null && html.includes("handOffOpening();});})();")) shell = html;
  }
  assert.ok(shell !== null, "the handoff arrived");
  assert.ok(/data-root-header=""/.test(shell) && /<nav aria-label="Main"/.test(shell) && /aria-label="Ask something"/.test(shell) && /data-got-a-code=""/.test(shell) && /id="opening"/.test(shell), "the header row, the tab bar, the + and the opening are in the first piece");
  assert.ok(/data-now-waiting=/.test(shell) && /data-now-hint="(full|empty)"/.test(shell), "with nothing standing in for the content, and what the phone remembers of it");
  assert.ok(!/data-now="(full|empty|out)"/.test(shell), "and nothing of Now itself: the shell never waited on the account or on Now");
  assert.ok(/data-now="full"/.test(html) && html.includes("Needs you"), "the content arrives after, into it");
  // Every other screen still answers once, so a missing one is a 404 and not a page that says so (5.3).
  assert.equal((await get(`/m/${draftId}`, cFriend)).status, 404, "someone else's draft");
  const people = await fetch(BASE + "/people", { headers: { cookie: `dareful_session=${cAsker}` } });
  const whole = await people.text();
  assert.ok(!/<template id="B:\d+"|\$RC\(/.test(whole), "People answers in one piece");
});

test("the opening goes and stays gone when the app starts after the handoff has taken it away, signed out and signed in, and nothing on the page breaks", { skip: chromeIsHere() ? false : "no Chrome on this machine to watch the page in" }, async (t) => {
  // The reading (docs/testing.md, the logo round): on this machine's own network, when the signed-in shell painted and when the app started.
  const runs = await watchOpening({ base: BASE, path: "/", session: cAsker, runs: 3 });
  t.diagnostic(`signed in: ${JSON.stringify(runs.map((r) => ({ firstByte: r.firstByte, firstPaint: r.firstPaint, shell: r.shell, gone: r.removed, app: r.live })))}`);
  for (const r of runs) assert.ok(r.shell !== null && !r.opening && r.errors.filter((e) => /Hydration failed|React error #418|NotFoundError/.test(e)).length === 0, "the shell painted and the opening left");
  // A phone's network: the scripts arrive long after the first screen's shell has painted and the opening has left the page.
  for (const [who, session] of [["signed out", undefined], ["signed in", cAsker]] as const) {
    const [run] = await watchOpening({ base: BASE, path: "/", latency: 250, mbps: 40, wait: 9000, runs: 1, ...(session ? { session } : {}) });
    assert.ok(run, who);
    const broke = run.errors.filter((e) => /Hydration failed|React error #418|NotFoundError|insertBefore|removeChild|didn't match/.test(e));
    assert.deepEqual(broke, [], `${who}: the app started without finding the page changed under it`);
    assert.ok(run.shell !== null && run.removed !== null && run.live !== null && run.live > run.removed, `${who}: the app started after the opening had gone (shell ${run.shell}, gone ${run.removed}, app ${run.live})`);
    assert.ok(!run.opening && run.dressed, `${who}: the opening never comes back, and the document stays dressed`);
    if (session) assert.ok(run.tabBar && run.now === "full", "signed in: the tab bar and Now's content are on the page");
    else assert.ok(run.wordmark && !run.tabBar, "signed out: the wordmark and no bar");
  }
});

test("a row on Now carries its shell (9.4): the market's ink, mark, state, clock and question on the link, and the band it opens into is named for the transition (9.7)", async () => {
  const { parseShell } = await import("@/lib/ui/shell");
  const r = await get("/", cAsker);
  const links = r.html.match(/<a [^>]*data-shell="[^"]*"[^>]*>/g) ?? [];
  assert.ok(links.length >= 1, "a question row carries a shell");
  const raw = /data-shell="([^"]*)"/.exec(links[0] as string)?.[1] ?? "";
  const shell = parseShell(raw.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&"));
  assert.ok(shell && shell.kind === "market" && shell.question.length > 0 && shell.clock !== undefined, "the shell parses back");
  assert.ok((links[0] as string).includes('data-press="row"') && (links[0] as string).includes("press-row"), "the row presses to the ground of its place (9.4)");
  assert.ok(r.html.includes("data-stamp"), "the stamp the ink travels from");
  const m = await get(`/m/${marketId}`, cAsker);
  assert.ok(/data-band="" style="view-transition-name:market-ink"/.test(m.html) && m.html.includes("view-transition-name:market-words"), "the band's box and its words are named (9.7)");
  assert.ok(m.html.includes('data-ink-root="') && /html\{--ground:#[0-9A-Fa-f]{6};/.test(m.html) && m.html.includes('html[data-theme="light"]{--ground:'), "the market's ink on the document root, in both themes (8.4, 9.3)");
  assert.ok(!/<div class="grain flex flex-1 flex-col" style="--ground/.test(m.html), "the page paints no ground of its own: the shell's grain sits over html's");
  assert.ok(m.html.includes('data-arrive="fade"'), "a market fades in under its shell");
});

test("the write-up streams (9.8): the route answers a signed-out visitor with nothing, a bad line with a refusal, and never a page", async () => {
  const out = await fetch(`${BASE}/api/m/write-up`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ line: "Does he?" }) });
  assert.equal(out.status, 401);
  const bad = await fetch(`${BASE}/api/m/write-up`, { method: "POST", headers: { "content-type": "application/json", cookie: `dareful_session=${cAsker}` }, body: JSON.stringify({ line: "x" }) });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, "Ask it in a line.");
});

test("the roots' header rows and the information icon (10.1, 10.3): the icon at the top right of every screen it lists, the screen's own control beside it, and none on a screen a moment rather than a place", async () => {
  for (const [path, cookie, key] of [["/", cAsker, "now"], ["/on", cAsker, "whats-on"], ["/people", cAsker, "people"], ["/you", cAsker, "you"], [`/m/${marketId}`, cFriend, "market-open"], [`/p/${friend.user.id}`, cAsker, "person"], ["/join", cAsker, "code"], ["/welcome", cU, "claimant"], ["/m/new", cAsker, "ask-question"]] as const) {
    const r = await get(path, cookie);
    assert.equal(r.status, 200, path);
    const icons = r.dom.match(/data-info-icon="[^"]+"/g) ?? [];
    // Now's shell goes out before Now has been read (11.5), so it carries the live screen's icon and first run's, and the stylesheet shows the one the content calls for.
    assert.deepEqual(icons, path === "/" ? ['data-info-icon="now"', 'data-info-icon="now-first-run"'] : [`data-info-icon="${key}"`], `${path} carries one icon, for its own sheet`);
    assert.ok(r.html.includes('aria-label="What you can do here"') && r.html.includes('aria-haspopup="dialog"'), `${path}: named, and it opens a dialog`);
  }
  const now = await get("/", cAsker);
  assert.ok(/data-root-header=""[\s\S]*?data-got-a-code=""[\s\S]*?data-info-icon="now"/.test(now.html), "on Now, Got a code? sits directly left of the icon in the 56px header row");
  const market = await get(`/m/${marketId}`, cAsker);
  assert.ok(/aria-label="More"[\s\S]*?data-info-icon="market-open"/.test(market.html), "on a market, More sits beside the icon");
  const pass = await get(`/m/${marketId}/pass`, cAsker);
  assert.ok(pass.status !== 200 || !pass.html.includes("data-info-icon"), "pass the phone's steps carry no icon (10.1)");
});

test("the corrections of Round D: the count line's empty state sits under the app's read on every ballot, and never as a second header", async () => {
  const r = await get(`/m/${feedVotingId}`, cRae);
  assert.ok(r.text.includes("Nobody has said yet. Two of you and it settles."), "the empty state on the score's ballot");
  assert.ok(!r.html.includes('data-count-line=""') || r.html.includes("The app leans"), "under the app's read only; the score speaks on its card (3.35)");
});

// ------------------------------------------------------------------------------------------------- copy

test("the banned-word scan can see a banned word when one is there", () => {
  assert.ok(BANNED.test("you have an outstanding balance"));
  assert.ok(!BANNED.test("Alex got this one. Squared up."));
});

const BANNED = /\b(owes?|owed|debt|balance|outstanding|overdue|wallet|transaction|gas|signature|chain|token)\b/i;
for (const [name, path, who] of [
  ["the claim landing page", () => `/c/${linkToken}`, () => undefined],
  ["the first screen", () => "/welcome", () => cU],
  ["the ghost page", () => `/p/c/${gabe}`, () => cA],
  ["home", () => "/", () => cA],
  ["the people tab", () => "/people", () => cA],
  ["the you tab", () => "/you", () => cA],
  ["the joining screen", () => "/join", () => cA],
  ["the signed-out cover page", () => `/o/${boundId}`, () => undefined],
  ["the cover page", () => `/o/${boundId}`, () => cU],
  ["a question, before picking", () => `/m/${marketId}`, () => cFriend],
  ["a question, once in", () => `/m/${marketId}`, () => cAsker],
  ["the ask screen", () => "/m/new", () => cAsker],
] as const) {
  test(`no banned word on ${name}`, async () => {
    const r = await get(path(), who());
    assert.equal(r.status, 200);
    const m = BANNED.exec(r.text);
    assert.equal(m, null, m ? `found "${m[0]}" in: ...${r.text.slice(Math.max(0, m.index - 40), m.index + 40)}...` : "");
  });
}

// --------------------------------------------------------------------------------------------- pick one

test("a pick-one question's sheet holds the answers as rows for someone not in, and the entry line names the answer for someone who is", async () => {
  const r = await get(`/m/${pickOpenId}`, cFriend);
  assert.equal(r.status, 200);
  assert.ok(r.html.includes("data-pick-one-entry") && r.text.includes("Pick one") && r.text.includes("Pick an answer"), "the rows in the sheet and the disabled primary (3.30)");
  for (const a of ["John", "Nobody"]) assert.ok(r.text.includes(a), `the answer ${a}, in the asker's order`);
  assert.ok(r.text.includes("You"), "the friend is one of the answers, and reads as You");
  assert.ok(!r.text.includes("What are the odds") && !r.html.includes("What are the odds, in percent"), "no odds line on a pick-one question (3.30): neither its header nor its slider");
  const mine = await get(`/m/${pickOpenId}`, cAsker);
  assert.ok(mine.text.includes("You’re in: John") && mine.text.includes("Where the stake sits"), "the entry line names the answer and nothing else (4.6)");
  assert.ok(mine.text.includes("Dev"), "a person answer reads by their name to everyone else");
  assert.ok(!/\b\d+%/.test(mine.text.replace(/100% of|0%/g, "")), "shares print from the third entry (3.31)");
  assert.ok(!mine.html.includes("data-pick-one-entry") && !/<section aria-label="Your number"/.test(mine.html), "once in, no sheet at all (3.24)");
  assert.ok(r.html.includes('data-pick-one-bar=""') && r.text.includes("3 answers"), "the sheet's bar: Pick one and the count of answers (3.30)");
});

test("a blind pick-one question shows everyone's bars once you're in, with your pick final, and nothing to someone not in", async () => {
  const r = await get(`/m/${pickBlindId}`, cAsker);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes("You’re in: Nobody") && r.text.includes("· final") && !r.text.includes("Numbers show when everyone’s in"), "the entry line, final, and no lock chip (3.31)");
  assert.ok(r.text.includes("Where the stake sits") && r.html.includes("Who gets there first?"), "the bars, with everyone in so far");
  const notIn = await get(`/m/${pickBlindId}`, cFriend);
  assert.ok(!notIn.text.includes("Where the stake sits") && notIn.html.includes("data-blind-line"), "nothing before you're in, and the line above the primary");
});

test("a locked pick-one question offers the answers as equal wells, and voting names the claimed answer in the count line", async () => {
  const locked = await get(`/m/${pickLockedId}`, cFriend);
  assert.equal(locked.status, 200);
  assert.ok(locked.text.includes("When it’s clear, say what happened.") && locked.text.includes("Nobody can tell"), "closed, not yet known (3.24)");
  assert.ok(!/\bYes\b/.test(locked.text) && !/\bNo\b/.test(locked.text), "the wells are the answers, never Yes and No (3.24)");
  assert.ok(locked.text.includes("Where everyone landed") && locked.text.includes("John") && locked.text.includes("You"), "the picks, once locked, with the friend's own answer reading as You (3.30)");
  const lockedToNia = await get(`/m/${pickLockedId}`, cNia);
  assert.ok(lockedToNia.text.includes("Dev") && !lockedToNia.text.includes("You’re in: You"), "to the other person the person answer is their name");
  assert.ok(!locked.text.includes("What was it") && !locked.text.includes("Type what it was"), "never the number field");
  const voting = await get(`/m/${pickVotingId}`, cFriend);
  assert.equal(voting.status, 200);
  assert.ok(voting.text.includes("1 of 2 says You. One more and it settles.") || voting.text.includes("1 of 2 says Dev."), "the count line names the claimed answer, counted over the people in it (3.24; the first-contact round)");
  assert.ok(voting.text.includes("That’s right, You") || voting.text.includes("That’s right, Dev"), "the chalk repeats the answer");
  assert.ok(voting.text.includes("Not how I saw it"));
  assert.ok(voting.text.includes("Priya says you") || voting.text.includes("Priya says Dev"), "the claim card names the answer");
  const asNia = await get(`/m/${pickVotingId}`, cNia);
  assert.ok(asNia.status === 200 && !asNia.text.includes("One more and it settles.") && !asNia.text.includes("That’s right"), "someone in the set who never got in has no ballot and no count (the first-contact round)");
});

test("a settled pick-one question says the answer and who called it, shows everyone's pick with the called row washed, and never ranks", async () => {
  const r = await get(`/m/${pickSettledId}`, cAsker);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes("Dev, twenty minutes in.") || r.text.includes("Dev."), "the outcome names the answer (3.25)");
  assert.ok(r.text.includes("You called it. Nobody else did."), "who called it: everyone who picked the answer that happened");
  assert.ok(r.text.includes("Everyone’s pick") && r.html.includes("data-pick-one-rows"), "the rows replace closest first");
  assert.ok(!r.text.includes("Closest first"), "nothing to rank: everyone who called it scores the same");
  const rows = r.dom.split("data-pick-one-rows")[1] ?? "";
  assert.ok(rows.includes("bg-market-wash") && rows.includes("bg-chalk"), "the answer that happened takes the wash and the cream cap");
  assert.ok(r.text.includes("Who’s got who"), "then who's got who");
  const outsider = await get(`/m/${pickSettledId}`, cNia);
  assert.equal(outsider.status, 200);
  assert.ok(outsider.text.includes("Priya called it. Nobody else did.") && outsider.html.includes('data-share=""'), "the same screen to someone who wasn't in, with share on the row");
  assert.ok(!outsider.html.includes("data-empty-slot"));
});

test("a pick-one question's tiles carry the answers and who called it, and never a share", async () => {
  const asking = await marketTile(pickOpenId);
  assert.ok(asking?.kind === "ask" && asking.frame === "Pick one." && asking.answers?.length === 3, "the asking tile's frame line and the answers themselves (3.27)");
  assert.ok(asking?.kind === "ask" && asking.answers?.[1]?.person !== null && asking.answers?.[0]?.person === null, "a person answer wears their avatar, words wear none");
  const result = await marketTile(pickSettledId);
  assert.ok(result?.kind === "pick" && result.outcomeLine === "Dev." && result.rows.length === 3 && result.rows[1]?.called === true && result.rows[1]?.pickers.length === 1, "the result tile: the answer, the rows with their pickers, the called one washed");
  assert.ok(result?.kind === "pick" && result.line === "Priya called it. Nobody else did.");
  assert.ok(result?.kind === "pick" && result.rows.every((row) => !("share" in row)), "neither tile shows a share (3.27)");
  const png = await get(`/m/${pickSettledId}/opengraph-image`);
  assert.equal(png.status, 200);
  assert.equal(png.type, "image/png");
  const ask = await get(`/m/${pickOpenId}/opengraph-image`);
  assert.ok(ask.status === 200 && !ask.bytes.equals(png.bytes));
});

test("while a question is open, everyone the door admits sees the same slot and frame as after it ends, last on the screen, with every photo the moment it is added; someone who only opened the link sees none", async () => {
  const mine = await get(`/m/${windowId}`, cNia);
  assert.equal(mine.status, 200);
  assert.ok(mine.html.includes('data-open-photos=""') && mine.html.includes("data-media-frame") && mine.html.includes('data-add-tile=""'), "the frame with the add tile, once a photo is taken (3.39)");
  // The field round, part 2 (the owner's finding): the phone offers the camera and the library alike, open or ended.
  assert.ok(!mine.html.includes('capture="environment"'), "it offers the camera and the library alike");
  assert.ok(!mine.text.includes("Everyone sees these once it’s over.") && !mine.text.includes("Yours from tonight"), "no caption and no heading: the album is open the whole time (3.37, 3.39, amended 2026-09-27)");
  assert.ok(mine.html.includes(`/api/media/${windowPhotoId}`), "the photo taken, in the frame");
  assert.ok(mine.dom.indexOf('data-open-photos=""') > mine.dom.indexOf("Counts if"), "last on the screen, under the details");
  assert.ok(!mine.html.includes("data-take-photo"), "no camera button in a sheet: the slot is where the photos will land");
  const other = await get(`/m/${windowId}`, cFriend);
  assert.equal(other.status, 200);
  assert.ok(other.html.includes('data-open-photos=""') && other.html.includes("data-media-frame") && other.html.includes(`/api/media/${windowPhotoId}`) && other.html.includes("added by Nia"), "the other participant sees nia's photo the moment it is added, credited to her");
  assert.ok(other.html.includes('data-add-tile=""') && !other.html.includes("data-empty-slot"), "and can add to the same frame");
  const group = await get(`/m/${windowId}`, cRae);
  assert.equal(group.status, 200);
  assert.ok(group.html.includes('data-open-photos=""') && group.html.includes(`/api/media/${windowPhotoId}`), "someone in the group it was asked in, not yet in, sees the photo too");
  assert.ok(!group.html.includes('data-add-tile=""') && !group.html.includes("data-empty-slot") && !group.html.includes('capture="environment"'), "and cannot add: entering stays their only move on it");
  const notIn = await get(`/m/${marketId}`, cFriend);
  assert.equal(notIn.status, 200);
  assert.ok(!notIn.html.includes('data-open-photos=""') && !notIn.html.includes('capture="environment"') && !notIn.html.includes("data-empty-slot"), "with no photos and not in, no slot anywhere");
  // Someone who only opened the link: the link page for a visitor with no session, and a signed-in stranger.
  const link = await get(`/m/${windowId}`);
  assert.equal(link.status, 200);
  assert.ok(!link.html.includes("/api/media/") && !link.html.includes(windowPhotoId) && !link.html.includes("data-media-frame") && !link.html.includes("data-open-photos"), "the link page shows no photos");
  const stranger = await get(`/m/${windowId}`, cStranger);
  assert.ok(!stranger.html.includes(windowPhotoId) && !stranger.html.includes("data-open-photos"), "nor does a signed-in stranger's screen");
  // Through the vote: a memory on a market being called stays in the album, last on the screen, and the claim's clip stays on the claim card, not in a frame.
  const [planted] = await db.insert(schema.media).values({ dareId: evidenceMarketId, kind: "photo", role: "memory", storageKey: "frames/check-voting.jpg", width: 810, height: 1080, authorId: friend.user.id }).returning({ id: schema.media.id });
  try {
    const voting = await get(`/m/${evidenceMarketId}`, cAsker);
    assert.equal(voting.status, 200);
    assert.ok(voting.html.includes('data-open-photos=""') && voting.html.includes(`/api/media/${(planted as { id: string }).id}`), "the album through the vote");
    const album = voting.dom.split('data-open-photos=""')[1]?.split("</section>")[0] ?? "";
    assert.ok(album.includes("data-media-frame") && !album.includes(evidenceId), "the clip is not in the album's frame");
  } finally {
    await db.delete(schema.media).where(eq(schema.media.id, (planted as { id: string }).id));
  }
});

test("a photo taken while a question is open is served to the other participant and the group the moment it lands, and reads as nothing to someone who only opened the link", async () => {
  assert.equal((await get(`/api/media/${windowPhotoId}?size=thumb`, cStranger)).status, 404, "a stranger: not even that it exists");
  assert.equal((await get(`/api/media/${windowPhotoId}?size=thumb`)).status, 404, "signed out: nothing");
  for (const [who, cookie] of [["the person who took it", cNia], ["the other participant", cFriend], ["someone in the group", cRae]] as const) {
    const r = await get(`/api/media/${windowPhotoId}?size=thumb`, cookie);
    if (storageConfigured()) {
      assert.equal(r.status, 302, `${who} is sent to it`);
      assert.match(r.loc ?? "", /\/storage\/v1\/object\/sign\/media\/thumbs\//, "a signed URL into the private bucket");
    } else {
      assert.equal(r.status, 503);
    }
  }
});

test("a question from What's on: the two sides at the odds line's ends, a signed margin in the sides' words, the written rows in the details, and nothing that says spread or official", async () => {
  const r = await get(`/m/${feedOpenId}`, cFriend);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes(feedAway) && r.text.includes(feedHome), "the two teams");
  assert.ok(new RegExp(`<span>${feedAway}</span><span>Even</span><span>${feedHome}</span>`).test(r.html), "at the line's ends, the away side low, Even in the middle and the home side high (3.40)");
  assert.ok(r.html.includes(`data-team-stamp="${feedAwayAbbr}"`) && r.html.includes(`data-team-stamp="${feedHomeAbbr}"`), "a team stamp at each end, and no logo");
  assert.ok(!r.html.includes("teamlogos") && !r.html.includes("<img") , "no logo anywhere on it");
  assert.ok(r.text.includes("Question from") && r.text.includes("What’s on"), "the one extra details row (3.33)");
  assert.ok(r.text.includes("By the final score, once the game is over") && r.text.includes("The final score. If the two results we check disagree, it’s void."), "decided by the score, with the whole rule in the details (3.35)");
  assert.ok(r.html.includes("data-consent-line") && r.text.includes("If nobody votes, the final score settles it."), "the consent line in the entry sheet, directly above the primary (3.35, 4.9)");
  assert.ok(r.text.includes("If it’s a tie") && r.text.includes("It’s void."), "the tie row (3.40): void, since the deployed contract cannot score the middle");
  assert.ok(r.html.includes(`data-part-of="${feedGameId}"`) && r.text.includes(`Part of ${feedAway} at ${feedHome}`), "the row back to the game page (3.33)");
  assert.ok(r.text.includes("Slide to your prediction") && r.text.includes("I’m in: Even"), "before any touch: the thumb at even under the prompt, and the primary saying it (3.13 as amended 2026-10-04)");
  assert.ok(!/spread|official|moneyline|underdog|favourite/i.test(r.text), "never a sportsbook's word");
  const m = await get(`/m/${feedMarginId}`, cAsker);
  assert.equal(m.status, 200);
  assert.ok(m.text.includes(`You’re in at ${feedHome} by 3`), "the entry line in the sides' words, never the shifted number");
  const mf = await get(`/m/${feedMarginId}`, cFriend);
  assert.ok(mf.html.includes('data-team-line="margin"') && mf.text.includes(`${feedAway} by 35+`) && mf.text.includes("Tie") && mf.text.includes("Any margin. Tap the number to type one."), "the margin's line between the two teams, centred on a tie, for someone entering (3.40)");
  assert.ok(!/[+-]\d/.test(m.text.replace(/\d+:\d\d/g, "")), "never a plus or minus sign");
  assert.ok(m.text.includes("Scored on") && m.text.includes("or more scores nothing"), "the template's scale shown like an asker's");
  assert.ok(!m.text.includes("You’re in at 17"), "the stored figure is never shown");
  const ask = await get(`/m/new?template=${(await db.select({ templateId: schema.dares.templateId }).from(schema.dares).where(eq(schema.dares.id, feedOpenId)))[0]?.templateId}`, cAsker);
  assert.equal(ask.status, 200);
  assert.ok(ask.html.includes("data-from-whats-on") && ask.text.includes("From What’s on"), "the flow starts at who's in with the template's question");
  assert.ok(ask.text.includes("Who’s in?") && !ask.text.includes("Ask it in a line"), "no question step");
});

test("the ballot when a final score answers it: the source card where the claim card stands, the score's proposal to confirm in a tap, and the final score's ruling once it settled one", async () => {
  const r = await get(`/m/${feedVotingId}`, cRae);
  assert.equal(r.status, 200);
  assert.ok(r.html.includes("data-source-card") && r.text.includes("From the final score") && r.text.includes("The terms said the final score decides."), "the source card (3.35)");
  assert.ok(new RegExp(`${feedHome}\\s*24`).test(r.text) && new RegExp(`${feedAway}\\s*17`).test(r.text), "the two rows, team and number");
  assert.ok(!r.html.includes("says"), "no avatar and no says: the score is speaking, not a person");
  assert.ok(r.text.includes("Nobody has said yet. Two of you and it settles."), "the count line's empty state as the sheet's header (3.35, Round C part 2)");
  assert.ok(!r.text.includes(`From the final score: ${feedHome} 24, ${feedAway} 17.`), "the score speaks on the source card, not in the header");
  assert.ok(r.text.includes(`That’s right, the ${feedHome} won`), "the chalk names the outcome in the voter's voice and names the team (3.35)");
  assert.ok(r.html.includes(`data-team-stamp="${feedHomeAbbr}"`), "each row of the source card wears its team's stamp");
  assert.ok(!r.text.includes("Can’t agree?") && !r.text.includes("Let the tiebreaker call it"), "the final score is the tiebreaker: the model is never offered");
  const s = await get(`/m/${feedSettledId}`, cNia);
  assert.equal(s.status, 200);
  assert.ok(s.text.includes(`${feedHome} won.`) && !s.text.includes(`The ${feedHome} won.`), "the outcome in its own words: the team alone (3.33, 3.40)");
  assert.ok(!s.html.includes('data-ruling="feed"') && !s.text.includes("Settled by the tiebreaker everyone agreed to") && !s.text.includes("Nobody called it in time"), "no ruling card for a final score: its ending is the one caption line (3.35)");
  assert.ok(s.html.includes('data-feed-ending="agreed"') && s.text.includes("Decided by the final score, as the terms said. Nobody voted within a day."), "the ending's own line (3.35, Endings)");
  assert.ok(s.text.includes(`${feedHome} 24, ${feedAway} 17.`), "the final score as the settled line's caption (3.40)");
  assert.ok(s.text.includes("Closest first") && s.text.includes("Who’s got who"), "everything after follows as usual");
  assert.ok(new RegExp(`said ${feedHome} 70%`).test(s.text) || new RegExp(`said ${feedAway} 60%`).test(s.text), "closest first says a side, never a bare percent (3.7)");
});

test("What's on lists the games ahead one row each, with the two stamps and a start time, this person's own use named, and no number about anyone's belief", async () => {
  const r = await get("/on", cAsker);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes("What’s on") && !r.text.includes("Things everyone’s watching"), "the header, and no line under it: the games say what the tab is (3.32, 4.9)");
  assert.ok(r.html.includes(`data-game-row="${feedGameId}"`), "the game, one row, whatever it has questions about");
  assert.ok(r.html.includes(`data-team-stamp="${feedAwayAbbr}"`) && !r.html.includes("teamlogos"), "the stamps, never a logo");
  assert.ok(r.text.includes("You’re on this with the Question check"), "the asker's set has started it, so the row says so, as a sentence names the set (3.32), and opens that page");
  assert.ok(!/\d+%/.test(r.text) && !/most picked|odds|leaning/i.test(r.text), "nothing about what anyone thinks will happen");
  assert.ok(!r.html.includes("data-most-asked"), "one group is below the floor of ten: no Most asked");
  assert.ok(!r.html.includes(`data-game-row="${nightGameId}"`), "a game that has started has left the list");
  assert.ok(/<nav aria-label="Main"/.test(r.html) && (r.html.match(/aria-current="page"/g) ?? []).length === 1, "a root, with the bar");
  const stranger = await get("/on", cStranger);
  assert.ok(stranger.html.includes(`data-game-row="${feedGameId}"`) && !stranger.text.includes("You’re on this with") && !stranger.text.includes("Question check"), "nothing about any group the person is not in");
});

test("the game page: a header, one collapsed card per question with no number until you are in, the rest of the menu to add, and the start for someone on it with nobody", async () => {
  const friendly = await get(`/on/${feedGameId}?g=${feedGroupId}`, cFriend);
  assert.equal(friendly.status, 200);
  assert.ok(friendly.html.includes(`data-game-header="${feedGameId}"`) && friendly.text.includes(`${feedAway} at ${feedHome}`), "the header with the two teams");
  assert.ok(friendly.html.includes('data-game-card="home_wins"') && friendly.html.includes('data-game-card="margin"'), "one card per question the set is running");
  assert.ok(friendly.text.includes("Closes at kickoff · 1 of 2 in") && !/\d+%/.test(friendly.text) && !friendly.text.includes(" by 3"), "no numbers until you are in: not the asker's 70%, not the margin");
  assert.ok(friendly.html.includes("data-add-another") && friendly.text.includes("Total points") && friendly.text.includes("The first drive"), "the rest of the menu, as rows anyone in the group can add from");
  assert.ok(!/<nav aria-label="Main"/.test(friendly.html) && /aria-label="Back"/.test(friendly.html), "a task screen with back, not a root");
  const asker = await get(`/on/${feedGameId}?g=${feedGroupId}`, cAsker);
  assert.ok(asker.text.includes(`You’re in at ${feedHome} 70% · 1 of 2 in`) && asker.text.includes(`You’re in at ${feedHome} by 3`), "your own entry once you are in, in the market's words");
  // Who asked, as a sentence about the set (3.33), never the chip's label after a verb.
  assert.ok(asker.text.includes("You asked the Question check. Everything closes at kickoff."), "the header's caption, to the asker");
  assert.ok(friendly.text.includes("Priya asked the Question check. Everything closes at kickoff."), "and to someone she asked");
  // The who's-in row (3.42) with the game as the unit, in place of the two buttons: share and copy at its end, no code (a code is one question's), no list and no pass.
  for (const [who, page] of [["the asker", asker], ["someone not in yet", friendly]] as const) {
    assert.ok(page.html.includes('data-whos-in=""') && page.html.includes('data-share=""') && page.html.includes("data-copy="), `${who}: the row, with share and copy`);
    assert.ok(!page.text.includes("Send it to the chat") && !/<button[^>]*>\s*Copy\s*<\/button>/.test(page.html), `${who}: the old row is gone`);
    assert.ok(!page.html.includes('data-code=""') && !page.html.includes("data-whos-in-list") && !page.html.includes('data-pass-phone=""'), `${who}: no code, no list, no pass`);
    assert.ok(/data-whos-in-count=""[^>]*>\s*1 of 2 in/.test(page.html) && page.html.includes('data-holdouts="1"'), `${who}: one of the set's two is in on something, the other follows the stack dashed`);
  }
  const shareOf = (html: string) => /<button[^>]*data-share=""[^>]*>/.exec(html)?.[0] ?? "";
  assert.ok(shareOf(asker.html).includes("bg-chalk") && !shareOf(friendly.html).includes("bg-chalk"), "share is the chalk for the asker while nobody else is in, and an icon for everyone else");
  const stranger = await get(`/on/${feedGameId}`, cStranger);
  assert.ok(stranger.html.includes("data-game-menu") && stranger.text.includes("What to ask") && stranger.text.includes("Who wins") && !stranger.text.includes("Your friends see only"), "with none of their sets on it: the start, with the menu and no caption under it (4.9)");
  assert.ok(/role="checkbox" aria-checked="true"/.test(stranger.html), "Who wins is ticked as the page opens");
  const add = await get(`/on/${feedGameId}?g=${feedGroupId}&add=total`, cFriend);
  assert.ok(add.html.includes('data-game-terms="total"') && add.html.includes("data-game-stakes") && add.html.includes("data-consent-line") && add.text.includes("At kickoff,"), "adding one: the terms step alone, its rows, the one Stakes card and the consent line");
  const signedOut = await get(`/on/${feedGameId}/${feedGroupId}`);
  assert.ok(signedOut.status === 200 && signedOut.text.includes(`${feedAway} at ${feedHome}`) && !signedOut.text.includes("Question check") && !signedOut.text.includes("70%"), "a pasted link, signed out: the game and nothing about who is on it");
  assert.ok(signedOut.html.includes('data-game-questions=""') && signedOut.html.includes(`href="/m/${feedOpenId}"`) && signedOut.html.includes(`href="/m/${feedMarginId}"`) && signedOut.text.includes("Sign in"), "with the set's questions, each opening its own screen, and the way to sign in");
});

test("a game's link tile names who asked by first name, says each question by the menu's short name, and is drawn from the game", async () => {
  // What the tile is drawn from (3.27, amended 2026-09-29): the asker's first name and nothing else, the two teams, the menu's short
  // names as rows (never the question itself, never clipped), and the absolute close time. Before the fix the rows were the questions
  // clipped at 40 characters, two lines each, and the third ended "toge…".
  const tile = await gameTile(feedGameId, feedGroupId);
  assert.ok(tile?.kind === "game", "the game tile, not a question's");
  assert.equal(tile.asker.name, "Priya", "who asked, by first name and nothing else");
  assert.deepEqual(tile.questions, ["Who wins", "By how much"], "the menu's short names, in the menu's order");
  for (const q of tile.questions) assert.ok(!q.includes("…") && !q.includes("?") && !q.includes(feedAway) && !q.includes(feedHome), `"${q}" is a row, never the question and never clipped`);
  assert.deepEqual([tile.away.abbr, tile.home.abbr, tile.away.name, tile.home.name], [feedAwayAbbr, feedHomeAbbr, feedAway, feedHome], "the two stamps, away then home (3.40), with the names the two serif lines are drawn from");
  assert.ok(tile.closes?.startsWith("Closes "), "an absolute close time while the game is ahead");
  assert.ok(!("name" in tile), "no name of its own: the two lines are drawn from the teams");
  // The route: a PNG of the tile's size, and a different picture from the plain card.
  const r = await get(`/on/${feedGameId}/${feedGroupId}/opengraph-image`);
  assert.equal(r.status, 200);
  assert.equal(r.type, "image/png");
  assert.deepEqual([r.bytes.readUInt32BE(16), r.bytes.readUInt32BE(20)], [1200, 630], "the picture is 1200 by 630, what a chat shows whole");
  const plain = await get(`/on/00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000000/opengraph-image`);
  assert.ok(!r.bytes.equals(plain.bytes) && r.bytes.length > 10_000, "a drawn tile, not the plain card");
});

test("a game's link opened signed in by someone not in its set is that set's questions, each opening its own screen: never the start, and never another set's page", async () => {
  // A stranger to the set, on the game with nobody: before the fix this was "Start a game" with Who wins ticked, and three taps made a second set.
  for (const path of [`/on/${feedGameId}/${feedGroupId}`, `/on/${feedGameId}?g=${feedGroupId}`]) {
    const r = await get(path, cStranger);
    assert.equal(r.status, 200, path);
    assert.ok(r.html.includes('data-game-questions=""') && r.html.includes(`href="/m/${feedOpenId}"`) && r.html.includes(`href="/m/${feedMarginId}"`), `${path}: the link's set's questions, each opening its own screen`);
    assert.ok(!r.html.includes("data-game-menu") && !r.text.includes("What to ask") && !r.text.includes("Start a game"), `${path}: never the start`);
    assert.ok(/aria-label="Back"/.test(r.html) && !r.text.includes("Sign in"), `${path}: signed in it has Back, and nothing about signing in`);
    assert.ok(!/\d+%/.test(r.text) && !r.text.includes("1 of 2 in") && !r.text.includes("Question check") && !r.html.includes('data-whos-in=""') && !r.html.includes("data-add-another"), `${path}: nothing about who is on it or at what, and nothing to add or send before they are in`);
    assert.ok(r.text.includes("Everything closes at kickoff."), `${path}: the game is ahead`);
  }
  assert.equal((await db.select({ groupId: schema.groupMembers.groupId }).from(schema.groupMembers).where(and(eq(schema.groupMembers.groupId, feedGroupId), eq(schema.groupMembers.userId, stranger.user.id)))).length, 0, "opening the link seats nobody: the join is a tap on the question they open");
  // Someone on the same game with a set of her own: the link is still the link's set, never her own page.
  const rae = await get(`/on/${feedGameId}/${feedGroupId}`, cRae);
  assert.ok(rae.html.includes('data-game-questions=""') && rae.html.includes(`href="/m/${feedOpenId}"`), "the link's set's questions");
  assert.ok(!rae.html.includes(`/m/${feedVotingId}"`) && !rae.html.includes(`/m/${feedSettledId}"`) && !rae.html.includes("data-game-cards"), "and nothing of her own set's page");
  // Her own set's address is still her own set's page, and with no set named the game opens as it did.
  const own = await get(`/on/${feedGameId}?g=${nightGroupId}`, cRae);
  assert.ok(own.html.includes("data-game-cards") && !own.html.includes('data-game-questions=""'), "a set she is in: its page");
  assert.ok((await get(`/on/${feedGameId}`, cStranger)).html.includes("data-game-menu"), "no set named, on it with nobody: the start");
});

test("the sets on a game, in sentences: a set of only the asker, a name that can't take the, the chips named for what they switch, and a called-off question gone from the page", async () => {
  // Someone new with three sets on the recorded game, asked in this order: one whose only question was called off, one nobody else is in yet, and one named with a possessive.
  const noor = await tempSigner("Noor Haddad");
  const cNoor = await cookieFor(noor.user.id);
  const [tpl] = await db.select().from(schema.publicQuestions).where(and(eq(schema.publicQuestions.gameId, feedGameId), eq(schema.publicQuestions.key, "home_wins")));
  const open = async (groupId: string) => {
    const usd = await ensureUsd(groupId, noor.user.id);
    const d0 = await markets.draftFromTemplate({ templateId: (tpl as { id: string }).id, creatorId: noor.user.id, groupId, denomId: usd.id });
    return markets.openMarket(d0.id, noor.user.id, await noor.ledger.signTypedData(markets.createTypedData(d0)));
  };
  const off = await createOccasionGroup(noor.user.id);
  const alone = await createOccasionGroup(noor.user.id);
  const named = await createGroup({ name: "Papa’s birthday", createdBy: noor.user.id });
  for (const g of [off, alone, named]) track.group(g.id);
  const offId = (await open(off.id)).id;
  await db.update(schema.dares).set({ lockedAt: new Date(), resolvedAt: new Date(), resolvedBy: "removed", resolvedOutcome: markets.VOID_OUTCOME }).where(eq(schema.dares.id, offId));
  const aloneId = (await open(alone.id)).id;
  const namedId = (await open(named.id)).id;

  const one = await get(`/on/${feedGameId}?g=${alone.id}`, cNoor);
  assert.equal(one.status, 200);
  assert.ok(one.text.includes("You asked. Everything closes at kickoff.") && !one.text.includes("asked Just you"), "a set of only the asker: nothing after asked, and never the chip's label after the verb");
  assert.ok(one.html.includes(`href="/m/${aloneId}"`) && /data-whos-in-count=""[^>]*>\s*Nobody’s in yet/.test(one.html), "the asker starts out in nothing: the row says nobody's in yet");
  // The question's own screen for its asker before anyone is in (a game opens every question with nobody in): never a count of zero (3.14), and no second sentence about where nobody landed.
  // Since the first-contact round the asker has the who's-in row from creation (share before entering), so the count is the row's.
  const zero = await get(`/m/${aloneId}`, cNoor);
  const beforeIn = /<p[^>]*data-whos-in-count=""[^>]*>[\s\S]*?<\/p>/.exec(zero.html)?.[0] ?? "";
  assert.ok(zero.status === 200 && beforeIn.includes("Nobody’s in yet.") && !beforeIn.includes("0 of") && !zero.text.includes("Where they landed"), "before you're in with nobody in: one sentence, and never a zero");
  assert.ok((/<button[^>]*data-share=""[^>]*>/.exec(one.html)?.[0] ?? "").includes("bg-chalk"), "and sending it is the chalk");
  const chips = /<div[^>]*role="group"[^>]*aria-label="Who you’re on this with"[^>]*>([\s\S]*?)<\/div>/.exec(one.html)?.[1] ?? "";
  assert.ok(chips.includes(`/on/${feedGameId}?g=${alone.id}`) && chips.includes(`/on/${feedGameId}?g=${named.id}`), "the chips that switch sets, in a group with a name a screen reader says");
  assert.ok(!one.html.includes("Which set of people") && !chips.includes(off.id), "never the design's own word, and no chip for the set whose only question was called off");
  const poss = await get(`/on/${feedGameId}?g=${named.id}`, cNoor);
  assert.ok(poss.text.includes("You asked · Papa’s birthday. Everything closes at kickoff.") && !poss.text.includes("the Papa’s"), "a possessive can't take the (3.38)");
  // Called off: it never happened. Its set's address is not its page, its card is on no page, and What's on names the most recent set that stands.
  const gone = await get(`/on/${feedGameId}?g=${off.id}`, cNoor);
  assert.ok(gone.status === 200 && !gone.html.includes(`/m/${offId}"`) && gone.html.includes(`href="/m/${namedId}"`), "the address of the set with nothing standing opens the most recent set that has");
  const tab = await get("/on", cNoor);
  assert.ok(tab.text.includes("You’re on this · Papa’s birthday") && !tab.text.includes("You’re on this with Papa"), "the row, for a name that can't take the");
  // Someone in the set who is not the asker, before anyone is in: the line under the stack is one sentence, never a zero.
  const omar = await tempSigner("Omar Haddad");
  await db.insert(schema.groupMembers).values({ groupId: named.id, userId: omar.user.id });
  const theirs = await get(`/m/${namedId}`, await cookieFor(omar.user.id));
  const friendsLine = /<section[^>]*data-friends-in=""[^>]*>[\s\S]*?<\/section>/.exec(theirs.html)?.[0] ?? "";
  assert.ok(theirs.status === 200 && friendsLine.includes("Nobody’s in yet.") && !friendsLine.includes("0 friends") && !friendsLine.includes("Where they landed"), "for someone else in the set too: one sentence, never a zero");
});

test("the asker line is a sentence about the set on every screen that has one, and a row's shell says what the screen will say", async () => {
  const { parseShell } = await import("@/lib/ui/shell");
  const mine = await get(`/m/${marketId}`, cAsker);
  const theirs = await get(`/m/${marketId}`, cFriend);
  assert.ok(mine.text.includes("You asked the Question check") && theirs.text.includes("Priya asked the Question check"), "the market's band");
  // The header is Back, More and the icon (10.3): no context chip, since the band already names the set (3.19).
  const bar = /<header[^>]*data-top-bar=""[^>]*>[\s\S]*?<\/header>/.exec(mine.html)?.[0] ?? "";
  assert.ok(bar.length > 0 && !bar.includes("Question check"), "the market's header carries no chip with the set's name");
  assert.ok((await get(`/m/${draftId}`, cAsker)).text.includes("For the Question check"), "a draft's band (3.25)");
  assert.ok((await get(`/m/${marketId}/pass`, cAsker)).text.includes("Priya asked the Question check"), "the friend's screen in pass the phone: a first name, never You");
  // The shell a row on Now draws before the screen arrives (9.4) carries the words the screen then says, whoever is looking and whatever the set.
  for (const [who, cookie] of [["the asker", cAsker], ["someone she asked", cFriend]] as const) {
    const now = await get("/", cookie);
    const shells = (now.html.match(/<a [^>]*data-shell="[^"]*"[^>]*>/g) ?? []).map((a) => parseShell((/data-shell="([^"]*)"/.exec(a)?.[1] ?? "").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&"))).flatMap((x) => (x && x.kind === "market" && x.asker ? [{ id: x.id, line: x.asker.line }] : []));
    assert.ok(shells.length >= 1, `${who}: a row's shell carries who asked`);
    for (const x of shells.slice(0, 3)) {
      assert.ok(!/Just you|asked you two|\d+ more$/.test(x.line), `${who}: never the chip's label: "${x.line}"`);
      assert.ok((await get(`/m/${x.id}`, cookie)).text.includes(x.line.replace(/'/g, "’")), `${who}: the screen says what the shell said: "${x.line}"`);
    }
  }
});

test("once the game is over its page is the night: the final score as the title, the settled cards, who's got who across the game, and the photo move; Now and a timeline carry a game as one row and one story", async () => {
  const night = await get(`/on/${nightGameId}?g=${nightGroupId}`, cNia);
  assert.equal(night.status, 200);
  assert.ok(night.html.includes("data-game-night"), "the night, not the start");
  const home = (await db.select({ homeShort: schema.sportsGames.homeShort, awayShort: schema.sportsGames.awayShort }).from(schema.sportsGames).where(eq(schema.sportsGames.id, nightGameId)))[0]!;
  assert.ok(night.text.includes(`${home.homeShort} 24, ${home.awayShort} 17.`), "the final score in serif where the game's name was");
  assert.ok(night.html.includes('data-card-state="resolved"') && night.text.includes(`${home.homeShort} won · you were closest`) && night.text.includes("41 points · you were off by 3"), "the settled cards, each with its outcome and your line");
  assert.ok(night.text.includes("Questions") && !night.html.includes("data-add-another"), "nothing left to add");
  assert.ok((night.html.includes('data-empty-slot=""') || night.html.includes('data-add-tile=""')) && !night.html.includes("data-add-photos"), "no sheet: the slot, or the add tile ending the night's strip (3.37)");
  // Now: the two questions in one set are one row in Just happened, with the final score.
  const now = await get("/", cNia);
  assert.ok(now.html.includes("data-game-happened") && now.text.includes(`Final: ${home.homeShort} 24, ${home.awayShort} 17`), "one row for the game, never one per question (4.7)");
  // A timeline: one story for the night between the two of them, its questions inside it, the consequences summed across the game.
  const rae = await db.select({ id: schema.dareVotes.userId }).from(schema.dareVotes).limit(0);
  void rae;
  const raeId = (await db.select({ userId: schema.groupMembers.userId }).from(schema.groupMembers).where(and(eq(schema.groupMembers.groupId, nightGroupId), sql`${schema.groupMembers.userId} <> ${nia.user.id}`)))[0]!.userId as string;
  const story = await get(`/p/${raeId}`, cNia);
  assert.ok(story.html.includes(`data-game-story="${nightGameId}"`) && story.text.includes("What’s on ·") && story.text.includes(`${home.homeShort} 24, ${home.awayShort} 17.`), "the game as one story (3.4)");
  assert.equal((story.html.match(new RegExp(`data-game-story="${nightGameId}"`, "g")) ?? []).length, 1, "one story for the game, not one per question");
  assert.ok(!story.html.includes(`/m/${(await db.select({ id: schema.dares.id }).from(schema.dares).where(and(eq(schema.dares.groupId, nightGroupId), eq(schema.dares.resolvedOutcome, 41n))))[0]?.id}"`), "neither question has a story of its own");
  assert.ok(story.text.includes("Nothing changes hands between you.") || story.text.includes("across the game"), "the consequences between the two, added up across the game");
});

test("asking offers pick one beside yes or no and a number", async () => {
  const r = await get("/m/new", cAsker);
  assert.ok(r.text.includes("Pick one"), "the third chip (3.29)");
});

test("holdouts: with others in and some still out the count says both numbers and the asker's close names who it leaves out; the close is called closing everywhere", async () => {
  // Nia's window question: nia and the friend in, Rae asked and not in.
  const r = await get(`/m/${windowId}`, cNia);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes("2 of 3 in") && r.html.includes('data-holdouts="1"'), "the count names both numbers (3.42)");
  assert.ok(r.html.includes('data-close-early=""') && r.text.includes("Close it with 2") && !r.text.includes("Lock it in") && !r.text.includes("It takes two to lock"), "the asker's tertiary, in the words of the close");
  const notAsker = await get(`/m/${windowId}`, cFriend);
  assert.ok(!notAsker.html.includes('data-close-early=""') && notAsker.text.includes("2 of 3 in"), "only the asker closes early; everyone in sees the count");
  const alone = await get(`/m/${marketId}`, cAsker);
  assert.ok(alone.text.includes("1 of 2 in") && alone.html.includes('data-holdouts="1"') && !alone.html.includes('data-close-early=""'), "alone with someone named: the holdouts rule, and nothing to close with");
  // "Just you so far" only when nobody was named (ruled 2026-09-27): a question in a set of one.
  const solo = await createGroup({ name: "Nobody named (check)", createdBy: asker.user.id });
  track.group(solo.id);
  const soloUsd = await ensureUsd(solo.id, asker.user.id);
  const s0 = await markets.draftMarket({ creatorId: asker.user.id, groupId: solo.id, denomId: soloUsd.id, title: "Does the solo question stay just you?", termsText: "Yes if nobody was named.", resolvesBy: new Date(Date.now() + 86_400_000) });
  const sd = await markets.openMarket(s0.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(s0)));
  await markets.enterMarket({ dareId: sd.id, userId: asker.user.id, stake: 500n, value: 6000n, signature: await asker.ledger.signTypedData(markets.enterTypedData(sd, 500n, 6000n)) });
  const justYou = await get(`/m/${sd.id}`, cAsker);
  assert.ok(justYou.text.includes("Just you so far") && !justYou.html.includes("data-holdouts=") && /data-share=""[^>]*bg-chalk/.test(justYou.html) && !justYou.html.includes('data-nudge=""'), "nobody named: just you so far, share the chalk, and nobody to nudge");
});

test("handing the phone over: the fourth icon for someone in while open, the friend's screen with nothing of anyone's number on the host's session, no way in for anyone else, and the friend's entry line naming whose phone; a blind one withdrawable", async () => {
  // The fourth icon: the asker is in the kettle question while it is open; the friend is not in; a locked one has none.
  const asker = await get(`/m/${marketId}`, cAsker);
  assert.ok(asker.html.includes('data-pass-phone=""') && asker.html.includes('aria-label="Pass the phone"'), "the fourth icon, once in and while open (3.42, 3.45)");
  const notIn = await get(`/m/${marketId}`, cFriend);
  assert.ok(!notIn.html.includes('data-pass-phone=""') && notIn.html.includes('data-joining-as=""') && /Joining as \w+/.test(notIn.text) && notIn.text.includes("Not you?"), "not in: no icon, and 'Joining as Sam · Not you?' under the primary (3.17, frame 7)");
  assert.ok(!asker.html.includes('data-joining-as=""'), "once in, nothing about joining");
  const locked = await get(`/m/${feedVotingId}`, cNia);
  assert.ok(!locked.html.includes('data-pass-phone=""'), "closed: nothing to hand over");
  // The friend's screen, on the host's session: the band, two facts and the entry sheet, and nothing of the host's number.
  const pass = await get(`/m/${marketId}/pass`, cAsker);
  assert.equal(pass.status, 200);
  assert.ok(pass.html.includes('data-pass-screen=""') && pass.html.includes('data-on-phone=""') && /On \w+’s phone/.test(pass.text) && pass.html.includes('data-pass-band=""'), "the friend's screen, named for whose phone it is");
  assert.ok(pass.text.includes("Slide to your prediction") && pass.text.includes("How it works") && !pass.text.includes("If it’s unclear"), "the entry sheet and the two facts");
  for (const leak of ["83%", "8300", "You’re in at", "Where the stake sits", 'data-whos-in=""', "buckets", "Just you so far", "1 of 2 in"]) assert.ok(!pass.html.includes(leak), `nothing of anyone's answer on the friend's screen: "${leak}"`);
  const friendPass = await get(`/m/${marketId}/pass`, cFriend);
  assert.ok((friendPass.status === 307 || friendPass.status === 302) && friendPass.loc === `/m/${marketId}`, "someone not in cannot hand the phone over");
  const strangerPass = await get(`/m/${marketId}/pass`, cStranger);
  assert.ok(strangerPass.status === 307 || strangerPass.status === 302, "nor a stranger");
  // An entry made on a friend's phone (3.45, frame 7): the caption names whose, and on a blind market it is final and withdrawable.
  const groupId = (await db.select({ groupId: schema.dares.groupId }).from(schema.dares).where(eq(schema.dares.id, windowId)))[0]?.groupId as string;
  const denomId = (await db.select({ denomId: schema.dares.denomId }).from(schema.dares).where(eq(schema.dares.id, windowId)))[0]?.denomId as string;
  const mk = async (revealMode: "open" | "blind") => {
    const d0 = await markets.draftMarket({ creatorId: nia.user.id, groupId, denomId, title: `Does the handed entry say whose phone? (${revealMode})`, termsText: "Yes if it says.", resolvesBy: new Date(Date.now() + 86_400_000), revealMode });
    const d = await markets.openMarket(d0.id, nia.user.id, await nia.ledger.signTypedData(markets.createTypedData(d0)));
    await markets.enterMarket({ dareId: d.id, userId: nia.user.id, stake: 500n, value: 7000n, signature: await nia.ledger.signTypedData(markets.enterTypedData(d, 500n, 7000n)) });
    await markets.enterMarket({ dareId: d.id, userId: friend.user.id, stake: 500n, value: 4000n, signature: await friend.ledger.signTypedData(markets.enterTypedData(d, 500n, 4000n)), enteredBy: nia.user.id });
    return d;
  };
  const open = await mk("open");
  const mine = await get(`/m/${open.id}`, cFriend);
  assert.ok(mine.text.includes(`from ${nia.user.displayName.split(" ")[0]}’s phone`) && mine.text.includes("yours to change until") && !mine.html.includes('data-withdraw-entry=""'), "whose phone, and hers to change");
  const blind = await mk("blind");
  const final = await get(`/m/${blind.id}`, cFriend);
  assert.ok(final.text.includes("· final") && final.html.includes('data-withdraw-entry=""') && final.text.includes("Withdraw it"), "blind: final, and withdrawable from her own phone");
  const hostView = await get(`/m/${blind.id}`, cNia);
  assert.ok(!hostView.html.includes('data-withdraw-entry=""'), "the host's own entry is not withdrawable");
});

test("a revoked or malformed link is the code screen with a form-level line, signed in or not, and the link page carries two facts", async () => {
  const dead = "00000000-0000-4000-8000-000000000000";
  for (const cookie of [cAsker, undefined]) {
    const r = await get(`/m/${dead}`, cookie);
    assert.equal(r.status, 200);
    assert.ok(r.html.includes('data-dead-link=""') && r.html.includes('data-code-join="focused"') && r.text.includes("That link doesn’t open anything. Ask for it again, or type the code they read you.") && !r.text.includes("Nothing to see here"), `the code screen with the line, ${cookie ? "signed in" : "signed out"}`);
  }
  const bad = await get("/m/not-a-link", cAsker);
  assert.ok(bad.status === 200 && bad.html.includes('data-dead-link=""'), "malformed reads the same");
  const link = await get(`/m/${marketId}`);
  assert.ok(link.text.includes("Decided") && link.text.includes("How it works") && !link.text.includes("If it’s unclear"), "two facts on the link page (3.17)");
  assert.ok(!link.text.includes("I have an account"), "sign-in lives in the sheet's who's-joining step now");
});

test("the nudge and the relay are back for entering and for voting, and who's in carries the people still out with a nudge beside each; nobody outside nudges", async () => {
  // Nia's window question, open: rae asked and not in. Anyone in may nudge; the stack's sheet lists rae as still out.
  const open = await get(`/m/${windowId}`, cNia);
  assert.ok(open.html.includes('data-nudge=""') && open.text.includes(`Waiting on ${rae.user.displayName.split(" ")[0]}.`) && open.html.includes('data-still-out="1"'), "the nudge card, and one person still out behind the stack (3.42, amended)");
  const inNotAsker = await get(`/m/${windowId}`, cFriend);
  assert.ok(inNotAsker.html.includes('data-nudge=""') && inNotAsker.html.includes('data-still-out="1"'), "anyone in may nudge: it is a person acting, from inside");
  const out = await get(`/m/${windowId}`, cRae);
  assert.ok(!out.html.includes('data-nudge=""') && !out.html.includes("data-still-out="), "someone not in has nothing to nudge with, and no list");
  // Locked, with nobody voted yet: the same nudge reaches whoever in the quorum has not called it.
  const locked = await get(`/m/${feedVotingId}`, cNia);
  assert.ok(locked.html.includes('data-nudge=""') && locked.text.includes(`Waiting on ${rae.user.displayName.split(" ")[0]}.`) && locked.html.includes('data-still-out="1"'), "once locked, the nudge to vote and the still-out list");
});

test("the You page: identity with one caption, how your calls land under the floor as the count and the calls themselves, the questions asked in counts, and the Account rows; nothing yet is one line", async () => {
  const you = await get("/you", cAsker);
  assert.equal(you.status, 200);
  assert.ok(/In \d+ markets since /.test(you.text) || /In one market since /.test(you.text), "the header's caption counts markets since when (3.34)");
  assert.ok(you.html.includes('data-you-calls="early"') && /Your picture draws at 10 resolved calls\. \d+ so far\./.test(you.text) && you.html.includes('data-diagonal=""') && !you.html.includes('data-calls-plot=""'), "under ten: the frame with only the diagonal and the count as a fact, never a plot");
  assert.ok(you.html.includes('data-you-call-rows=""') && /You said \d+% · it (happened|didn’t)/.test(you.text), "the calls themselves as rows");
  assert.ok(you.html.includes("data-you-asked=") && /(\d+ of the \d+ questions|The one question) you asked (ended cleanly|was voided)/.test(you.text) && !/\d+% of the questions/.test(you.text), "questions you asked, in counts and never a percentage");
  for (const row of ["units", "marks", "number", "signout"]) assert.ok(you.html.includes(`data-account-row="${row}"`), `the ${row} row`);
  assert.ok(you.text.includes("Used to sign in. Nobody else sees it.") && you.text.includes("Sign out") && !you.text.includes("One tap"), "the captions, and no One tap row (Round B)");
  // Pass the phone (3.45; 3.41 amended): the row with the switch, off, between the number and sign out; never "Skip this step next time?" anywhere.
  assert.ok(you.html.includes('data-account-row="pass"') && /role="switch"[^>]*aria-checked="false"/.test(you.html) && you.text.includes("Pass the phone") && you.text.includes("Voting always asks.") === false || you.html.includes('data-pass-switch="off"'), "the pass the phone row, off");
  assert.ok(you.dom.indexOf('data-account-row="number"') < you.dom.indexOf('data-account-row="pass"') && you.dom.indexOf('data-account-row="pass"') < you.dom.indexOf('data-account-row="signout"'), "in One tap's place, before Sign out");
  assert.ok(!you.text.includes("Skip this step next time"), "the ask is never shown (3.41, amended)");
  assert.ok(!/\brank\b|\bgrade\b|\bscore\b/i.test(you.text), "no score, grade or rank");
  // A fresh account: joined today, nothing resolved yet, and no empty chart.
  const fresh = await tempUser("Fresh Check");
  const cFresh = await cookieFor(fresh.id);
  const empty = await get("/you", cFresh);
  assert.ok(empty.text.includes("Joined today") && empty.html.includes('data-you-nothing=""') && empty.text.includes("Nothing has resolved yet.") && !empty.html.includes("data-you-calls=") && !empty.html.includes("data-you-numbers=") && !empty.html.includes("data-you-asked="), "one line, no zeros (3.34, 4.7)");
});

test("the swipes on Now: a market you asked that nobody else is in answers Remove, a finished one answers Archive, and a row someone else is in stays put", async () => {
  const a = await get("/", cAsker);
  assert.equal(a.status, 200);
  const running = a.dom.split("Running")[1]?.split("Just happened")[0] ?? "";
  assert.ok(new RegExp(`data-call-off="remove"[^>]*>[\\s\\S]*?/m/${marketId}`).test(running), "the running row for the kettle question, alone in it, wears Remove (3.15)");
  assert.ok(a.html.includes('data-call-off="archive"'), "a finished question in Just happened wears Archive");
  assert.ok(a.html.includes('aria-label="Remove"') && a.html.includes('aria-label="Archive"'), "the squares are named");
  assert.ok(!a.text.includes("Swipe") && !a.text.includes("swipe"), "no hint teaches the swipe");
  const n = await get("/", cNia);
  const niaRunning = n.dom.split("Running")[1]?.split("Just happened")[0] ?? "";
  assert.ok(niaRunning.includes(`/m/${windowId}`) && !new RegExp(`data-call-off="remove"[^>]*>[\\s\\S]*?/m/${windowId}`).test(niaRunning), "a market other people are in isn't one person's to remove");
  // A game swipes as one row (ruled 2026-09-27): the asker's two open questions on the feed game, alone in both, wear Remove together; nia's finished night game wears Archive.
  assert.ok(new RegExp(`data-call-off="remove"[^>]*data-call-off-game=""[^>]*>[\\s\\S]*?data-game-running=""[\\s\\S]*?/on/${feedGameId}`).test(running), "the game's running row removes its questions as one, since nobody else is in any of them");
  const niaHappened = n.dom.split("Just happened")[1] ?? "";
  assert.ok(new RegExp(`data-call-off="archive"[^>]*data-call-off-game=""[^>]*>[\\s\\S]*?data-game-happened=""[\\s\\S]*?/on/${nightGameId}`).test(niaHappened), "a finished game archives as one row");
});

test("a removed market reads as called off on its own screen, with nobody else got in, and is off Now", async () => {
  const d0 = await markets.draftMarket({ creatorId: asker.user.id, groupId: (await db.select({ groupId: schema.dares.groupId }).from(schema.dares).where(eq(schema.dares.id, marketId)))[0]?.groupId as string, denomId: (await db.select({ denomId: schema.dares.denomId }).from(schema.dares).where(eq(schema.dares.id, marketId)))[0]?.denomId as string, title: "Does the removed one stay quiet?", termsText: "Yes if nobody joins.", resolvesBy: new Date(Date.now() + 86_400_000) });
  const d = await markets.openMarket(d0.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(d0)));
  await markets.enterMarket({ dareId: d.id, userId: asker.user.id, stake: 500n, value: 6000n, signature: await asker.ledger.signTypedData(markets.enterTypedData(d, 500n, 6000n)) });
  await removeMarket(d.id, asker.user.id);
  const r = await get(`/m/${d.id}`, cAsker);
  assert.equal(r.status, 200);
  assert.ok(r.html.includes('data-band-state="voided"') && /Called off at \d/.test(r.text) && !r.text.includes("Called off soon") && r.text.includes("Called off.") && r.text.includes("Nobody else got in."), "the voided mark with when it was, never soon, the outcome line and its caption (3.15)");
  assert.ok(!r.html.includes('data-whos-in=""') && !r.html.includes('data-share=""'), "nothing to send: no row");
  const friend = await get(`/m/${d.id}`, cFriend);
  assert.ok(friend.status === 200 && friend.text.includes("Called off."), "anyone the link reached sees the same");
  const home = await get("/", cAsker);
  assert.ok(!home.html.includes(`/m/${d.id}`), "never on Now, not in Just happened either");
});

test("a ghost who is in sees the market as anyone in sees it (3.17, frame 6): their entry and the picture before who's in and the facts; once locked, the entry with its clock, where everyone landed and the poll, whose pulse admits them and nobody else without a session; once settled, how it ended", async () => {
  const groupOf = (await db.select({ groupId: schema.dares.groupId, denomId: schema.dares.denomId }).from(schema.dares).where(eq(schema.dares.id, marketId)))[0] as { groupId: string; denomId: string };
  const d0 = await markets.draftMarket({ creatorId: asker.user.id, groupId: groupOf.groupId, denomId: groupOf.denomId, title: "Does the ghost see the whole story?", termsText: "Yes if the screen says so.", resolvesBy: new Date(Date.now() + 86_400_000), outcomeWords: ["It did", "It didn’t", "The ghost saw it all.", "The ghost saw nothing."] });
  const d = await markets.openMarket(d0.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(d0)));
  await markets.enterMarket({ dareId: d.id, userId: asker.user.id, stake: 500n, value: 6000n, signature: await asker.ledger.signTypedData(markets.enterTypedData(d, 500n, 6000n)) });
  const wisp = await enterAsGhost({ dareId: d.id, who: { name: "Wisp", phoneHash: null, memberClaimId: null }, tokens: [], stake: 500n, value: 2600n });
  assert.ok(wisp.browserToken, "the browser keeps a token for the entry");
  const jar = `dareful_claims=${wisp.browserToken}`;
  const open = await get(`/m/${d.id}`, undefined, jar);
  assert.equal(open.status, 200);
  assert.ok(open.text.includes("You’re in at 26%") && open.html.includes('data-whos-in=""'), "in: the entry line and the who's-in row");
  // The same phone on another open question joins as the ghost it remembers, and says so instead of asking a name it would not use.
  const elsewhere = await get(`/m/${marketId}`, undefined, jar);
  assert.ok(elsewhere.html.includes('data-joining-as=""') && elsewhere.text.includes("Joining as Wisp") && elsewhere.text.includes("Not you?") && !elsewhere.text.includes("Your name"), "Joining as Wisp · Not you? on a question the ghost is not in yet");
  assert.ok(open.text.indexOf("You’re in at 26%") < open.text.indexOf("of you in") && open.text.indexOf("of you in") < open.text.indexOf("How it works"), "the entry line, then who's in, then the facts, as a member sees them");
  assert.ok(!open.text.includes("so you can watch but not enter"), "nothing tells someone who is in that they cannot enter");
  // Locked: the entry stays, with the clock, and the picture is where everyone landed; the poll is on the page and its door admits the ghost.
  await markets.lockMarket(d.id, asker.user.id);
  const locked = await get(`/m/${d.id}`, undefined, jar);
  assert.ok(locked.text.includes("You’re in at 26%") && /locked at \d/.test(locked.text) && locked.text.includes("Where everyone landed"), "locked: the entry with its clock, and where everyone landed");
  assert.ok(!locked.text.includes("so you can watch but not enter") && !locked.text.includes("Change"), "no Closed sheet, and nothing to change");
  const pulse = await fetch(`${BASE}/api/m/${d.id}/pulse`, { headers: { cookie: jar } });
  assert.equal(pulse.status, 200, "the pulse answers a ghost who is in");
  assert.equal((await fetch(`${BASE}/api/m/${d.id}/pulse`)).status, 404, "and nobody with no session and no entry");
  const outsider = await get(`/m/${d.id}`);
  assert.ok(outsider.text.includes("so you can watch but not enter") && !outsider.text.includes("You’re in at"), "a visitor who never got in still gets the Closed sheet");
  // Settled by the contract's rule here (a provisional market): how it ended, in the question's own words, and nothing that says finished and no more.
  await settleProvisional((await markets.marketById(d.id)) as NonNullable<Awaited<ReturnType<typeof markets.marketById>>>, await markets.positionsOf(d.id), 1n, { by: "quorum" });
  const settled = await get(`/m/${d.id}`, undefined, jar);
  assert.ok(settled.text.includes("The ghost saw it all.") && !settled.text.includes("This one’s finished."), "the outcome line for the ghost who was in");
  assert.ok((await get(`/m/${d.id}`)).text.includes("This one’s finished."), "and the plain line for a visitor who was not");
  // On the asker's settled screen the ghost who has got them wears the stone avatar with its dashed ring, on the "Wisp's got" line and on the token (3.1).
  const askerSettled = await get(`/m/${d.id}`, cAsker);
  const section = askerSettled.dom.slice(askerSettled.dom.indexOf("Who’s got who"));
  const at = section.search(/Wisp(?:’|'|&#x27;)s got/);
  assert.ok(at > 0, "the ghost lost, so the ghost has got the asker");
  // The ghost's own line and its tokens, and nothing after them: the who's-in stack further down draws the same ghost dashed, and would answer for these two.
  const who = section.slice(section.lastIndexOf("<p", at), section.indexOf("</ul>", at));
  const ghostAvatars = (who.match(/outline-dashed/g) ?? []).length;
  // The line's avatar is the ghost's, stone and dashed; the token under it wears the face of the one the ghost has got (the field round, part 2), so it is not dashed.
  assert.ok(ghostAvatars === 1 && /background:\s*var\(--person-stone\)/.test(who), `the line's avatar stone and dashed, the token wearing the other end's face (found ${ghostAvatars} dashed)`);
});

test("at sign-in, an entry made from a link is a row on the claimant screen, pressed by default, with the one chalk counting it", async () => {
  // A ghost with a number enters nia's open question; the number binds it to a fresh account, whose claimant screen lists the entry.
  const gabe = await enterAsGhost({ dareId: windowId, who: { name: "Gabe", phoneHash: hashPhone(fictionalPhone()), memberClaimId: null }, tokens: [], stake: 500n, value: 4000n });
  const newcomer = await tempSigner("Gabriel");
  const cNewcomer = await cookieFor(newcomer.user.id);
  await claims.bindClaimToUser(gabe.claimId, newcomer.user.id);
  const r = await get("/welcome", cNewcomer);
  assert.equal(r.status, 200, "the claimant screen opens with an entry and no cover");
  assert.ok(r.html.includes('data-link-entries=""') && r.html.includes(`data-link-entry="${windowId}"`), "the entry, as a claim row (3.38)");
  assert.ok(r.text.includes("You’re in at 40% · $5") && r.text.includes("Does the pizza come before the second act?"), "its line is the entry, the question in the caption");
  assert.ok(r.html.includes('role="checkbox" aria-checked="true"'), "pressed by default");
  assert.ok(r.text.includes("Yep, that’s right") && r.html.includes('data-confirm-all=""'), "the one chalk in the sheet");
  assert.ok(r.text.includes("You were already in one story.") && r.text.includes("kept under your name"), "the heading counts the one entry as a story (3.38, Round C part 2)");
  // Left out: it goes back to a fresh ghost in stone, and the screen empties.
  await claims.leaveEntry(windowId, newcomer.user.id);
  assert.equal((await get("/welcome", cNewcomer)).loc, "/", "nothing waiting: home");
  const m = await get(`/m/${windowId}`, cNia);
  // Three in (nia, the friend and the fresh ghost); the people asked and not in are Rae and the newcomer, who joined the set by binding and left the entry.
  assert.ok(/3 of \d in/.test(m.text), "the entry still counts, under the typed name");
  await db.update(schema.darePositions).set({ dismissedAt: new Date() }).where(and(eq(schema.darePositions.dareId, windowId), isNull(schema.darePositions.userId)));
});

// ------------------------------------------------------------------------------------------------- the usage door (the field round)

test("the usage door counts a link opened once per device, refuses a link-preview fetcher and every name the browser may not report, and sets the device's cookie", async (t) => {
  const U = schema.usageEvents;
  const body = { name: "link_opened", props: { link: "market", signedIn: false, installed: true }, dareId: marketId };
  const post = (headers: Record<string, string>, b: unknown = body) => fetch(`${BASE}/api/usage`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(b), redirect: "manual" });
  const before = (await db.select({ id: U.id }).from(U).where(eq(U.dareId, marketId))).length;
  // Messages fetching the preview: a 204 and no row.
  const bot = await post({ "user-agent": "facebookexternalhit/1.1" });
  assert.equal(bot.status, 204);
  assert.equal((await db.select({ id: U.id }).from(U).where(eq(U.dareId, marketId))).length, before, "a fetcher's visit is not a person's");
  // A phone's first visit: a row with a device id, and the cookie that makes the next visit the same device.
  const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
  const first = await post({ "user-agent": ua });
  assert.equal(first.status, 204);
  const cookie = /dareful_device=([0-9a-f-]{36})/.exec(first.headers.get("set-cookie") ?? "")?.[1];
  assert.ok(cookie, "the device's cookie");
  // Everything this test's own device reported goes when it ends, pass or fail: a row a broken door let through
  // with no question on it belongs to no market the cleanup removes, and would sit in production's counts.
  t.after(() => db.delete(U).where(eq(U.deviceId, cookie as string)));
  const rows = await db.select().from(U).where(and(eq(U.dareId, marketId), eq(U.deviceId, cookie as string)));
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0]?.props, { link: "market", signedIn: false, installed: true });
  assert.equal(rows[0]?.userId, null);
  // The same device again: no second row. A signed-in person on the same device: their own, once.
  await post({ "user-agent": ua, cookie: `dareful_device=${cookie}` });
  assert.equal((await db.select({ id: U.id }).from(U).where(and(eq(U.dareId, marketId), eq(U.deviceId, cookie as string)))).length, 1, "once per device per link");
  await post({ "user-agent": ua, cookie: `dareful_device=${cookie}; dareful_session=${cFriend}` }, { ...body, props: { ...body.props, signedIn: true } });
  const mine = await db.select().from(U).where(and(eq(U.dareId, marketId), eq(U.userId, friend.user.id)));
  assert.equal(mine.length, 1, "the account's own open");
  assert.equal(mine[0]?.deviceId, cookie);
  // The server's own names and unknown ones leave nothing, whatever the browser says.
  for (const b of [{ name: "asked", props: { kind: "binary", pace: "dare", source: "direct", mark: "none" }, dareId: marketId }, { name: "signed_in", props: { method: "phone" } }, { name: "page", props: {} }, { name: "share", props: { icon: "Will John fall asleep?" }, dareId: marketId }]) {
    assert.equal((await post({ "user-agent": ua, cookie: `dareful_device=${cookie}` }, b)).status, 204);
  }
  const all = await db.select({ name: U.name }).from(U).where(and(eq(U.deviceId, cookie as string), isNull(U.userId)));
  assert.deepEqual(all.map((r) => r.name), ["link_opened"], "nothing but the one open from this device while nobody was signed in, on the question or off it");
  assert.equal((await db.select({ id: U.id }).from(U).where(eq(U.name, "page"))).length, 0);
});

test("the session slides: a cookie a day old is issued again on a PATCH, a fresh one is left, and no cookie gets none", async () => {
  const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "");
  const old = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(A.id).setIssuedAt(Math.floor(Date.now() / 1000) - 2 * 86_400).setExpirationTime("20d").sign(secret);
  const aged = await fetch(`${BASE}/api/session`, { method: "PATCH", headers: { cookie: `dareful_session=${old}` } });
  assert.equal(aged.status, 204);
  assert.match(aged.headers.get("set-cookie") ?? "", /dareful_session=/, "issued again");
  const fresh = await fetch(`${BASE}/api/session`, { method: "PATCH", headers: { cookie: `dareful_session=${cA}` } });
  assert.deepEqual([fresh.status, fresh.headers.get("set-cookie")], [204, null], "a fresh cookie is left alone");
  const nobody = await fetch(`${BASE}/api/session`, { method: "PATCH" });
  assert.deepEqual([nobody.status, nobody.headers.get("set-cookie")], [204, null], "nothing is issued from nothing");
});

test("a market stuck past its close rests its sheet on the close for the asker and for anyone in it, and for nobody else", async () => {
  const g = await createGroup({ name: "stuck check (temporary)", createdBy: asker.user.id });
  track.group(g.id);
  await db.insert(schema.groupMembers).values([{ groupId: g.id, userId: friend.user.id }, { groupId: g.id, userId: stranger.user.id }]);
  const usd = await ensureUsd(g.id, asker.user.id);
  const d0 = await markets.draftMarket({ creatorId: asker.user.id, groupId: g.id, denomId: usd.id, title: "Does the late train make it?", termsText: "Yes if it arrives before midnight.", resolvesBy: new Date(Date.now() + 3_600_000) });
  const d = await markets.openMarket(d0.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(d0)));
  await markets.enterMarket({ dareId: d.id, userId: asker.user.id, stake: 500n, value: 7000n, signature: await asker.ledger.signTypedData(markets.enterTypedData(d, 500n, 7000n)) });
  await markets.enterMarket({ dareId: d.id, userId: friend.user.id, stake: 500n, value: 3000n, signature: await friend.ledger.signTypedData(markets.enterTypedData(d, 500n, 3000n)) });
  // While it runs the close is the asker's, in the sheet, a secondary whose line says what closing now costs; someone else in it has no close.
  const running = await get(`/m/${d.id}`, cAsker);
  assert.ok(/data-close-line="secondary"/.test(running.html) && /Close it now and \S+ can’t get in\./.test(running.text) && /data-close-early=""/.test(running.html), "the asker, with someone asked still out: the close in the sheet, as a secondary naming who it leaves out");
  assert.ok(!/data-close-line=/.test((await get(`/m/${d.id}`, cFriend)).html), "someone in it who did not ask it: no close while it runs");
  // The time passed and nothing closed it: stuck (the field round, 1.2, 2.1).
  await db.update(schema.dares).set({ resolvesBy: new Date(Date.now() - 60_000) }).where(eq(schema.dares.id, d.id));
  const mine = await get(`/m/${d.id}`, cAsker);
  assert.ok(/data-stuck-line=""/.test(mine.html) && /data-close-line="main"/.test(mine.html) && /data-close-early=""/.test(mine.html), "the asker: the close is the sheet's main action");
  const theirs = await get(`/m/${d.id}`, cFriend);
  assert.ok(/data-stuck-line=""/.test(theirs.html) && /data-close-line="main"/.test(theirs.html) && /data-close-early=""/.test(theirs.html), "someone in it: the close in the sheet too");
  const outside = await get(`/m/${d.id}`, cStranger);
  assert.ok(!/data-stuck-line=""/.test(outside.html), "someone in the set but not in it: no close");
  // The close time ends editing whether or not the close has run (the owner's rule): nothing offers an entry or a change, and an entry reads as final.
  assert.ok(!/data-pinned-sheet=/.test(outside.html), "past the close time someone not in has no move at all: no entry sheet to be refused by");
  assert.ok(/· final/.test(mine.text) && !/>Change</.test(mine.html) && !/>Change</.test(theirs.html), "an entry past the close time is final, and Change is not drawn");
  assert.ok(/>Change</.test(running.html), "while it ran, Change was there");
});

test("the numbers page tells nobody but the owner that it exists", async () => {
  // The owner's ids are not set on the server under test, so every account is somebody else: the code screen, as for an address with no screen (5.4).
  const signedIn = await get("/stats", cA);
  assert.equal(signedIn.status, 404, "a signed-in account that is not the owner");
  assert.ok(!/data-stats=""/.test(signedIn.html), "nothing of the page");
  const nobody = await get("/stats");
  assert.equal(nobody.status, 404, "signed out");
});

test("the session door keeps the zone a browser reports on the account, and nothing that is not a zone", async () => {
  const patchAs = (tz: string) => fetch(`${BASE}/api/session`, { method: "PATCH", headers: { cookie: `dareful_session=${cB}; dareful_tz=${encodeURIComponent(tz)}` } });
  const zoneOf = async () => (await db.select({ zone: schema.users.zone }).from(schema.users).where(eq(schema.users.id, B.id)))[0]?.zone ?? null;
  assert.equal((await patchAs("America/Chicago")).status, 204);
  assert.equal(await zoneOf(), "America/Chicago");
  await patchAs("Not/AZone");
  assert.equal(await zoneOf(), "America/Chicago", "a name that is not a zone changes nothing");
});
