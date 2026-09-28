/**
 * Pass the phone against the real database (docs/design.md 3.45; 3.41 amended 2026-09-28): the PIN set and
 * checked under a slow hash, five wrong tries locking it for an hour with one notice to its owner naming whose
 * phone, a right PIN clearing the count, turning it off wiping the delegation's material and the PIN; and the
 * server signing a named routine action from its own inputs alone, refusing what is not this person's to sign,
 * with the signature passing the action's own check. Rows tracked and removed.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { recoverTypedDataAddress, type PrivateKeyAccount } from "viem";
import { db, schema } from "@/db";
import { hasDelegation, seal, storeKey, type SignerLoad } from "@/lib/chain/delegated-signer";
import { ensureUsd } from "@/lib/ledger/denominations";
import { createGroup } from "@/lib/ledger/groups";
import * as markets from "@/lib/ledger/markets";
import { proposeCover } from "@/lib/ledger/proposals";
import { cents, units } from "@/lib/money";
import { checkPin, clearPin, delegatedSignatureFor, LOCK_AFTER, LOCK_FOR_MS, PassThePhoneError, passThePhoneStatus, pinStatus, setPin, turnOffPassThePhone, typedDataFor, whoHasPassThePhone } from "@/lib/ledger/pass-the-phone";
import { cleanup, tempSigner, type Signer } from "./fixture";

let maya: Signer, sam: Signer;
let storeKeyWas: string | undefined;
before(async () => {
  [maya, sam] = await Promise.all(["Maya", "Sam"].map((n) => tempSigner(n)));
  storeKeyWas = process.env.DELEGATION_STORE_KEY;
  if (!/^[0-9a-fA-F]{64}$/.test(storeKeyWas ?? "")) process.env.DELEGATION_STORE_KEY = randomBytes(32).toString("hex");
});
after(async () => {
  for (const s of [maya, sam]) {
    await db.delete(schema.delegatedSignatures).where(eq(schema.delegatedSignatures.userId, s.user.id));
    await db.delete(schema.delegations).where(eq(schema.delegations.userId, s.user.id));
  }
  if (storeKeyWas === undefined) delete process.env.DELEGATION_STORE_KEY;
  else process.env.DELEGATION_STORE_KEY = storeKeyWas;
  await cleanup();
});

/** A stored delegation of this person's ledger wallet, sealed as the receiver seals one, without going through Dynamic. */
async function storeDelegation(who: Signer) {
  const walletId = `w-ledger-${who.user.id.slice(0, 8)}`;
  const binding = `delegation:${who.user.id}:${walletId}`;
  const values = { userId: who.user.id, walletId, walletAddress: who.user.ledgerWallet.toLowerCase(), encryptedShare: seal(Buffer.from(JSON.stringify({ secretShare: "s" }), "utf8"), storeKey(), binding), encryptedApiKey: seal(Buffer.from("k", "utf8"), storeKey(), binding), shareSetId: null, eventId: "evt-pin-1", eventAt: new Date(), grantedAt: new Date(), revokedAt: null };
  await db.insert(schema.delegations).values(values).onConflictDoUpdate({ target: [schema.delegations.userId, schema.delegations.walletId], set: values });
  return walletId;
}
/** Dynamic's delegated signing, stood in for by the person's own ledger key. */
const signingWith = (account: PrivateKeyAccount): SignerLoad => async () => ({ client: {} as Awaited<ReturnType<SignerLoad>>["client"], mod: { delegatedSignTypedData: async (_c, { typedData }) => account.signTypedData(typedData as unknown as Parameters<PrivateKeyAccount["signTypedData"]>[0]) } });
const noticesTo = async (userId: string) => db.select({ kind: schema.notificationLog.kind, seq: schema.notificationLog.seq, causedBy: schema.notificationLog.causedBy }).from(schema.notificationLog).where(and(eq(schema.notificationLog.userId, userId), eq(schema.notificationLog.kind, "pin_locked")));

test("the PIN: four digits or refused, set and checked under a slow hash, never stored as typed; five wrong tries lock it for an hour and tell its owner once, naming whose phone; a right PIN clears the count; off clears it", async () => {
  await assert.rejects(setPin(maya.user.id, "123"), (e: unknown) => e instanceof PassThePhoneError && e.code === "bad_pin");
  await setPin(maya.user.id, "4242");
  const [row] = await db.select().from(schema.passThePhone).where(eq(schema.passThePhone.userId, maya.user.id));
  assert.ok(row && row.pinHash.length === 32 && row.pinSalt.length === 16 && !row.pinHash.toString("latin1").includes("4242"), "a salted hash, never the PIN");
  assert.deepEqual(await pinStatus(maya.user.id), { set: true, lockedUntil: null });
  const now = new Date();
  const host = { hostUserId: sam.user.id, now };
  assert.deepEqual(await checkPin(maya.user.id, "4242", host), { ok: true });
  for (let i = 1; i < LOCK_AFTER; i++) assert.deepEqual(await checkPin(maya.user.id, "0000", host), { ok: false, locked: false, triesLeft: LOCK_AFTER - i }, `wrong try ${i}`);
  assert.deepEqual(await noticesTo(maya.user.id), [], "no notice before the lock");
  const locked = await checkPin(maya.user.id, "0000", host);
  assert.ok(!locked.ok && locked.locked && locked.until.getTime() === now.getTime() + LOCK_FOR_MS, "the fifth locks it for an hour");
  assert.deepEqual(await checkPin(maya.user.id, "4242", host), { ok: false, locked: true, until: locked.until }, "the right PIN is refused while locked");
  assert.deepEqual(await noticesTo(maya.user.id), [{ kind: "pin_locked", seq: 1, causedBy: sam.user.id }], "told once, the host named as the cause");
  const later = { hostUserId: sam.user.id, now: new Date(now.getTime() + LOCK_FOR_MS + 1) };
  assert.deepEqual(await checkPin(maya.user.id, "0000", later), { ok: false, locked: false, triesLeft: LOCK_AFTER - 1 }, "after the hour the tries start again");
  assert.deepEqual(await checkPin(maya.user.id, "4242", later), { ok: true });
  assert.equal((await db.select().from(schema.passThePhone).where(eq(schema.passThePhone.userId, maya.user.id)))[0]?.failedTries, 0, "a right PIN clears the count");
  assert.deepEqual(await checkPin(sam.user.id, "4242", { hostUserId: maya.user.id, now }), { ok: false, locked: false, triesLeft: 0 }, "no PIN set: nothing to check against");
  await clearPin(maya.user.id);
  assert.deepEqual(await pinStatus(maya.user.id), { set: false, lockedUntil: null });
});

test("pass the phone is on with a delegation and a PIN, both; turning it off wipes the delegation's material now and clears the PIN, and the person leaves the set who can be picked", async () => {
  assert.deepEqual(await passThePhoneStatus(maya.user.id), { on: false, delegated: false, pinSet: false });
  await setPin(maya.user.id, "1357");
  assert.deepEqual(await passThePhoneStatus(maya.user.id), { on: false, delegated: false, pinSet: true }, "a PIN alone is not on");
  assert.deepEqual([...(await whoHasPassThePhone([maya.user.id]))], [], "a PIN alone cannot be picked on a friend's phone: nothing could sign the entry");
  await storeDelegation(maya);
  assert.deepEqual(await passThePhoneStatus(maya.user.id), { on: true, delegated: true, pinSet: true });
  assert.deepEqual([...(await whoHasPassThePhone([maya.user.id, sam.user.id]))], [maya.user.id], "only someone with both can be picked on a friend's phone");
  await turnOffPassThePhone(maya.user.id);
  const [row] = await db.select().from(schema.delegations).where(eq(schema.delegations.userId, maya.user.id));
  assert.deepEqual([row?.encryptedShare.length, row?.encryptedApiKey.length, row?.revokedAt !== null], [0, 0, true], "the material wiped, the row kept as the record");
  assert.equal(await hasDelegation(maya.user.id), false);
  assert.deepEqual(await passThePhoneStatus(maya.user.id), { on: false, delegated: false, pinSet: false });
  assert.deepEqual([...(await whoHasPassThePhone([maya.user.id]))], []);
});

test("the server signs a named routine action from its own inputs: the entry's typed data is rebuilt from the ids, the signature recovers to the ledger wallet and passes the action's own check, is recorded against the request, and nothing that is not this person's is signed", async () => {
  const g = await createGroup({ name: "pass the phone check (temporary)", createdBy: sam.user.id });
  (await import("./fixture")).track.group(g.id);
  await db.insert(schema.groupMembers).values({ groupId: g.id, userId: maya.user.id });
  const usd = await ensureUsd(g.id, sam.user.id);
  const d0 = await markets.draftMarket({ creatorId: sam.user.id, groupId: g.id, denomId: usd.id, title: "Does the borrowed phone get Maya in?", termsText: "Yes if her entry lands.", resolvesBy: new Date(Date.now() + 3_600_000) });
  // Sam asks it, with a delegation of his own signing Create from the server (a second device of his).
  await storeDelegation(sam);
  await setPin(sam.user.id, "2468");
  const createSig = await delegatedSignatureFor(sam.user.id, { action: "create", dareId: d0.id }, "tests/db/pass-the-phone.test.ts", { load: signingWith(sam.ledger) });
  assert.ok(createSig, "the asker's Create, signed by the server from the draft alone");
  const d = await markets.openMarket(d0.id, sam.user.id, createSig);
  await assert.rejects(typedDataFor(maya.user.id, { action: "create", dareId: d.id }), (e: unknown) => e instanceof PassThePhoneError && e.code === "not_yours", "only the asker's Create");
  // Maya's entry from Sam's phone: her delegation, the typed data from the ids, never from the client.
  await storeDelegation(maya);
  await setPin(maya.user.id, "1357");
  const via = { action: "enter" as const, dareId: d.id, stake: "500", value: "7000" };
  const { typedData, subject, address } = await typedDataFor(maya.user.id, via);
  assert.deepEqual([subject, address.toLowerCase(), typedData.primaryType, (typedData.message as { stake: bigint }).stake, (typedData.message as { value: bigint }).value], [d.id, maya.user.ledgerWallet.toLowerCase(), "Enter", 500n, 7000n]);
  const signature = await delegatedSignatureFor(maya.user.id, via, "tests/db/pass-the-phone.test.ts", { load: signingWith(maya.ledger) });
  assert.ok(signature, "signed");
  assert.equal((await recoverTypedDataAddress({ ...typedData, signature } as Parameters<typeof recoverTypedDataAddress>[0])).toLowerCase(), maya.user.ledgerWallet.toLowerCase());
  await markets.enterMarket({ dareId: d.id, userId: maya.user.id, stake: 500n, value: 7000n, signature });
  assert.equal((await markets.positionsOf(d.id)).some((p) => p.userId === maya.user.id), true, "the entry landed under the action's own check");
  const [rec] = await db.select().from(schema.delegatedSignatures).where(and(eq(schema.delegatedSignatures.userId, maya.user.id), eq(schema.delegatedSignatures.action, "enter")));
  assert.deepEqual([rec?.subject, rec?.request], [d.id, "tests/db/pass-the-phone.test.ts"], "recorded against the request that caused it");
  // Without a delegation the answer is nothing, never an error: the device signs.
  await turnOffPassThePhone(maya.user.id);
  assert.equal(await delegatedSignatureFor(maya.user.id, via, "tests/db/pass-the-phone.test.ts", { load: signingWith(maya.ledger) }), null);
  // A closed market is not enterable, and a confirm for a proposal that is not this person's is refused before any signing.
  await db.update(schema.dares).set({ lockedAt: new Date() }).where(eq(schema.dares.id, d.id));
  await assert.rejects(typedDataFor(maya.user.id, via), (e: unknown) => e instanceof PassThePhoneError && e.code === "wrong_state");
  const cover = await proposeCover({ creditorId: maya.user.id, debtor: { kind: "user", userId: sam.user.id }, groupId: g.id, denomId: usd.id, quantity: units(500n), amountCents: cents(500n), settleExpected: true, memo: "a beer (check)" });
  await assert.rejects(typedDataFor(maya.user.id, { action: "confirm", proposalId: cover.id }), (e: unknown) => e instanceof PassThePhoneError && e.code === "not_yours", "a cover somebody else has to confirm is not this person's to sign");
  assert.equal((await typedDataFor(sam.user.id, { action: "confirm", proposalId: cover.id })).typedData.primaryType, "Confirm", "the debtor's own is");
});
