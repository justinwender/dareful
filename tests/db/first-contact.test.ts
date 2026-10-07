/**
 * The first-contact rounds (2026-10-04 and 2026-10-06), against the real database: only the people in a question
 * call it. A member of the set who never got in is refused a vote and a line about what happened, a vote someone
 * outside signed is counted nowhere, and a question goes on the chain only when the chain would ask exactly the
 * people in it, and is decided here by a majority of them otherwise. Rows are the temporary people's and removed after.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { db, schema } from "@/db";
import { ensureUsd } from "@/lib/ledger/denominations";
import { enterAsGhost } from "@/lib/ledger/ghost-entry";
import { createGroup, createOccasionGroup, ensureDyad, peopleSetsFor } from "@/lib/ledger/groups";
import * as markets from "@/lib/ledger/markets";
import { isProvisional, thresholdFor } from "@/lib/ledger/provisional";
import { registeredVoters } from "@/lib/ledger/registry";
import { completions } from "@/lib/ledger/completions";
import { confirmProposal, confirmTypedData, proposeCover } from "@/lib/ledger/proposals";
import { cents, units } from "@/lib/money";
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

async function question(people: Signer[], set?: { groupId: string; denomId: string }) {
  const g = set ? { id: set.groupId } : await createGroup({ name: "first contact check (temporary)", createdBy: ana.user.id });
  if (!set) {
    track.group(g.id);
    await db.insert(schema.groupMembers).values(people.slice(1).map((p) => ({ groupId: g.id, userId: p.user.id })));
  }
  const usd = set ? { id: set.denomId } : await ensureUsd(g.id, ana.user.id);
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

test("a question goes on the chain only when the chain would ask exactly the people in it, and is decided here by a majority of them otherwise", async () => {
  const low = (wallets: readonly string[]) => wallets.map((w) => w.toLowerCase()).sort();
  const gov = (...who: Signer[]) => low(who.map((s) => s.user.governanceWallet));
  // A set of four nobody has registered: two in, and the chain's voters are those two and nobody else.
  const first = await question([ana, ben, cy, dee]);
  await first.enter(ana, 7000n);
  await first.enter(ben, 3000n);
  const lock = await markets.lockMarket(first.d.id, ana.user.id);
  const onChain = (await markets.marketById(first.d.id))!;
  assert.equal(isProvisional(onChain), false, "two of four in a set nobody registered: on the chain");
  assert.deepEqual([low(lock.quorum), lock.threshold], [gov(ana, ben), thresholdFor(2)], "the chain asks the two people in, a majority of two");
  assert.deepEqual(low(await registeredVoters(first.d.groupId)), gov(ana, ben), "and registered nobody else in the set");
  assert.equal(await codeOf(() => first.vote(dee, 0n)), "not_member", "the set's others are not asked");
  assert.equal((await first.vote(ana, 0n)).resolved, false);
  assert.equal((await first.vote(ben, 0n)).resolved, true, "the two people in agree: decided on the chain");

  // The same set again, with Ben registered there and not in: the chain would ask him, so it is decided here.
  const again = await question([ana, ben, cy, dee], { groupId: first.d.groupId, denomId: first.d.denomId });
  await again.enter(ana, 6000n);
  await again.enter(cy, 2000n);
  await markets.lockMarket(again.d.id, ana.user.id);
  const here = (await markets.marketById(again.d.id))!;
  assert.deepEqual([isProvisional(here), here.threshold], [true, thresholdFor(2)], "someone registered and not in: decided here, by a majority of the two in");
  assert.deepEqual(low(await registeredVoters(again.d.groupId)), gov(ana, ben), "and its lock registered nobody");
  assert.equal(await codeOf(() => again.vote(ben, 1n)), "not_member", "Ben, registered on the chain, is no voter here");
  assert.equal((await again.vote(ana, 1n)).resolved, false);
  assert.equal((await again.vote(cy, 1n)).resolved, true);

  // Shared without entering: the contract would register the asker as a voter, so the two in decide it here.
  const shared = await question([ana, ben, cy]);
  await shared.enter(ben, 4000n);
  await shared.enter(cy, 9000n);
  await markets.lockMarket(shared.d.id, ana.user.id);
  const sharedLocked = (await markets.marketById(shared.d.id))!;
  assert.deepEqual([isProvisional(sharedLocked), sharedLocked.threshold], [true, thresholdFor(2)], "the asker never got in: decided here by the two who did");
  assert.equal(await codeOf(() => shared.vote(ana, 1n)), "not_member", "and the asker is no voter");
});

test("a confirmation registers its two sides on the chain and nobody else in the set, and finishing a registration the earlier build left in flight registers nobody new", async () => {
  const low = (wallets: readonly string[]) => wallets.map((w) => w.toLowerCase()).sort();
  const g = await createGroup({ name: "first contact registry (temporary)", createdBy: ana.user.id });
  track.group(g.id);
  await db.insert(schema.groupMembers).values([ben, cy].map((p) => ({ groupId: g.id, userId: p.user.id })));
  // A registration the deployed build left in flight names the set alone: finishing it registers nobody here.
  const register = completions.register;
  assert.ok(register);
  assert.equal(await register({ groupId: g.id }, { hash: "0x00", blockNumber: 0n }), true);
  assert.deepEqual(await registeredVoters(g.id), [], "nothing registered by finishing it");
  const usd = await ensureUsd(g.id, ana.user.id);
  const p = await proposeCover({ creditorId: ana.user.id, debtor: { kind: "user", userId: ben.user.id }, groupId: g.id, denomId: usd.id, quantity: units(12n), amountCents: cents(12n), settleExpected: true, memo: "first contact registry" });
  await confirmProposal(p.id, ben.user.id, await ben.ledger.signTypedData(confirmTypedData(p, ana.ledger.address)));
  assert.deepEqual(low(await registeredVoters(g.id)), low([ana, ben].map((s) => s.user.governanceWallet)), "the two sides of the cover, and not Cy, who is in the set and did nothing");
});

test("a guest is saved under the whole name they typed, as the button says it: Justin incognito, not Justin", async () => {
  const { d } = await question([ana, ben]);
  const r = await enterAsGhost({ dareId: d.id, who: { name: "  Justin incognito  ", phoneHash: null, memberClaimId: null }, tokens: [], stake: 1000n, value: 5000n });
  const [claim] = await db.select({ name: schema.participantClaims.displayName }).from(schema.participantClaims).where(eq(schema.participantClaims.id, r.claimId));
  assert.equal(claim?.name, "Justin incognito");
});

test("the server refuses a question closing more than three years out, whatever the phone sent, and takes one inside them", async () => {
  const g = await createGroup({ name: "first contact far (temporary)", createdBy: ana.user.id });
  track.group(g.id);
  const usd = await ensureUsd(g.id, ana.user.id);
  const draft = (resolvesBy: Date) => markets.draftMarket({ creatorId: ana.user.id, groupId: g.id, denomId: usd.id, title: "Are people living on Mars by 2060?", termsText: "Yes if at least one person is living on Mars by the end of 2059. No otherwise.", resolvesBy, stalemate: "void" });
  assert.equal(await codeOf(() => draft(new Date(Date.now() + 4 * 365 * 86_400_000))), "bad_input", "four years out");
  assert.ok((await draft(new Date(Date.now() + 2 * 365 * 86_400_000))).id, "two years out");
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
