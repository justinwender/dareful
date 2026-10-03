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
import { bindByBrowserTokens, bindClaimToUser, leaveEntry, linkEntriesFor } from "@/lib/ledger/claims";
import { ensureUsd } from "@/lib/ledger/denominations";
import { enterAsGhost, ghostPositionFor, MAX_GHOSTS_PER_MARKET, NUMBER_TRIES_PER_HOUR, removeGhostEntry, SUGGEST_AT_MOST, suggestGhostNames } from "@/lib/ledger/ghost-entry";
import { createGroup, isMember } from "@/lib/ledger/groups";
import * as markets from "@/lib/ledger/markets";
import { isProvisional, thresholdFor } from "@/lib/ledger/provisional";
import { expireMarket, tick } from "@/lib/ledger/settle";
import { notifyVoteReminder } from "@/lib/notify";
import { reminderSendTime } from "@/lib/notify/messages";
import { cleanup, codeOf, fictionalPhone, tempSigner, track, type Signer } from "./fixture";

let ana: Signer, ben: Signer, cy: Signer, dee: Signer;
before(async () => {
  [ana, ben, cy, dee] = await Promise.all(["Ana", "Ben", "Cy", "Dee"].map((n) => tempSigner(n)));
});
after(cleanup);

async function question(people: Signer[], over: Partial<markets.DraftInput> = {}, group?: string) {
  const g = group ? { id: group } : await createGroup({ name: "ghost check (temporary)", createdBy: ana.user.id });
  if (!group) track.group(g.id);
  if (!group && people.length > 1) await db.insert(schema.groupMembers).values(people.slice(1).map((p) => ({ groupId: g.id, userId: p.user.id })));
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

test("the asker removes an entry from someone without an account before the lock; nobody else can, not after the lock, and the ghost may enter again", async () => {
  const { d, enter, ghost } = await question([ana, ben]);
  await enter(ana, 7000n);
  const gabe = await ghost({ name: "Gabe" }, [], 9000n);
  assert.equal((await markets.positionsOf(d.id)).length, 2);
  assert.equal(await codeOf(() => removeGhostEntry({ dareId: d.id, claimId: gabe.claimId, byUserId: ben.user.id })), "not_yours", "only the asker");
  await removeGhostEntry({ dareId: d.id, claimId: gabe.claimId, byUserId: ana.user.id });
  assert.equal((await markets.positionsOf(d.id)).length, 1, "removed: the number no longer counts");
  assert.equal(await codeOf(() => removeGhostEntry({ dareId: d.id, claimId: gabe.claimId, byUserId: ana.user.id })), "not_found", "nothing left to remove");
  const again = await ghost({ name: "Gabe" }, [gabe.browserToken as string], 4000n);
  assert.deepEqual([again.claimId, again.position.value, again.position.dismissedAt, (await markets.positionsOf(d.id)).length], [gabe.claimId, 4000n, null, 2], "the same ghost enters again, counted again");
  await enter(ben, 3000n);
  await markets.lockMarket(d.id, ana.user.id);
  assert.equal(await codeOf(() => removeGhostEntry({ dareId: d.id, claimId: gabe.claimId, byUserId: ana.user.id })), "wrong_state", "locked: nobody is removed");
});

test("a picked name joins only with the number it joined with; a wrong one is refused at the field, and too many wrong ones in an hour stop the check answering", async () => {
  const { d, g, enter, ghost } = await question([ana]);
  await enter(ana, 7000n);
  const phone = hashPhone(fictionalPhone());
  const dani = await ghost({ name: "Dani", phoneHash: phone }, [], 9000n);
  const other = hashPhone(fictionalPhone());
  // A second question in the same set, where someone picks Dani's name (3.17, frames 4 and 5).
  const q2 = await question([ana], {}, g);
  await q2.enter(ana, 6000n);
  const wrong = await q2.ghost({ name: "Dani", phoneHash: other, memberClaimId: dani.claimId }, [], 5000n).catch((e: unknown) => e);
  assert.ok(wrong instanceof markets.MarketError && wrong.code === "wrong_number" && wrong.message === "That isn't the number Dani joined with. If you're not Dani, type your own name.", "a different number is the field error, in the design's words");
  const none = await q2.ghost({ name: "Dani", phoneHash: null, memberClaimId: dani.claimId }, [], 5000n).catch((e: unknown) => e);
  assert.ok(none instanceof markets.MarketError && none.code === "wrong_number", "no number at all is refused the same way");
  assert.equal((await markets.positionsOf(q2.d.id)).length, 1, "nothing entered");
  const right = await q2.ghost({ name: "Dani", phoneHash: phone, memberClaimId: dani.claimId }, [], 5000n);
  assert.equal(right.claimId, dani.claimId, "the right number joins as the same ghost");
  assert.equal((await markets.positionsOf(q2.d.id)).length, 2);
  // The check confirms or denies a number, so tries are counted per name: past the limit it stops answering, right number or not.
  const q3 = await question([ana], {}, g);
  await q3.enter(ana, 6000n);
  // Two wrong tries so far (the wrong number and the missing one): the rest up to the limit, then the one at it, then the one past it.
  for (let i = 3; i < NUMBER_TRIES_PER_HOUR; i += 1) await q3.ghost({ name: "Dani", phoneHash: hashPhone(fictionalPhone()), memberClaimId: dani.claimId }, [], 5000n).catch(() => null);
  const limited = await q3.ghost({ name: "Dani", phoneHash: hashPhone(fictionalPhone()), memberClaimId: dani.claimId }, [], 5000n).catch((e: unknown) => e);
  assert.ok(limited instanceof markets.MarketError && limited.code === "wrong_number", `the ${NUMBER_TRIES_PER_HOUR}th wrong number is still a wrong number`);
  const stopped = await q3.ghost({ name: "Dani", phoneHash: phone, memberClaimId: dani.claimId }, [], 5000n).catch((e: unknown) => e);
  assert.ok(stopped instanceof markets.MarketError && stopped.code === "slow_down" && /Give it an hour/.test(stopped.message), "past the limit the check stops answering, even to the right number");
  assert.equal(await codeOf(() => q3.ghost({ name: "Dani", phoneHash: other, memberClaimId: dani.claimId }, [], 5000n)), "slow_down");
  const [tries] = await db.select().from(schema.claimNumberAttempts).where(eq(schema.claimNumberAttempts.claimId, dani.claimId)).limit(1);
  assert.ok(tries && Object.keys(tries).every((k) => ["id", "claimId", "createdAt"].includes(k)), "a try keeps nothing of the number");
  assert.equal(await isMember(g, dani.claimId).catch(() => false), false, "a claim is not a user member");
  assert.equal(await codeOf(() => q3.ghost({ name: "Nobody", phoneHash: phone, memberClaimId: "00000000-0000-4000-8000-000000000000" }, [], 5000n)), "not_found", "a picked name that is not one of the set's ghosts");
});

test("names are suggested only after two letters, from ghosts with a number who joined this set's questions, three at most; someone who joined without a number is never suggested", async () => {
  const { d, g, enter, ghost } = await question([ana]);
  await enter(ana, 7000n);
  await ghost({ name: "Dani Park", phoneHash: hashPhone(fictionalPhone()) }, [], 9000n);
  await ghost({ name: "Dan", phoneHash: null }, [], 8000n);
  await ghost({ name: "Danielle", phoneHash: hashPhone(fictionalPhone()) }, [], 7000n);
  await ghost({ name: "Dante", phoneHash: hashPhone(fictionalPhone()) }, [], 6000n);
  await ghost({ name: "Danny", phoneHash: hashPhone(fictionalPhone()) }, [], 5000n);
  await ghost({ name: "Maya", phoneHash: hashPhone(fictionalPhone()) }, [], 4000n);
  // The only name under these letters joined without a number: with three of five "Da" names shown in no promised order, "Dan" alone could be left out by chance.
  await ghost({ name: "Quinn", phoneHash: null }, [], 3000n);
  assert.deepEqual(await suggestGhostNames(g, "Qu"), [], "a name that joined without a number is never suggested, even as the only match");
  assert.deepEqual(await suggestGhostNames(g, "D"), [], "nothing before the first letters: nobody's name is shown to someone who hasn't started typing their own (3.17)");
  assert.deepEqual(await suggestGhostNames(g, ""), []);
  const d2 = await suggestGhostNames(g, "Da");
  assert.equal(d2.length, SUGGEST_AT_MOST, "three at most");
  assert.ok(d2.every((s) => s.displayName.startsWith("Da")) && !d2.some((s) => s.displayName === "Dan"), "only names starting with the letters, and never a name that joined without a number");
  assert.deepEqual((await suggestGhostNames(g, "dani")).map((s) => s.displayName).sort(), ["Dani Park", "Danielle"], "case does not matter");
  assert.deepEqual((await suggestGhostNames(g, "May")).map((s) => s.displayName), ["Maya"]);
  const elsewhere = await question([ben]);
  await elsewhere.enter(ben, 5000n).catch(() => null);
  assert.deepEqual(await suggestGhostNames(elsewhere.g, "Da"), [], "another set's ghosts are not suggested here");
  // A ghost the asker removed is not suggested by that entry.
  const gone = await question([ana], {}, g);
  await gone.enter(ana, 6000n);
  const solo = await gone.ghost({ name: "Zed", phoneHash: hashPhone(fictionalPhone()) }, [], 5000n);
  assert.deepEqual((await suggestGhostNames(g, "Ze")).map((s) => s.displayName), ["Zed"]);
  await removeGhostEntry({ dareId: gone.d.id, claimId: solo.claimId, byUserId: ana.user.id });
  assert.deepEqual(await suggestGhostNames(g, "Ze"), []);
  void d;
});

test("on a blind question a ghost's entry is final once made, as anyone's is", async () => {
  const { d, enter, ghost } = await question([ana], { revealMode: "blind" });
  await enter(ana, 7000n);
  const gabe = await ghost({ name: "Gabe" }, [], 9000n);
  assert.equal(await codeOf(() => ghost({ name: "Gabe" }, [gabe.browserToken as string], 4000n)), "wrong_state", "the same browser cannot change it");
  assert.equal((await markets.positionsOf(d.id)).find((p) => p.claimId === gabe.claimId)?.value, 9000n);
  assert.equal(await codeOf(() => enter(ana, 6000n)), "wrong_state", "nor can the asker change theirs");
});

test("a ghost's name is never an address or a handle", async () => {
  const { d, enter, ghost } = await question([ana]);
  await enter(ana, 7000n);
  for (const typed of ["justin.wender", "sam@example.com", "jane+dynamic_test", "5550142"]) {
    const refused = await ghost({ name: typed }, [], 9000n).catch((e: unknown) => e);
    assert.ok(refused instanceof markets.MarketError && refused.code === "bad_input" && refused.message === "Say what your friends call you.", `${typed}: refused at the field, in the field's own sentence`);
    const rows = await db.select({ id: schema.participantClaims.id }).from(schema.participantClaims).where(and(eq(schema.participantClaims.createdBy, ana.user.id), eq(schema.participantClaims.displayName, typed)));
    assert.equal(rows.length, 0, `${typed}: no ghost was made under it`);
  }
  assert.equal((await markets.positionsOf(d.id)).length, 1, "nothing entered");
  const alex = await ghost({ name: "Alex" }, [], 9000n);
  assert.deepEqual([(await markets.positionsOf(d.id)).length, (await ghostPositionFor(d.id, [alex.browserToken as string]))?.displayName], [2, "Alex"], "a name still enters");
});

test("at sign-in an entry made from a link is listed by the name it was typed under, and one left out goes back to a fresh ghost in stone that no login binds again", async () => {
  const { d, g, enter, ghost } = await question([ana]);
  await enter(ana, 7000n);
  const phone = hashPhone(fictionalPhone());
  const dani = await ghost({ name: "Dani", phoneHash: phone }, [], 9000n);
  const q2 = await question([ana], {}, g);
  await q2.enter(ana, 6000n);
  await q2.ghost({ name: "Dani", phoneHash: phone, memberClaimId: dani.claimId }, [], 3000n);
  await bindClaimToUser(dani.claimId, cy.user.id);
  const listed = await linkEntriesFor(cy.user.id);
  assert.deepEqual(listed.map((e) => [e.dare.id, e.name, e.value]).sort(), [[d.id, "Dani", 9000n], [q2.d.id, "Dani", 3000n]].sort(), "both entries, by the typed name, with their numbers");
  assert.equal(await leaveEntry(q2.d.id, cy.user.id), true);
  const left = (await markets.positionsOf(q2.d.id)).find((p) => p.userId !== ana.user.id);
  assert.ok(left && left.userId === null && left.claimId !== null && left.claimId !== dani.claimId, "the entry stands under a fresh ghost");
  const [fresh] = await db.select().from(schema.participantClaims).where(eq(schema.participantClaims.id, left?.claimId as string));
  assert.deepEqual([fresh?.displayName, fresh?.phoneHash, fresh?.claimedBy], ["Dani", null, null], "the typed name, no number, nobody's: it never becomes this person's");
  assert.deepEqual((await linkEntriesFor(cy.user.id)).map((e) => e.dare.id), [d.id], "and it is off the list");
  assert.equal(await leaveEntry(q2.d.id, cy.user.id), false, "nothing left to leave");
  assert.equal(await isMember(g, cy.user.id), true);
  await enter(cy, 9000n);
  assert.deepEqual(await linkEntriesFor(cy.user.id), [], "keeping the other is the signature, and the list empties");
});

test("one guest's entries on two questions fold into one account at sign-in, each kept once at its number", async () => {
  const q1 = await question([ana]);
  const q2 = await question([ana]);
  await q1.enter(ana, 7000n);
  await q2.enter(ana, 6000n);
  const first = await q1.ghost({ name: "Noa" }, [], 4000n);
  const second = await q2.ghost({ name: "Noa" }, [first.browserToken as string], 3000n);
  assert.equal(second.claimId, first.claimId, "the same browser is the same guest on the next question");
  const noa = await tempSigner("Noa");
  assert.deepEqual(await bindByBrowserTokens(noa.user.id, [first.browserToken as string]), [first.claimId]);
  for (const [q, value] of [[q1, 4000n], [q2, 3000n]] as const) {
    const ps = await markets.positionsOf(q.d.id);
    assert.equal(ps.length, 2, "two in, as before the sign-in");
    assert.equal(ps.filter((p) => p.userId === noa.user.id).length, 1, "the guest's entry is the account's now, once");
    assert.equal(ps.find((p) => p.userId === noa.user.id)?.value, value);
  }
});

test("the close time ends editing: every entry and change is stamped, at a close after the time an entry changed after it is left out, and with fewer than two that count the question ends as an expiry", async () => {
  const H = 3_600_000;
  const close = new Date(Date.now() - H);
  const stamp = (dareId: string, at: Date) => db.update(schema.darePositions).set({ changedAt: at }).where(eq(schema.darePositions.dareId, dareId));
  const lateFor = (dareId: string, claimId: string) => db.update(schema.darePositions).set({ changedAt: new Date(close.getTime() + 60_000) }).where(and(eq(schema.darePositions.dareId, dareId), eq(schema.darePositions.claimId, claimId)));
  const q = await question([ana]);
  // Every entry is stamped, and a change moves the stamp: the data can say when an entry last changed.
  const mine = await q.enter(ana, 7000n);
  assert.ok(mine.changedAt, "an entry is stamped");
  await new Promise((r) => setTimeout(r, 20));
  const changed = await q.enter(ana, 6500n);
  assert.ok(changed.changedAt && mine.changedAt && changed.changedAt.getTime() > mine.changedAt.getTime(), "a change moves the stamp");
  const early = await q.ghost({ name: "Early" }, [], 4000n);
  assert.ok(early.position.changedAt, "a guest's entry is stamped too");
  const late = await q.ghost({ name: "Late" }, [], 3000n);
  // The time passes with the question still open, and one entry was changed after it.
  await db.update(schema.dares).set({ resolvesBy: close }).where(eq(schema.dares.id, q.d.id));
  await stamp(q.d.id, new Date(close.getTime() - H));
  await lateFor(q.d.id, late.claimId);
  assert.equal(await codeOf(() => q.ghost({ name: "Later still" }, [], 5000n)), "wrong_state", "past the close time nobody gets in");
  assert.equal(await codeOf(() => q.enter(ana, 2000n)), "wrong_state", "and nobody changes theirs");
  const r = await markets.lockMarket(q.d.id, ana.user.id);
  assert.notEqual(r.expired, true);
  const m = await markets.marketById(q.d.id);
  assert.ok(m?.lockedAt && !m.resolvedAt, "closed, with the two that count");
  assert.deepEqual((await markets.positionsOf(q.d.id)).map((p) => p.claimId ?? "ana").sort(), [early.claimId, "ana"].sort(), "the entry changed after the close time is out of the close");
  // Two in and one of them changed after the close time: fewer than two count, so it ends as an expiry, by a person's close or by the tick.
  for (const by of ["person", "tick"] as const) {
    const x = await question([ana]);
    await x.enter(ana, 7000n);
    const g = await x.ghost({ name: "Late" }, [], 3000n);
    await db.update(schema.dares).set({ resolvesBy: close }).where(eq(schema.dares.id, x.d.id));
    await stamp(x.d.id, new Date(close.getTime() - H));
    await lateFor(x.d.id, g.claimId);
    if (by === "person") assert.equal((await markets.lockMarket(x.d.id, ana.user.id)).expired, true);
    else assert.deepEqual((await tick(new Date(), async () => undefined, { onlyIds: [x.d.id] })).expired, [x.d.id]);
    const ended = await markets.marketById(x.d.id);
    assert.deepEqual([ended?.resolvedBy, ended?.lockedAt, ended?.resolvedOutcome], ["expired", null, null], `${by}: an expiry, nothing closed and nothing decided`);
    assert.equal((await markets.positionsOf(x.d.id)).length, 2, "the record of who was in stays");
  }
});

test("the twelve-hour reminder is held to each person's own night: someone whose zone is at night waits for their morning while the others are told, and the question is marked only once nobody is waiting", async () => {
  const H = 3_600_000;
  const zones = ["UTC", "America/New_York", "America/Los_Angeles", "Pacific/Honolulu", "Asia/Tokyo", "Australia/Sydney", "Europe/London", "Asia/Kolkata"];
  const due = new Date(Date.now() - H);
  const day = zones.find((z) => reminderSendTime(due, z).getTime() <= Date.now());
  const night = zones.find((z) => reminderSendTime(due, z).getTime() > Date.now());
  assert.ok(day && night, "one zone in daytime and one at night");
  const q = await question([ana, ben, cy]);
  await q.enter(ana, 7000n);
  await q.enter(ben, 4000n);
  await q.enter(cy, 2000n);
  // A guest makes it a question that closes here, so its voters are read here.
  await q.ghost({ name: "Guest" }, [], 5000n);
  await markets.lockMarket(q.d.id, ana.user.id);
  await db.update(schema.dares).set({ lockedAt: new Date(due.getTime() - 12 * H), zone: day }).where(eq(schema.dares.id, q.d.id));
  await db.update(schema.users).set({ zone: day }).where(eq(schema.users.id, ben.user.id));
  await db.update(schema.users).set({ zone: night }).where(eq(schema.users.id, cy.user.id));
  const told = () => db.select({ userId: schema.notificationLog.userId }).from(schema.notificationLog).where(and(eq(schema.notificationLog.dareId, q.d.id), eq(schema.notificationLog.kind, "vote_reminder")));
  assert.deepEqual(await notifyVoteReminder(q.d.id, new Date()), { sent: 2, waiting: 1 });
  assert.deepEqual((await told()).map((t) => t.userId).sort(), [ana.user.id, ben.user.id].sort(), "Ana by the asker's zone, Ben by his own; Cy's night is his own");
  const notifyVoting = { opened: async () => undefined, remind: (id: string) => notifyVoteReminder(id, new Date()) };
  const first = await tick(new Date(), async () => undefined, { onlyIds: [q.d.id], notifyVoting });
  assert.deepEqual([first.reminded, (await markets.marketById(q.d.id))?.voteRemindedAt ?? null], [[], null], "Cy is still waiting on his morning");
  // His morning comes.
  await db.update(schema.users).set({ zone: day }).where(eq(schema.users.id, cy.user.id));
  const second = await tick(new Date(), async () => undefined, { onlyIds: [q.d.id], notifyVoting });
  assert.deepEqual(second.reminded, [q.d.id]);
  assert.equal((await told()).length, 3, "each person once");
  assert.deepEqual(await notifyVoteReminder(q.d.id, new Date()), { sent: 0, waiting: 0 }, "and never a second");
});
