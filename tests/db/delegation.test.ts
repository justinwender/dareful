/**
 * The delegation store against the real database (docs/decisions.md 2026-09-27): the receiver stores a ledger
 * wallet's materials sealed and bound to their row, refuses the governance wallet before decrypting anything
 * (and the database refuses it again), ignores a replay, keeps the newer of two events, wipes the material on
 * revocation, and the signer refuses the governance address before any lookup and degrades to a prompt for
 * everything else. Dynamic's own decrypt is the oracle for the envelope: the test wraps a fake share under a
 * throwaway RSA pair exactly as Dynamic's `decryptDelegatedWebhookData` expects, and if the wrapping were
 * wrong the store would hold nothing. Nothing here reaches Dynamic to sign; the gate script does that.
 */
import assert from "node:assert/strict";
import { createCipheriv, createHmac, generateKeyPairSync, publicEncrypt, randomBytes, constants as cryptoConstants } from "node:crypto";
import { after, before, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { decryptDelegatedWebhookData } from "@dynamic-labs-wallet/node";
import { db, schema } from "@/db";
import { DelegationUnavailable, delegatedWalletFor, GovernanceNeverDelegated, hasDelegation, open, receiveDelegationEvent, storeKey } from "@/lib/chain/delegated-signer";
import { cleanup, tempSigner, type Signer } from "./fixture";

const SECRET = "whsec_test_delegation";
const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();

/** Dynamic's hybrid envelope: an AES-256-GCM key wrapped with RSA-OAEP-SHA256, all fields base64url. */
function envelope(plain: string) {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(plain, "utf8")), cipher.final()]);
  const ek = publicEncrypt({ key: pair.publicKey, padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, key);
  return { alg: "HYBRID-RSA-AES-256", iv: iv.toString("base64url"), ct: ct.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), ek: ek.toString("base64url") };
}
const signed = (body: string) => `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
const created = (who: Signer, walletId: string, address: string, eventId: string, timestamp: string, share = { pubkey: { pubkey: "AQ" }, secretShare: `share-for-${walletId}` }) =>
  JSON.stringify({
    eventName: "wallet.delegation.created",
    eventId,
    timestamp,
    userId: who.user.dynamicUserId,
    data: { chain: "EVM", walletId, shareSetId: `set-${walletId}`, publicKey: address, userId: who.user.dynamicUserId, encryptedDelegatedShare: envelope(JSON.stringify(share)), encryptedWalletApiKey: envelope(`key-for-${walletId}`) },
  });
const revoked = (who: Signer, walletId: string, eventId: string, timestamp: string) => JSON.stringify({ eventName: "wallet.delegation.revoked", eventId, timestamp, userId: who.user.dynamicUserId, data: { walletId, chain: "EVM" } });
/** The receiver's own decrypt runs; Dynamic's is asked separately below, on the same envelopes, as the oracle. */
const deps = { secret: SECRET, privateKeyPem };

let me: Signer;
let storeKeyWas: string | undefined;
before(async () => {
  me = await tempSigner("Delia");
  storeKeyWas = process.env.DELEGATION_STORE_KEY;
  if (!/^[0-9a-fA-F]{64}$/.test(storeKeyWas ?? "")) process.env.DELEGATION_STORE_KEY = randomBytes(32).toString("hex");
});
after(async () => {
  await db.delete(schema.delegatedSignatures).where(eq(schema.delegatedSignatures.userId, me.user.id));
  await db.delete(schema.delegations).where(eq(schema.delegations.userId, me.user.id));
  if (storeKeyWas === undefined) delete process.env.DELEGATION_STORE_KEY;
  else process.env.DELEGATION_STORE_KEY = storeKeyWas;
  await cleanup();
});

test("the receiver: a ledger wallet's event is verified over its bytes, decrypted, sealed to its row and stored; a replay and an older event change nothing; the governance wallet is refused before decrypting, and by the database", async () => {
  const D = schema.delegations;
  const ledgerId = `w-ledger-${me.user.id.slice(0, 8)}`;
  const govId = `w-gov-${me.user.id.slice(0, 8)}`;
  const body = created(me, ledgerId, me.user.ledgerWallet, "evt-1", "2026-09-27T10:00:00.000Z");
  assert.deepEqual(await receiveDelegationEvent(body, "sha256=" + "0".repeat(64), deps), { ok: false, status: 401, reason: "bad signature" });
  assert.deepEqual(await receiveDelegationEvent(`${body} `, signed(body), deps), { ok: false, status: 401, reason: "bad signature" }, "the bytes hashed are the bytes received");
  assert.deepEqual(await receiveDelegationEvent("{", signed("{"), deps), { ok: false, status: 400, reason: "not JSON" });
  assert.deepEqual(await receiveDelegationEvent('{"eventName":"ping"}', null, deps), { ok: true, kind: "ignored" }, "the reachability ping needs no signature and does nothing");
  assert.deepEqual(await receiveDelegationEvent(body, signed(body), deps), { ok: true, kind: "stored", walletId: ledgerId });
  const [row] = await db.select().from(D).where(and(eq(D.userId, me.user.id), eq(D.walletId, ledgerId)));
  assert.ok(row, "the row");
  assert.deepEqual([row.walletAddress, row.shareSetId, row.eventId, row.eventAt?.toISOString(), row.revokedAt], [me.user.ledgerWallet.toLowerCase(), `set-${ledgerId}`, "evt-1", "2026-09-27T10:00:00.000Z", null]);
  const binding = `delegation:${me.user.id}:${ledgerId}`;
  assert.equal(open(row.encryptedApiKey, storeKey(), binding)?.toString("utf8"), `key-for-${ledgerId}`, "the per-wallet key, sealed under the app's key and bound to the row");
  assert.equal(JSON.parse(open(row.encryptedShare, storeKey(), binding)!.toString("utf8")).secretShare, `share-for-${ledgerId}`, "the share, the same way");
  const sent = (JSON.parse(body) as { data: { encryptedDelegatedShare: Parameters<typeof decryptDelegatedWebhookData>[0]["encryptedDelegatedKeyShare"]; encryptedWalletApiKey: Parameters<typeof decryptDelegatedWebhookData>[0]["encryptedWalletApiKey"] } }).data;
  const theirs = decryptDelegatedWebhookData({ privateKeyPem, encryptedDelegatedKeyShare: sent.encryptedDelegatedShare, encryptedWalletApiKey: sent.encryptedWalletApiKey });
  assert.deepEqual([theirs.decryptedWalletApiKey, (theirs.decryptedDelegatedShare as { secretShare: string }).secretShare], [`key-for-${ledgerId}`, `share-for-${ledgerId}`], "Dynamic's own decrypt opens the same envelopes to the same values: the oracle for the format");
  assert.equal(open(row.encryptedShare, storeKey(), `delegation:${me.user.id}:other`), null, "another row's binding opens nothing");
  assert.ok(!row.encryptedShare.toString("latin1").includes("share-for"), "never stored in the clear");
  assert.equal(await hasDelegation(me.user.id), true);

  // A replay of the same event, and an older event, change nothing.
  assert.deepEqual(await receiveDelegationEvent(body, signed(body), deps), { ok: true, kind: "duplicate", walletId: ledgerId });
  const older = created(me, ledgerId, me.user.ledgerWallet, "evt-0", "2026-09-27T09:00:00.000Z");
  assert.deepEqual(await receiveDelegationEvent(older, signed(older), deps), { ok: true, kind: "stale", walletId: ledgerId });
  assert.equal((await db.select({ eventId: D.eventId }).from(D).where(and(eq(D.userId, me.user.id), eq(D.walletId, ledgerId))))[0]?.eventId, "evt-1");

  // The governance wallet: refused before anything is decrypted (a decrypt that throws would otherwise answer 400).
  const gov = created(me, govId, me.user.governanceWallet, "evt-2", "2026-09-27T10:01:00.000Z");
  const exploding = { ...deps, decrypt: () => { throw new Error("must not be reached"); } };
  assert.deepEqual(await receiveDelegationEvent(gov, signed(gov), exploding), { ok: true, kind: "refused", walletId: govId });
  assert.equal((await db.select().from(D).where(and(eq(D.userId, me.user.id), eq(D.walletId, govId)))).length, 0, "nothing stored for it");
  // And the database refuses one that somehow arrives, belt and braces (migration 0001).
  await assert.rejects(db.insert(D).values({ userId: me.user.id, walletId: govId, walletAddress: me.user.governanceWallet, encryptedShare: Buffer.from("x"), encryptedApiKey: Buffer.from("y") }), (err: unknown) => /governance wallet/.test(String((err as { cause?: { message?: string } }).cause?.message ?? (err as Error).message)));
  // A third address is refused the same way; an event about nobody we know is 422, so Dynamic keeps it to replay.
  const third = created(me, "w-3", "0x0000000000000000000000000000000000000003", "evt-3", "2026-09-27T10:02:00.000Z");
  assert.deepEqual(await receiveDelegationEvent(third, signed(third), exploding), { ok: true, kind: "refused", walletId: "w-3" });
  const nobody = JSON.parse(body) as { userId: string };
  nobody.userId = "tmp-check:nobody";
  const nb = JSON.stringify(nobody);
  assert.deepEqual(await receiveDelegationEvent(nb, signed(nb), deps), { ok: false, status: 422, reason: "no such user" });
  // Material that will not decrypt is a 400, never a stored blank.
  const wrongKey = { ...deps, privateKeyPem: generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
  const again = created(me, ledgerId, me.user.ledgerWallet, "evt-4", "2026-09-27T10:03:00.000Z");
  assert.deepEqual(await receiveDelegationEvent(again, signed(again), wrongKey), { ok: false, status: 400, reason: "could not decrypt" });
  assert.equal((await db.select({ eventId: D.eventId }).from(D).where(and(eq(D.userId, me.user.id), eq(D.walletId, ledgerId))))[0]?.eventId, "evt-1", "unchanged");
});

test("the signer: the governance address is refused before any lookup; the ledger wallet's delegation opens; revocation wipes the material and turns prompts back on", async () => {
  const D = schema.delegations;
  const ledgerId = `w-ledger-${me.user.id.slice(0, 8)}`;
  await assert.rejects(delegatedWalletFor(me.user.id, me.user.governanceWallet), GovernanceNeverDelegated);
  await assert.rejects(delegatedWalletFor(me.user.id, "0x0000000000000000000000000000000000000009"), DelegationUnavailable, "not one of the person's wallets");
  const wallet = await delegatedWalletFor(me.user.id, me.user.ledgerWallet);
  assert.deepEqual([wallet.walletId, wallet.shareSetId, wallet.address], [ledgerId, `set-${ledgerId}`, me.user.ledgerWallet.toLowerCase()]);
  // Material that does not open under the app's key is a prompt, never a crash.
  const key = process.env.DELEGATION_STORE_KEY;
  process.env.DELEGATION_STORE_KEY = randomBytes(32).toString("hex");
  try {
    await assert.rejects(delegatedWalletFor(me.user.id, me.user.ledgerWallet), DelegationUnavailable);
  } finally {
    process.env.DELEGATION_STORE_KEY = key;
  }
  // Revoked: the material is wiped, the row remembers when, and the signer says prompt.
  const rev = revoked(me, ledgerId, "evt-5", "2026-09-27T11:00:00.000Z");
  assert.deepEqual(await receiveDelegationEvent(rev, signed(rev), deps), { ok: true, kind: "revoked", walletId: ledgerId });
  const [row] = await db.select().from(D).where(and(eq(D.userId, me.user.id), eq(D.walletId, ledgerId)));
  assert.deepEqual([row?.encryptedShare.length, row?.encryptedApiKey.length, row?.revokedAt !== null, row?.eventId], [0, 0, true, "evt-5"]);
  assert.equal(await hasDelegation(me.user.id), false);
  await assert.rejects(delegatedWalletFor(me.user.id, me.user.ledgerWallet), DelegationUnavailable);
  assert.deepEqual(await receiveDelegationEvent(rev, signed(rev), deps), { ok: true, kind: "duplicate", walletId: ledgerId });
  // Granted again later: a new row's worth of material, the revocation gone.
  const again = created(me, ledgerId, me.user.ledgerWallet, "evt-6", "2026-09-27T12:00:00.000Z");
  assert.deepEqual(await receiveDelegationEvent(again, signed(again), deps), { ok: true, kind: "stored", walletId: ledgerId });
  assert.equal(await hasDelegation(me.user.id), true);
  assert.equal((await delegatedWalletFor(me.user.id, me.user.ledgerWallet)).walletId, ledgerId);
  // A revocation older than the grant it would undo is stale.
  const late = revoked(me, ledgerId, "evt-5b", "2026-09-27T11:30:00.000Z");
  assert.deepEqual(await receiveDelegationEvent(late, signed(late), deps), { ok: true, kind: "stale", walletId: ledgerId });
  assert.equal(await hasDelegation(me.user.id), true);
});
