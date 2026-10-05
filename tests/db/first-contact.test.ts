/**
 * The first-contact round (2026-10-04), against the real database: only the people in a question call it. A member
 * of the set who never got in is refused a vote and a line about what happened, a vote someone outside signed is
 * counted nowhere, and a question whose people in are fewer than a majority of its set locks here, where a majority
 * of the people in decides. Rows are the temporary people's and removed after.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db, schema } from "@/db";
import { ensureUsd } from "@/lib/ledger/denominations";
import { enterAsGhost } from "@/lib/ledger/ghost-entry";
import { createGroup, createOccasionGroup, ensureDyad, peopleSetsFor } from "@/lib/ledger/groups";
import * as markets from "@/lib/ledger/markets";
import { isProvisional, thresholdFor } from "@/lib/ledger/provisional";
import { leadingVotesOn } from "@/lib/ledger/settle";
import { marketCards } from "@/lib/ledger/market-view";
import { markReachCardShown, owesReachCard } from "@/lib/ledger/reach";
import { discardDraft, unsentDrafts } from "@/lib/ledger/drafts";
import { cleanup, codeOf, tempSigner, track, type Signer } from "./fixture";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { startGame, syncSchedule } from "@/lib/sports";
import { parseScoreboard } from "@/lib/sports/espn";

let ana: Signer, ben: Signer, cy: Signer, dee: Signer;
before(async () => {
  [ana, ben, cy, dee] = await Promise.all(["Ana", "Ben", "Cy", "Dee"].map((n) => tempSigner(n)));
});
after(cleanup);

async function question(people: Signer[]) {
  const g = await createGroup({ name: "first contact check (temporary)", createdBy: ana.user.id });
  track.group(g.id);
  await db.insert(schema.groupMembers).values(people.slice(1).map((p) => ({ groupId: g.id, userId: p.user.id })));
  const usd = await ensureUsd(g.id, ana.user.id);
  const d0 = await markets.draftMarket({ creatorId: ana.user.id, groupId: g.id, denomId: usd.id, title: "Does John fall asleep during the movie?", termsText: "Yes if John is asleep at any point before the credits. No if he makes it.", resolvesBy: new Date(Date.now() + 3 * 86_400_000), stalemate: "void" });
  const d = await markets.openMarket(d0.id, ana.user.id, await ana.ledger.signTypedData(markets.createTypedData(d0)));
  const enter = async (who: Signer, value: bigint, stake = 1000n) => markets.enterMarket({ dareId: d.id, userId: who.user.id, stake, value, signature: await who.ledger.signTypedData(markets.enterTypedData(d, stake, value)) });
  const vote = async (who: Signer, outcome: bigint) => markets.castVote({ dareId: d.id, userId: who.user.id, outcome, signature: await who.governance.signTypedData(markets.voteTypedData((await markets.marketById(d.id))!, outcome)) });
  return { d, enter, vote };
}

test("only the people in a question call it: a member of the set who never got in is refused a vote and a line, a vote they signed is counted nowhere, and the quorum is the people in", async () => {
  const { d, enter, vote } = await question([ana, ben, cy, dee]);
  await enter(ana, 7000n);
  await enter(ben, 3000n);
  // A guest in it keeps it here, so nothing reaches the chain.
  await enterAsGhost({ dareId: d.id, who: { name: "Gabe", phoneHash: null, memberClaimId: null }, tokens: [], stake: 1000n, value: 5000n });
  await markets.lockMarket(d.id, ana.user.id);
  const locked = (await markets.marketById(d.id))!;
  assert.deepEqual([isProvisional(locked), locked.threshold], [true, thresholdFor(2)], "two account-holders in: both decide it");
  assert.deepEqual((await markets.quorumOf(locked)).sort(), [ana, ben].map((s) => s.user.governanceWallet.toLowerCase()).sort(), "the quorum is the people in, never the rest of the set");

  const refused = await vote(cy, 1n).catch((e: unknown) => e);
  assert.ok(refused instanceof markets.MarketError && refused.code === "not_member" && refused.message === markets.ONLY_THOSE_IN, "a member of the set who never got in is refused, in words");
  assert.equal(await codeOf(() => markets.sayWhatHappened(d.id, cy.user.id, "He was out cold by the second act.")), "not_member", "and cannot say what happened either");

  const card = (await marketCards({ viewerId: cy.user.id, groupId: d.groupId })).find((c) => c.dare.id === d.id);
  assert.equal(card?.needsYou, null, "and nothing tells them it needs them");
  // A vote someone outside signed before this rule (as one did on production) is on the table and counts nowhere.
  const sig = await cy.governance.signTypedData(markets.voteTypedData(locked, 1n));
  await db.insert(schema.dareVotes).values({ dareId: d.id, userId: cy.user.id, outcome: 1n, signature: Buffer.from(sig.slice(2), "hex") });
  assert.equal((await markets.votesOf(d.id)).length, 0, "the outsider's vote is not read");
  assert.equal(await leadingVotesOn(d.id), 0, "nor counted by the queue that finishes decided questions");
  assert.equal((await vote(ana, 1n)).resolved, false, "one vote from the people in is not two, whatever the outsider signed");
  assert.equal(await leadingVotesOn(d.id), 1);
  assert.equal((await vote(ben, 1n)).resolved, true, "both people in agree: decided");
  const done = (await markets.marketById(d.id))!;
  assert.deepEqual([done.resolvedBy, done.resolvedOutcome], ["provisional", 1n]);
});

test("a question with fewer people in than a majority of its set locks here, where a majority of the people in decides it, since the chain would ask the rest of the set", async () => {
  const { d, enter, vote } = await question([ana, ben, cy, dee]);
  await enter(ana, 7000n);
  await enter(ben, 3000n);
  await markets.lockMarket(d.id, ana.user.id);
  const locked = (await markets.marketById(d.id))!;
  assert.deepEqual([isProvisional(locked), locked.onchainId, locked.threshold], [true, null, thresholdFor(2)], "two of four in: the chain's three could never be reached, so it locks here and the two decide");
  assert.equal(await codeOf(() => vote(dee, 0n)), "not_member", "the set's others are not asked");
  assert.equal((await vote(ana, 0n)).resolved, false);
  assert.equal((await vote(ben, 0n)).resolved, true);
});

test("a game's question sent again after a send that failed before its signature is the same draft, never a second one beside it", async () => {
  const g = await createGroup({ name: "first contact game (temporary)", createdBy: ana.user.id });
  track.group(g.id);
  await db.insert(schema.groupMembers).values({ groupId: g.id, userId: ben.user.id });
  const usd = await ensureUsd(g.id, ana.user.id);
  const scoreboard = JSON.parse(readFileSync(new URL("../fixtures/sports/espn-nfl-scheduled.json", import.meta.url), "utf8")) as unknown;
  const prefix = track.gamePrefix(`test:first-db:${randomUUID().slice(0, 8)}:`);
  const game = parseScoreboard("nfl", scoreboard).slice(0, 1).map((x) => ({ ...x, sourceId: `${prefix}${x.sourceId}`, startsAt: new Date(Date.now() + 3 * 86_400_000) }));
  await syncSchedule("nfl", new Date(), { name: "espn", listGames: async () => game });
  const [row] = await db.select().from(schema.sportsGames).where(eq(schema.sportsGames.sourceId, game[0]!.sourceId));
  const gameId = (row as { id: string }).id;
  const [first] = await startGame({ gameId, keys: ["margin"], creatorId: ana.user.id, groupId: g.id, denomId: usd.id, zone: "America/New_York" });
  const [again] = await startGame({ gameId, keys: ["margin"], creatorId: ana.user.id, groupId: g.id, denomId: usd.id, zone: "America/New_York", blind: true });
  assert.equal(again?.id, first?.id, "the same draft, sent again");
  assert.equal(again?.revealMode, "blind", "with what the second send asked for");
  const drafts = await db.select({ id: schema.dares.id }).from(schema.dares).where(and(eq(schema.dares.groupId, g.id), eq(schema.dares.templateId, first!.templateId!)));
  assert.equal(drafts.length, 1, "one draft for the question, not two");
});

test("one set per pair: a question's set that one friend joined is the pair's set, the pair's dyad stands for it when there is one, and a third person makes it someone else's", async () => {
  const [eve, fay] = await Promise.all(["Eve", "Fay"].map((n) => tempSigner(n)));
  const occasion = await createOccasionGroup(eve.user.id);
  track.group(occasion.id);
  await db.insert(schema.groupMembers).values({ groupId: occasion.id, userId: fay.user.id });
  const found = await ensureDyad(eve.user.id, fay.user.id);
  assert.equal(found.id, occasion.id, "the set a link question left them is theirs: no second set for the pair");
  const before = await peopleSetsFor(eve.user.id, eve.user.displayName);
  assert.deepEqual(before.filter((s) => s.members.some((m) => m.userId === fay.user.id)).map((s) => s.label), ["Fay and you"], "one row, named for the other person");
  // A pair that already had a dyad beside such a set: the dyad is the pair's, and the two read as one row.
  const [dyad] = await db.insert(schema.groups).values({ name: null, isDyad: true, createdBy: eve.user.id }).returning();
  track.group(dyad!.id);
  await db.insert(schema.groupMembers).values([{ groupId: dyad!.id, userId: eve.user.id }, { groupId: dyad!.id, userId: fay.user.id }]);
  assert.equal((await ensureDyad(fay.user.id, eve.user.id)).id, dyad!.id, "the dyad first");
  const rows = (await peopleSetsFor(eve.user.id, eve.user.displayName)).filter((s) => s.members.some((m) => m.userId === fay.user.id));
  assert.deepEqual(rows.map((s) => [s.groupId, s.label]), [[dyad!.id, "Fay and you"]], "two sets with the same two people are one row");
  // A guest in the occasion's set makes it other people: its own row, named with the guest.
  await enterAsGhostInto(occasion.id, "Sam");
  const withGuest = (await peopleSetsFor(eve.user.id, eve.user.displayName)).filter((s) => s.members.some((m) => m.userId === fay.user.id));
  assert.deepEqual(withGuest.map((s) => s.label).sort(), ["Fay and you", "Fay, Sam and you"], "a set that differs by its guests reads differently");
  // A set with a third person in it is never a pair's: the pair gets its own.
  const [gus, hal] = await Promise.all(["Gus", "Hal"].map((n) => tempSigner(n)));
  const trio = await createOccasionGroup(gus.user.id);
  track.group(trio.id);
  await db.insert(schema.groupMembers).values({ groupId: trio.id, userId: hal.user.id });
  await enterAsGhostInto(trio.id, "Ivy");
  const pair = await ensureDyad(gus.user.id, hal.user.id);
  track.group(pair.id);
  assert.ok(pair.id !== trio.id && pair.isDyad, "three people are not the pair");
});

/** Seats a guest in a set the way a link entry does, without a question: a claim and its seat. */
async function enterAsGhostInto(groupId: string, name: string): Promise<void> {
  const [claim] = await db.insert(schema.participantClaims).values({ displayName: name, createdBy: ana.user.id }).returning();
  track.claim(claim!.id);
  await db.insert(schema.groupMembers).values({ groupId, claimId: claim!.id });
}

test("the card for an account the app cannot reach is owed once, and never to one whose phone takes a push", async () => {
  const [kim, lou] = await Promise.all(["Kim", "Lou"].map((n) => tempSigner(n)));
  assert.equal(await owesReachCard(kim.user.id), true, "no push and never shown");
  await markReachCardShown(kim.user.id, new Date());
  assert.equal(await owesReachCard(kim.user.id), false, "shown once, never again");
  await db.insert(schema.pushSubscriptions).values({ userId: lou.user.id, endpoint: `https://push.example/${lou.user.id}`, p256dh: "p", auth: "a" });
  assert.equal(await owesReachCard(lou.user.id), false, "a phone that takes a push is reachable");
});

test("a draft is its asker's to discard, gone for good, and nobody else's; a sent one is refused", async () => {
  const g = await createGroup({ name: "first contact drafts (temporary)", createdBy: ana.user.id });
  track.group(g.id);
  await db.insert(schema.groupMembers).values({ groupId: g.id, userId: ben.user.id });
  const usd = await ensureUsd(g.id, ana.user.id);
  const draft = () => markets.draftMarket({ creatorId: ana.user.id, groupId: g.id, denomId: usd.id, title: "Will the kettle boil first?", termsText: "Yes if the kettle clicks off before the toast pops. No if not.", resolvesBy: new Date(Date.now() + 86_400_000) });
  const a = await draft();
  await assert.rejects(discardDraft(a.id, ben.user.id), /already sent, or isn't yours/, "someone else's draft stays");
  await discardDraft(a.id, ana.user.id);
  assert.equal(await markets.marketById(a.id), null, "gone for good: it was never sent, so nothing of it is history");
  const b = await draft();
  await markets.openMarket(b.id, ana.user.id, await ana.ledger.signTypedData(markets.createTypedData(b)));
  await assert.rejects(discardDraft(b.id, ana.user.id), /already sent/, "a sent question is not a draft");
  assert.ok(await markets.marketById(b.id), "and it stays");
});

test("sent before its asker is in: the question opens with nobody in, the asker enters later, and only unsent drafts are on You", async () => {
  const g = await createGroup({ name: "first contact share first (temporary)", createdBy: ana.user.id });
  track.group(g.id);
  await db.insert(schema.groupMembers).values({ groupId: g.id, userId: ben.user.id });
  const usd = await ensureUsd(g.id, ana.user.id);
  const d0 = await markets.draftMarket({ creatorId: ana.user.id, groupId: g.id, denomId: usd.id, title: "Will the toast burn?", termsText: "Yes if the toast comes out black. No if not.", resolvesBy: new Date(Date.now() + 86_400_000) });
  const unsent = await markets.draftMarket({ creatorId: ana.user.id, groupId: g.id, denomId: usd.id, title: "Will the jam run out?", termsText: "Yes if the jar is empty by tonight. No if not.", resolvesBy: new Date(Date.now() + 86_400_000) });
  const sent = await markets.openMarket(d0.id, ana.user.id, await ana.ledger.signTypedData(markets.createTypedData(d0)));
  assert.equal(markets.stateOf(sent), "open", "open from the Create signature alone");
  assert.equal((await markets.positionsOf(sent.id)).length, 0, "nobody in, the asker included");
  const mine = (await unsentDrafts(ana.user.id)).map((x) => x.id);
  assert.ok(mine.includes(unsent.id), "the unsent draft is on You");
  assert.ok(!mine.includes(sent.id), "the sent one is not");
  await markets.enterMarket({ dareId: sent.id, userId: ana.user.id, stake: 500n, value: 4000n, signature: await ana.ledger.signTypedData(markets.enterTypedData(sent, 500n, 4000n)) });
  assert.equal((await markets.positionsOf(sent.id)).length, 1, "the asker enters any time before the close");
  await discardDraft(unsent.id, ana.user.id);
});

test("an argument may be one of its answers, each person's answer an answer, and never a number", async () => {
  const g = await createGroup({ name: "first contact argument answers (temporary)", createdBy: ana.user.id });
  track.group(g.id);
  await db.insert(schema.groupMembers).values({ groupId: g.id, userId: ben.user.id });
  const usd = await ensureUsd(g.id, ana.user.id);
  const base = { creatorId: ana.user.id, groupId: g.id, denomId: usd.id, title: "Which country has more lakes?", termsText: "Whichever of Canada and Australia has more lakes by the national survey.", resolvesBy: null, pace: "argument" as const };
  const d = await markets.draftMarket({ ...base, kind: "categorical", answers: [{ text: "Canada" }, { text: "Australia" }] });
  assert.equal(d.pace, "argument");
  assert.deepEqual(d.outcomeLabels, ["Canada", "Australia"]);
  await assert.rejects(markets.draftMarket({ ...base, title: "How many lakes does Canada have?", kind: "numeric", unit: { singular: "lake", plural: "lakes" }, scale: { range: 100n, source: "asker" } }), /yes or no, or one of its answers/);
  await discardDraft(d.id, ana.user.id);
});
