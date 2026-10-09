/**
 * The touch-ups round (2026-10-08), against the real database and, for the first test, the real chain. Section 0: a
 * close is the question's, here, first, so two people closing at once close it once, and a chain write that fails
 * leaves it closed for the people in it, tried again by the tick, and settled here as confirmations once the contract
 * has refused it three times. Section 2: the app's ruling on an argument, sealed at the ask, shown at the close, and
 * settled by everyone agreeing, a day of silence, or the tiebreaker someone's dispute sends it to; these questions
 * have someone from the link in them, so nothing of section 2 touches the chain. The tick is scoped to the questions
 * this file made.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { ensureUsd } from "@/lib/ledger/denominations";
import { enterAsGhost } from "@/lib/ledger/ghost-entry";
import { bufferToHex } from "@/lib/ledger/ids";
import { agreementsOf, agreeWithRuling, disputeRuling, disputesOf, disputesToHear, rulingsToStand, rulingTextOf, SILENCE_MS, stampOldRulings } from "@/lib/ledger/rulings";
import { newSalt, sealedText, sealHolds, sealLine, sealOf } from "@/lib/ledger/seal";
import { createGroup } from "@/lib/ledger/groups";
import * as markets from "@/lib/ledger/markets";
import { isProvisional } from "@/lib/ledger/provisional";
import { tick } from "@/lib/ledger/settle";
import { cleanup, codeOf, itHappened, tempSigner, track, type Signer } from "./fixture";

let ana: Signer, ben: Signer;
before(async () => {
  [ana, ben] = await Promise.all(["Ana", "Ben"].map((n) => tempSigner(n)));
});
after(cleanup);

async function question() {
  const g = await createGroup({ name: "close check (temporary)", createdBy: ana.user.id });
  track.group(g.id);
  await db.insert(schema.groupMembers).values({ groupId: g.id, userId: ben.user.id });
  const usd = await ensureUsd(g.id, ana.user.id);
  const d0 = await markets.draftMarket({ creatorId: ana.user.id, groupId: g.id, denomId: usd.id, title: "Does the kettle boil before the toast pops?", termsText: "Yes if the kettle clicks off before the toaster pops. Decided by whoever is in the kitchen.", resolvesBy: new Date(Date.now() + 3_600_000) });
  const d = await markets.openMarket(d0.id, ana.user.id, await ana.ledger.signTypedData(markets.createTypedData(d0)));
  const enter = async (who: Signer, bps: bigint) => markets.enterMarket({ dareId: d.id, userId: who.user.id, stake: 1000n, value: bps, signature: await who.ledger.signTypedData(markets.enterTypedData(d, 1000n, bps)), questionSignature: await who.ledger.signTypedData(markets.questionCreateTypedData(d)) });
  await enter(ana, 7000n);
  await enter(ben, 3000n);
  return d;
}
const closedCount = async (dareId: string) => (await db.select().from(schema.usageEvents).where(and(eq(schema.usageEvents.dareId, dareId), eq(schema.usageEvents.name, "closed")))).length;
const creates = async (dareId: string) => (await db.select().from(schema.chainWrites).where(and(eq(schema.chainWrites.kind, "create"), eq(schema.chainWrites.subject, JSON.stringify({ dareId }))))).filter((w) => w.status === "mined");

test("two people closing at once close it once: one close counted, one create on the chain, and both are answered as done", async () => {
  const d = await question();
  // A moment past its close time, so anyone in it may close it as well as its asker (`mayClose`); the time the asker signed is left as signed.
  const past = new Date((d.resolvesBy as Date).getTime() + 1_000);
  const both = await Promise.allSettled([markets.lockMarket(d.id, ana.user.id, past), markets.lockMarket(d.id, ben.user.id, past)]);
  assert.deepEqual(both.map((r) => r.status), ["fulfilled", "fulfilled"]);
  const after1 = (await markets.marketById(d.id)) as markets.DareRow;
  assert.equal(markets.stateOf(after1), "locked");
  assert.notEqual(after1.onchainId, null, "on the chain");
  assert.equal(after1.chainPendingAt, null, "and nothing left to send");
  assert.equal(await closedCount(d.id), 1, "one close, counted once");
  assert.equal((await creates(d.id)).length, 1, "one create, sent once");
});

test("a close the contract refuses is closed for the people in it, tried again by the tick, and settled here as confirmations at the third refusal", async () => {
  const d = await question();
  // Ben's stored signature is over other numbers than his entry: the contract refuses the create at its simulate, every time, and no gas is spent on it.
  const wrong = await ben.ledger.signTypedData(markets.enterTypedData(d, 1000n, 9000n));
  await db.update(schema.darePositions).set({ enterSignature: Buffer.from(wrong.slice(2), "hex") }).where(and(eq(schema.darePositions.dareId, d.id), eq(schema.darePositions.userId, ben.user.id)));
  const at = new Date();
  const r = await markets.lockMarket(d.id, ana.user.id, at);
  assert.equal(r.pending, true, "the person is answered: closed, with its write still to land");
  let row = (await markets.marketById(d.id)) as markets.DareRow;
  assert.equal(markets.stateOf(row), "locked", "closed for the people in it, whatever the chain said");
  assert.deepEqual([row.onchainId, row.chainTries, isProvisional(row)], [null, 1, false]);
  assert.notEqual(row.chainPendingAt, null);
  assert.equal(await codeOf(() => markets.enterMarket({ dareId: d.id, userId: ben.user.id, stake: 1000n, value: 5000n, signature: "0x00" })), "wrong_state", "nobody gets in or changes a number after the close");
  // A vote while it waits is kept, and the resolution waits for the write.
  await itHappened(d.id);
  assert.deepEqual(await markets.castVote({ dareId: d.id, userId: ana.user.id, outcome: 1n, signature: await ana.governance.signTypedData(markets.voteTypedData(row, 1n)) }), { resolved: false });
  assert.deepEqual(await markets.castVote({ dareId: d.id, userId: ben.user.id, outcome: 1n, signature: await ben.governance.signTypedData(markets.voteTypedData(row, 1n)) }), { resolved: false }, "two of two agree, and still it waits for the chain");
  // The tick holds off while the close's own try holds it, then tries again: refused a second time.
  const tickAt = (ms: number) => tick(new Date(at.getTime() + ms), async () => undefined, { onlyIds: [d.id] });
  await tickAt(30_000);
  assert.equal(((await markets.marketById(d.id)) as markets.DareRow).chainTries, 1, "within the close's own lease nothing is tried");
  await tickAt(markets.CHAIN_LOCK_LEASE_MS + 1_000);
  assert.equal(((await markets.marketById(d.id)) as markets.DareRow).chainTries, 2);
  await tickAt(2 * markets.CHAIN_LOCK_LEASE_MS + 2_000);
  row = (await markets.marketById(d.id)) as markets.DareRow;
  assert.deepEqual([row.chainTries, row.chainPendingAt, row.onchainId], [3, null, null], "the third refusal gives it up");
  assert.match(row.chainGaveUp ?? "", /^the contract refused it/);
  assert.equal(isProvisional(row), true, "decided here now, as a guest's question is");
  // The votes already cast decide it here, and what it leaves comes as a proposal to confirm.
  assert.equal(row.resolvedBy, "provisional");
  assert.equal(row.resolvedOutcome, 1n);
  const proposals = await db.select().from(schema.obligationProposals).where(and(eq(schema.obligationProposals.originId, d.id), eq(schema.obligationProposals.origin, "dare")));
  assert.equal(proposals.length, 1);
  assert.deepEqual([proposals[0]?.fromUser, proposals[0]?.toUser, proposals[0]?.status], [ben.user.id, ana.user.id, "pending"]);
});

// ------------------------------------------------------------------------------------------ section 2: the app's rulings

/**
 * An argument the app ruled on at the ask, between Ana and someone from the link, so it is decided here and nothing goes
 * on the chain: its terms end with the seal of "yes" and two sentences, hashed with a fresh salt.
 */
async function sealedArgument(label: string) {
  const g = await createGroup({ name: `ruling check ${label} (temporary)`, createdBy: ana.user.id });
  track.group(g.id);
  const usd = await ensureUsd(g.id, ana.user.id);
  const rationale = "Hitting a pitched ball in play is the harder skill. Most penalties are scored, so most saves never happen.";
  const salt = newSalt();
  const hash = sealOf(salt, sealedText(1n, rationale, null));
  const d0 = await markets.draftMarket({ creatorId: ana.user.id, groupId: g.id, denomId: usd.id, title: "Is hitting a baseball harder than saving a penalty?", termsText: `Yes if hitting a pitched baseball in play is harder than saving a penalty kick.\n\n${sealLine(hash)}`, resolvesBy: null, pace: "argument", tier: "checkable", stalemate: "arbitrate", settledBy: "facts", seal: { outcome: 1n, confidenceBps: 8000, rationale, salt, hash } });
  const d = await markets.openMarket(d0.id, ana.user.id, await ana.ledger.signTypedData(markets.createTypedData(d0)));
  await markets.enterMarket({ dareId: d.id, userId: ana.user.id, stake: 1000n, value: 10_000n, signature: await ana.ledger.signTypedData(markets.enterTypedData(d, 1000n, 10_000n)) });
  const gabe = await enterAsGhost({ dareId: d.id, who: { name: "Gabe", phoneHash: null, memberClaimId: null }, tokens: [], stake: 1000n, value: 0n });
  return { d, salt, rationale, gabe: { claimId: gabe.claimId as string } };
}
const row = async (id: string) => (await markets.marketById(id)) as markets.DareRow;

test("a ruling made at the ask stays sealed until the close, is shown at it with the salt that checks it against the signed terms, and stands once everyone in agrees", async () => {
  const { d, salt, rationale, gabe } = await sealedArgument("agree");
  assert.deepEqual([d.aiOutcome, d.aiRationale, d.rulingRevealedAt], [null, null, null], "before the close the ruling is nowhere a screen reads");
  assert.equal(await codeOf(() => agreeWithRuling(d.id, { userId: ana.user.id })), "wrong_state", "nobody agrees with a ruling before it is shown");
  const at = new Date();
  await markets.lockMarket(d.id, ana.user.id, at);
  const shown = await row(d.id);
  assert.equal(isProvisional(shown), true, "someone from the link is in, so it is decided here");
  assert.deepEqual([shown.aiOutcome, shown.aiRationale, shown.rulingRevealedAt?.getTime()], [1n, rationale, at.getTime()], "shown in the statement that closes it");
  assert.equal(sealHolds(shown.termsText, bufferToHex(shown.sealSalt as Buffer), rulingTextOf(shown)), true, "the salt and the text shown hash to the seal in the terms everyone signed");
  assert.equal(bufferToHex(shown.sealSalt as Buffer), salt);
  assert.equal(await codeOf(() => agreeWithRuling(d.id, { userId: ben.user.id })), "not_member", "only the people in it answer it");
  assert.deepEqual(await agreeWithRuling(d.id, { userId: ana.user.id }), { settled: false }, "one of two");
  assert.deepEqual(await agreeWithRuling(d.id, { userId: ana.user.id }), { settled: false }, "said again, nothing changes");
  assert.deepEqual(await agreeWithRuling(d.id, gabe), { settled: true }, "everyone in agreeing settles it at once, a guest's tap included");
  const settled = await row(d.id);
  assert.deepEqual([settled.resolvedBy, settled.resolvedOutcome], ["ruling", 1n]);
  assert.equal(settled.rulingText, rulingTextOf(shown), "recorded as the text that was sealed");
  const proposals = await db.select().from(schema.obligationProposals).where(and(eq(schema.obligationProposals.originId, d.id), eq(schema.obligationProposals.origin, "dare")));
  assert.deepEqual(proposals.map((p) => [p.fromClaim, p.toUser, p.status]), [[gabe.claimId, ana.user.id, "pending"]], "what it leaves comes as a proposal to confirm, from the side the ruling went against");
  assert.equal(await codeOf(() => agreeWithRuling(d.id, gabe)), "wrong_state", "and it is decided");
});

test("seeing it differently takes what the ruling got wrong, stops the agreeing, and keeps silence from settling it", async () => {
  const { d, gabe } = await sealedArgument("dispute");
  const at = new Date();
  await markets.lockMarket(d.id, ana.user.id, at);
  assert.equal(await codeOf(() => disputeRuling(d.id, gabe, " ")), "bad_input", "what it got wrong is required");
  await agreeWithRuling(d.id, gabe);
  await disputeRuling(d.id, gabe, "  Keepers guess   the side, so a save is mostly luck.  ");
  const disputes = await disputesOf(d.id);
  assert.deepEqual(disputes.map((x) => [x.pid, x.text]), [[gabe.claimId, "Keepers guess the side, so a save is mostly luck."]], "kept in one line");
  assert.deepEqual(await agreementsOf(d.id), [], "disputing withdraws their own agreement");
  assert.equal(await codeOf(() => agreeWithRuling(d.id, { userId: ana.user.id })), "wrong_state", "once someone sees it differently, the tiebreaker decides");
  const later = new Date(at.getTime() + 2 * SILENCE_MS);
  assert.deepEqual(await rulingsToStand(later, inArray(schema.dares.id, [d.id]), 10), [], "silence never settles a disputed ruling");
  assert.deepEqual((await disputesToHear(later, inArray(schema.dares.id, [d.id]), 10)).map((x) => x.id), [d.id], "the tick hears it if the tiebreaker never answered");
});

test("a day of silence after the ruling is shown settles it, never sooner; an argument ruled before the round counts its day from the first tick that sees it", async () => {
  const { d } = await sealedArgument("silence");
  const at = new Date();
  await markets.lockMarket(d.id, ana.user.id, at);
  await agreeWithRuling(d.id, { userId: ana.user.id });
  const tickAt = (ms: number) => tick(new Date(at.getTime() + ms), async () => undefined, { onlyIds: [d.id] });
  assert.deepEqual((await tickAt(SILENCE_MS - 60_000)).stood, [], "a minute short of the day, nothing");
  assert.equal((await row(d.id)).resolvedAt, null);
  assert.deepEqual((await tickAt(SILENCE_MS + 1_000)).stood, [d.id], "the day out, silence agrees");
  assert.deepEqual([(await row(d.id)).resolvedBy, (await row(d.id)).resolvedOutcome], ["ruling", 1n]);

  const old = await sealedArgument("stamp");
  await markets.lockMarket(old.d.id, ana.user.id, at);
  await db.update(schema.dares).set({ rulingRevealedAt: null }).where(eq(schema.dares.id, old.d.id));
  const scope = inArray(schema.dares.id, [old.d.id]);
  const firstTick = new Date(at.getTime() + 3 * SILENCE_MS);
  assert.equal(await stampOldRulings(firstTick, scope), 1, "given its moment once");
  assert.equal(await stampOldRulings(new Date(firstTick.getTime() + 60_000), scope), 0, "and never again");
  assert.deepEqual(await rulingsToStand(new Date(firstTick.getTime() + SILENCE_MS - 1_000), scope, 10), [], "its day counts from that tick, never from its close");
  assert.deepEqual((await rulingsToStand(new Date(firstTick.getTime() + SILENCE_MS), scope, 10)).map((x) => x.id), [old.d.id]);
});
