/**
 * Entering without an account (PLANNING.md section 4; docs/design.md 3.17), against the real database: a ghost's
 * number goes in with no signature and counts at once, the browser's token keeps the same ghost across changes
 * and markets, the caps hold, a question with a ghost in it locks provisionally, its account-holders decide it
 * with the same governance signatures the chain would take, and it settles here to one proposal per transfer
 * with the ghost on its side; a ghost who signs in becomes the position's owner, and keeping the number is the
 * signature. Nothing here reaches the chain. Rows are the temporary people's and removed after.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { hashPhone } from "@/lib/auth/phone";
import { bindClaimToUser } from "@/lib/ledger/claims";
import { ensureUsd } from "@/lib/ledger/denominations";
import { enterAsGhost, ghostPositionFor, MAX_GHOSTS_PER_MARKET } from "@/lib/ledger/ghost-entry";
import { createGroup, isMember } from "@/lib/ledger/groups";
import * as markets from "@/lib/ledger/markets";
import { isProvisional, thresholdFor } from "@/lib/ledger/provisional";
import { expireMarket } from "@/lib/ledger/settle";
import { cleanup, codeOf, fictionalPhone, tempSigner, track, type Signer } from "./fixture";

let ana: Signer, ben: Signer, cy: Signer, dee: Signer;
before(async () => {
  [ana, ben, cy, dee] = await Promise.all(["Ana", "Ben", "Cy", "Dee"].map((n) => tempSigner(n)));
});
after(cleanup);

async function question(people: Signer[], over: Partial<markets.DraftInput> = {}) {
  const g = await createGroup({ name: "ghost check (temporary)", createdBy: ana.user.id });
  track.group(g.id);
  if (people.length > 1) await db.insert(schema.groupMembers).values(people.slice(1).map((p) => ({ groupId: g.id, userId: p.user.id })));
  const usd = await ensureUsd(g.id, ana.user.id);
  const d0 = await markets.draftMarket({ creatorId: ana.user.id, groupId: g.id, denomId: usd.id, title: "Does John fall asleep during the movie?", termsText: "Yes if John is asleep at any point before the credits. No if he makes it.", resolvesBy: new Date(Date.now() + 3_600_000), ...over });
  const d = await markets.openMarket(d0.id, ana.user.id, await ana.ledger.signTypedData(markets.createTypedData(d0)));
  const enter = async (who: Signer, value: bigint, stake = 1000n) => markets.enterMarket({ dareId: d.id, userId: who.user.id, stake, value, signature: await who.ledger.signTypedData(markets.enterTypedData(d, stake, value)) });
  const vote = async (who: Signer, outcome: bigint) => markets.castVote({ dareId: d.id, userId: who.user.id, outcome, signature: await who.governance.signTypedData(markets.voteTypedData((await markets.marketById(d.id))!, outcome)) });
  const ghost = (who: { name: string; phoneHash?: Buffer | null; memberClaimId?: string | null }, tokens: string[], value: bigint, stake = 1000n) => enterAsGhost({ dareId: d.id, who: { name: who.name, phoneHash: who.phoneHash ?? null, memberClaimId: who.memberClaimId ?? null }, tokens, stake, value });
  return { d, g: g.id, enter, vote, ghost };
}

test("someone with no account puts a number on it: a ghost with a token, counted at once and in the set; the same browser, or the same number, changes it and never doubles it; the cap holds; a locked question refuses", async () => {
  const { d, g, enter, ghost } = await question([ana]);
  await enter(ana, 7000n);
  const phone = hashPhone(fictionalPhone());
  const r1 = await ghost({ name: "Gabe", phoneHash: phone }, [], 9000n);
  assert.ok(r1.browserToken, "a token for this browser");
  assert.deepEqual([r1.position.claimId, r1.position.userId, r1.position.enterSignature, r1.position.enteredBy, r1.position.acknowledgedAt !== null, r1.position.value], [r1.claimId, null, null, ana.user.id, true, 9000n]);
  const [claim] = await db.select().from(schema.participantClaims).where(eq(schema.participantClaims.id, r1.claimId));
  assert.deepEqual([claim?.displayName, claim?.createdBy, claim?.phoneHash?.equals(phone)], ["Gabe", ana.user.id, true], "the ghost is the asker's, carrying the hash a phone login binds by");
  const seat = await db.select().from(schema.groupMembers).where(and(eq(schema.groupMembers.groupId, g), eq(schema.groupMembers.claimId, r1.claimId)));
  assert.equal(seat.length, 1, "in the set, as an account-holder joining by the link would be");
  assert.equal((await markets.positionsOf(d.id)).length, 2, "counted at once");
  assert.equal((await ghostPositionFor(d.id, [r1.browserToken as string]))?.displayName, "Gabe");

  const r2 = await ghost({ name: "Someone else" }, [r1.browserToken as string], 3000n);
  assert.deepEqual([r2.claimId, r2.browserToken, r2.position.value, (await markets.positionsOf(d.id)).length], [r1.claimId, null, 3000n, 2], "the same browser is the same ghost, and the number is theirs to change");
  const r3 = await ghost({ name: "Gabe again", phoneHash: phone }, [], 5000n);
  assert.deepEqual([r3.claimId, (await markets.positionsOf(d.id)).length, r3.browserToken !== null], [r1.claimId, 2, true], "the same number from another browser is the asker's same ghost, with a token of its own");

  for (let i = 1; i < MAX_GHOSTS_PER_MARKET; i += 1) await ghost({ name: `Guest ${i}` }, [], 5000n);
  assert.equal((await markets.positionsOf(d.id)).length, 1 + MAX_GHOSTS_PER_MARKET);
  const full = await ghost({ name: "One too many" }, [], 5000n).catch((e: unknown) => e);
  assert.ok(full instanceof markets.MarketError && full.code === "wrong_state" && /guests/.test(full.message), "the eleventh ghost is refused in words");
  assert.equal((await markets.positionsOf(d.id)).length, 1 + MAX_GHOSTS_PER_MARKET);

  const locked = await markets.lockMarket(d.id, ana.user.id);
  const after = (await markets.marketById(d.id))!;
  assert.deepEqual([isProvisional(after), after.onchainId, locked.threshold, after.threshold], [true, null, thresholdFor(1), thresholdFor(1)], "a ghost in it makes the lock provisional: nothing sent, the asker alone decides");
  assert.equal(await codeOf(() => ghost({ name: "Late" }, [], 5000n)), "wrong_state");
});

test("a provisional question is decided by its account-holders' governance signatures and settled here: one pending proposal per transfer, the ghost on its side, nothing minted; then the ghost signs in and the proposals name them", async () => {
  const { d, enter, vote, ghost } = await question([ana, ben, cy]);
  await enter(ana, 7000n);
  await enter(ben, 3000n);
  await enter(cy, 5000n);
  const gabe = await ghost({ name: "Gabe" }, [], 9000n);
  await markets.lockMarket(d.id, ana.user.id);
  const locked = (await markets.marketById(d.id))!;
  assert.deepEqual([isProvisional(locked), locked.threshold], [true, thresholdFor(3)], "three account-holders: two decide it");
  assert.deepEqual((await markets.quorumOf(locked)).sort(), [ana, ben, cy].map((s) => s.user.governanceWallet.toLowerCase()).sort(), "the quorum is the account-holders, by governance wallet; never the ghost");
  assert.equal(await codeOf(() => vote(dee, 1n)), "not_member", "someone outside cannot call it");
  assert.equal((await vote(ana, 1n)).resolved, false);
  assert.equal((await vote(ben, 1n)).resolved, true);
  const done = (await markets.marketById(d.id))!;
  assert.deepEqual([done.resolvedBy, done.resolvedOutcome, done.onchainId], ["provisional", 1n, null]);
  // Scores as the contract would give them (9100, 5100, 7500, 9900), transfers truncated pairwise over four: every one a proposal.
  const proposals = await db.select().from(schema.obligationProposals).where(and(eq(schema.obligationProposals.origin, "dare"), eq(schema.obligationProposals.originId, d.id)));
  const edge = (p: (typeof proposals)[number]) => `${p.fromUser ?? `claim:${p.fromClaim}`}>${p.toUser ?? `claim:${p.toClaim}`}:${p.quantity}`;
  assert.deepEqual(proposals.map(edge).sort(), [`${ana.user.id}>claim:${gabe.claimId}:26`, `${ben.user.id}>${ana.user.id}:133`, `${ben.user.id}>${cy.user.id}:80`, `${ben.user.id}>claim:${gabe.claimId}:160`, `${cy.user.id}>${ana.user.id}:53`, `${cy.user.id}>claim:${gabe.claimId}:80`].sort());
  assert.ok(proposals.every((p) => p.status === "pending" && p.amountCents === p.quantity && p.settleExpected), "pending, in cents, expected to settle");
  assert.equal((await db.select().from(schema.obligations).where(eq(schema.obligations.originId, d.id))).length, 0, "nothing minted");
  const positions = await markets.positionsOf(d.id);
  assert.deepEqual(positions.map((p) => [p.userId ?? "ghost", p.score, p.net]).sort(), [[ana.user.id, 9100, 160n], [ben.user.id, 5100, -373n], [cy.user.id, 7500, -53n], ["ghost", 9900, 266n]].sort());
  assert.equal(positions.reduce((a, p) => a + (p.net ?? 0n), 0n), 0n, "the nets sum to zero");

  // The ghost signs in: every row that named the ghost names the account, and the ghost's seat is theirs.
  await bindClaimToUser(gabe.claimId, dee.user.id);
  const bound = await db.select().from(schema.obligationProposals).where(and(eq(schema.obligationProposals.origin, "dare"), eq(schema.obligationProposals.originId, d.id)));
  assert.ok(bound.every((p) => p.fromClaim === null && p.toClaim === null), "no ghost left on any side");
  assert.equal(bound.filter((p) => p.toUser === dee.user.id && p.toBoundClaim === gabe.claimId).length, 3, "the three the ghost is owed name the account, remembering the ghost");
  assert.equal((await markets.positionsOf(d.id)).find((p) => p.userId === dee.user.id)?.score, 9900);
});

test("a ghost's number on a number question is checked like anyone's; a provisional question set to go unsettled expires here", async () => {
  const { d, enter, ghost } = await question([ana, ben], { kind: "numeric", title: "How many shirts can Gabe wear at once?", termsText: "Gabe puts on as many shirts as he can, one over another. The count is what is on him when he stops or one tears.", unit: { singular: "shirt", plural: "shirts" }, scale: { range: 20n, source: "asker" }, stalemate: "void" });
  await enter(ana, 14n);
  assert.equal(await codeOf(() => ghost({ name: "Gabe" }, [], 10n ** 10n)), "bad_input", "ten digits is not a number here");
  assert.equal(await codeOf(() => ghost({ name: "Gabe" }, [], 12n, 0n)), "bad_input", "nothing on it is refused");
  const gabe = await ghost({ name: "Gabe" }, [], 12n);
  assert.equal(gabe.position.value, 12n);
  await markets.lockMarket(d.id, ana.user.id);
  assert.ok(isProvisional((await markets.marketById(d.id))!));
  await db.update(schema.dares).set({ resolvesBy: new Date(Date.now() - 1000) }).where(eq(schema.dares.id, d.id));
  assert.equal(await expireMarket(d.id, new Date()), true, "expired here, with nothing on the chain to expire");
  const done = (await markets.marketById(d.id))!;
  assert.deepEqual([done.resolvedBy, done.resolvedOutcome, done.onchainId], ["expired", null, null]);
  assert.equal((await db.select().from(schema.obligationProposals).where(eq(schema.obligationProposals.originId, d.id))).length, 0, "an expiry proposes nothing");
});

test("a ghost who signs in before lock owns the position unsigned, and keeping the number is the signature that makes the question ordinary", async () => {
  const { d, g, enter, ghost } = await question([ana]);
  await enter(ana, 7000n);
  const gabe = await ghost({ name: "Gabe" }, [], 9000n);
  await bindClaimToUser(gabe.claimId, dee.user.id);
  const mine = (await markets.positionsOf(d.id)).find((p) => p.userId === dee.user.id);
  assert.deepEqual([mine?.claimId, mine?.enterSignature, mine?.value, await isMember(g, dee.user.id)], [null, null, 9000n, true], "theirs, unsigned, and in the set");
  await enter(dee, 9000n);
  const signed = await markets.positionsOf(d.id);
  assert.deepEqual([signed.length, signed.find((p) => p.userId === dee.user.id)?.enterSignature !== null], [2, true], "one position, now signed");
});
