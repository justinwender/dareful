/**
 * Handing the phone over, against the real database (docs/design.md 3.45): who can be picked and who is not set
 * up, the friend's entry from the host's phone (the PIN checked and counted against the friend's lock with the
 * host named, the friend's own delegated share signing an entry the server built, the host recorded on it),
 * the refusals (not the host's to hand over, not sent to the friend, the friend in already, no PIN, a wrong
 * PIN), the entered-from notice once, and the blind withdrawal from the friend's own phone that closes the market
 * to them for good. Rows tracked and removed; Dynamic's signing stood in for by the friend's own key.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { PrivateKeyAccount } from "viem";
import { db, schema } from "@/db";
import { seal, storeKey, type SignerLoad } from "@/lib/chain/delegated-signer";
import { ensureUsd } from "@/lib/ledger/denominations";
import { createGroup } from "@/lib/ledger/groups";
import { canHandOver, enterFromHost, handOverCandidates, withdrawHostedEntry } from "@/lib/ledger/hand-over";
import * as markets from "@/lib/ledger/markets";
import { LOCK_AFTER, setPin } from "@/lib/ledger/pass-the-phone";
import { notifyEnteredFrom } from "@/lib/notify";
import { cleanup, codeOf, tempSigner, track, type Signer } from "./fixture";

let sam: Signer, maya: Signer, theo: Signer, nia: Signer;
let storeKeyWas: string | undefined;
before(async () => {
  [sam, maya, theo, nia] = await Promise.all(["Sam", "Maya", "Theo", "Nia"].map((n) => tempSigner(n)));
  storeKeyWas = process.env.DELEGATION_STORE_KEY;
  if (!/^[0-9a-fA-F]{64}$/.test(storeKeyWas ?? "")) process.env.DELEGATION_STORE_KEY = randomBytes(32).toString("hex");
});
after(async () => {
  for (const s of [sam, maya, theo, nia]) {
    await db.delete(schema.delegatedSignatures).where(eq(schema.delegatedSignatures.userId, s.user.id));
    await db.delete(schema.delegations).where(eq(schema.delegations.userId, s.user.id));
  }
  if (storeKeyWas === undefined) delete process.env.DELEGATION_STORE_KEY;
  else process.env.DELEGATION_STORE_KEY = storeKeyWas;
  await cleanup();
});

async function storeDelegation(who: Signer) {
  const walletId = `w-ledger-${who.user.id.slice(0, 8)}`;
  const binding = `delegation:${who.user.id}:${walletId}`;
  const values = { userId: who.user.id, walletId, walletAddress: who.user.ledgerWallet.toLowerCase(), encryptedShare: seal(Buffer.from(JSON.stringify({ secretShare: "s" }), "utf8"), storeKey(), binding), encryptedApiKey: seal(Buffer.from("k", "utf8"), storeKey(), binding), shareSetId: null, eventId: "evt-hand-1", eventAt: new Date(), grantedAt: new Date(), revokedAt: null };
  await db.insert(schema.delegations).values(values).onConflictDoUpdate({ target: [schema.delegations.userId, schema.delegations.walletId], set: values });
}
const signingWith = (account: PrivateKeyAccount): SignerLoad => async () => ({ client: {} as Awaited<ReturnType<SignerLoad>>["client"], mod: { delegatedSignTypedData: async (_c, { typedData }) => account.signTypedData(typedData as unknown as Parameters<PrivateKeyAccount["signTypedData"]>[0]) } });

async function question(title: string, revealMode: "open" | "blind" = "open") {
  const g = await createGroup({ name: "hand over check (temporary)", createdBy: sam.user.id });
  track.group(g.id);
  await db.insert(schema.groupMembers).values([maya, theo].map((p) => ({ groupId: g.id, userId: p.user.id })));
  const usd = await ensureUsd(g.id, sam.user.id);
  const d0 = await markets.draftMarket({ creatorId: sam.user.id, groupId: g.id, denomId: usd.id, title, termsText: "Yes if it happens tonight.", resolvesBy: new Date(Date.now() + 3_600_000), revealMode });
  const d = await markets.openMarket(d0.id, sam.user.id, await sam.ledger.signTypedData(markets.createTypedData(d0)));
  const enter = async (who: Signer, value: bigint, stake = 500n) => markets.enterMarket({ dareId: d.id, userId: who.user.id, stake, value, signature: await who.ledger.signTypedData(markets.enterTypedData(d, stake, value)) });
  return { d, g: g.id, enter };
}
const hosted = (d: string, friend: Signer, pin: string, host: Signer = sam) => enterFromHost({ dareId: d, hostId: host.user.id, friendId: friend.user.id, stake: 500n, value: 6000n, pin, request: "tests/db/hand-over.test.ts", deps: { load: signingWith(friend.ledger) } });

test("who's joining: the people the market was sent to who aren't in yet, ready when pass the phone is on, and the host's own ready people once nobody named is left; the host must be in and the market open", async () => {
  const { d, enter } = await question("Does the handed phone get Maya in?");
  assert.equal(await canHandOver(d.id, sam.user.id), false, "not in yet: nothing to hand over");
  await enter(sam, 7000n);
  assert.equal(await canHandOver(d.id, sam.user.id), true);
  assert.equal(await canHandOver(d.id, maya.user.id), false, "only someone in");
  await storeDelegation(maya);
  await setPin(maya.user.id, "4242");
  assert.deepEqual((await handOverCandidates(d.id, sam.user.id)).map((c) => [c.name, c.ready]), [["Maya", true], ["Theo", false]], "the ready first; Theo has not set it up");
  await enter(maya, 3000n);
  assert.deepEqual((await handOverCandidates(d.id, sam.user.id)).map((c) => c.name), ["Theo"], "in already: not a candidate");
  // Everyone named is in: the list falls back to the host's own people with pass the phone on (Round C). Nia shares a set with Sam and was not named here.
  await enter(theo, 5000n);
  const side = await createGroup({ name: "hand over fallback (temporary)", createdBy: sam.user.id });
  track.group(side.id);
  await db.insert(schema.groupMembers).values([{ groupId: side.id, userId: nia.user.id }]);
  assert.deepEqual(await handOverCandidates(d.id, sam.user.id), [], "Nia has not set it up: the fallback lists the ready alone, and names nobody's absence");
  await storeDelegation(nia);
  await setPin(nia.user.id, "1357");
  assert.deepEqual((await handOverCandidates(d.id, sam.user.id)).map((c) => [c.name, c.ready]), [["Nia", true]], "the host's own people, ready, once nobody named is left");
  assert.deepEqual(await handOverCandidates(d.id, maya.user.id), [], "the fallback is the host's people, not the market's: Maya shares nothing with Nia");
  await db.update(schema.dares).set({ lockedAt: new Date() }).where(eq(schema.dares.id, d.id));
  assert.equal(await canHandOver(d.id, sam.user.id), false, "closed: nothing to hand over");
});

test("the friend's entry from the host's phone: the PIN first, counted against the friend's lock with the host named, then the friend's own share signs an entry the server built, recorded against the request and the host; the refusals say why; the notice goes once", async () => {
  const { d, enter } = await question("Does the PIN get Maya in?");
  await storeDelegation(maya);
  await setPin(maya.user.id, "4242");
  const before = await hosted(d.id, maya, "4242");
  assert.ok(!before.ok && "refused" in before && /you're in/.test(before.refused), "the host must be in");
  await enter(sam, 7000n);
  assert.ok((await hosted(d.id, sam, "4242")).ok === false, "never yourself");
  const theoTry = await hosted(d.id, theo, "0000");
  assert.ok(!theoTry.ok && "refused" in theoTry && /set up/.test(theoTry.refused), "not set up: refused before any PIN is counted");
  const wrong = await hosted(d.id, maya, "0000");
  assert.ok(!wrong.ok && "pin" in wrong && !wrong.pin.locked && wrong.pin.triesLeft === LOCK_AFTER - 1, "a wrong PIN, with the tries left");
  assert.equal((await db.select().from(schema.delegatedSignatures).where(eq(schema.delegatedSignatures.userId, maya.user.id))).length, 0, "nothing signed on a wrong PIN");
  const right = await hosted(d.id, maya, "4242");
  assert.ok(right.ok, "the right PIN gets her in");
  const [pos] = await db.select().from(schema.darePositions).where(and(eq(schema.darePositions.dareId, d.id), eq(schema.darePositions.userId, maya.user.id)));
  assert.deepEqual([pos?.enteredBy, pos?.value, pos?.enterSignature !== null, pos?.questionSignature !== null], [sam.user.id, 6000n, true, true], "hers, signed with the terms over the question's own group beside it, and the host recorded on it");
  const recs = await db.select().from(schema.delegatedSignatures).where(eq(schema.delegatedSignatures.userId, maya.user.id));
  assert.deepEqual(recs.map((r) => [r.action, r.subject, r.request]).sort(), [["create", d.id, "tests/db/hand-over.test.ts"], ["enter", d.id, "tests/db/hand-over.test.ts"]], "each recorded against the request that caused it");
  const again = await hosted(d.id, maya, "4242");
  assert.ok(!again.ok && "refused" in again && /in already/.test(again.refused), "in already: not a candidate");
  // The notice on her own account, once.
  await notifyEnteredFrom(maya.user.id, sam.user.id, d.id);
  await notifyEnteredFrom(maya.user.id, sam.user.id, d.id);
  const notices = await db.select({ kind: schema.notificationLog.kind, causedBy: schema.notificationLog.causedBy }).from(schema.notificationLog).where(and(eq(schema.notificationLog.userId, maya.user.id), eq(schema.notificationLog.dareId, d.id)));
  assert.deepEqual(notices, [{ kind: "entered_from", causedBy: sam.user.id }], "told once, the host as the cause");
});

test("a blind entry made on a friend's phone can be withdrawn from the person's own phone before the close, and never entered again; an open one is changed instead, and a self-made entry cannot be withdrawn", async () => {
  const blind = await question("Is the blind entry withdrawable?", "blind");
  await blind.enter(sam, 7000n);
  await storeDelegation(maya);
  await setPin(maya.user.id, "4242");
  assert.ok((await hosted(blind.d.id, maya, "4242")).ok);
  assert.equal(await codeOf(() => withdrawHostedEntry(blind.d.id, sam.user.id)), "wrong_state", "the host's own entry was not made on a friend's phone");
  await withdrawHostedEntry(blind.d.id, maya.user.id);
  assert.equal((await markets.positionsOf(blind.d.id)).some((p) => p.userId === maya.user.id), false, "out, and counting for nothing");
  assert.equal(await codeOf(() => blind.enter(maya, 5000n)), "wrong_state", "and never in again, from her own phone");
  const hostedAgain = await hosted(blind.d.id, maya, "4242");
  assert.ok(!hostedAgain.ok && "refused" in hostedAgain && /withdrew/.test(hostedAgain.refused), "nor from the host's");
  const open = await question("Is the open entry changed instead?");
  await open.enter(sam, 7000n);
  assert.ok((await hosted(open.d.id, maya, "4242")).ok);
  assert.equal(await codeOf(() => withdrawHostedEntry(open.d.id, maya.user.id)), "wrong_state", "an open market's entry is hers to change until the close");
  await open.enter(maya, 2000n);
  assert.equal((await markets.positionsOf(open.d.id)).find((p) => p.userId === maya.user.id)?.value, 2000n, "changed from her own phone");
});
