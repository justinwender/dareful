/**
 * Delegation's pure rules (docs/decisions.md 2026-09-27): which address may be signed for, the webhook's
 * signature over the bytes received, the app's own envelope around what it stores, the shape of Dynamic's
 * events, and how the private key is read from the environment.
 *
 * The event shapes are Dynamic's published examples (its receiving-delegation page), the nearest thing to a
 * recording until the sandbox delivers a real one; they are to be replaced by a recorded event then.
 */
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { delegationPrivateKeyPem, delegationRefusal, open, parseDelegationEvent, seal, verifyWebhookSignature } from "@/lib/chain/delegated-signer";

const LEDGER = "0xf06736F9B584e3000BA11f60f995BC8658714504";
const GOVERNANCE = "0x274d945b499bBB2cdaE5A1C05DEbA57a7B7c44b1";

test("only the ledger wallet may be signed for: the governance wallet is refused by address, whatever its case, and a third address is unknown", () => {
  const me = { ledgerWallet: LEDGER.toLowerCase(), governanceWallet: GOVERNANCE.toLowerCase() };
  assert.equal(delegationRefusal({ address: LEDGER, ...me }), null, "the ledger wallet, checksummed");
  assert.equal(delegationRefusal({ address: LEDGER.toLowerCase(), ...me }), null);
  assert.equal(delegationRefusal({ address: GOVERNANCE, ...me }), "governance", "the governance wallet, checksummed");
  assert.equal(delegationRefusal({ address: ` ${GOVERNANCE.toUpperCase().replace("0X", "0x")} `, ...me }), "governance", "spacing and case never let it through");
  assert.equal(delegationRefusal({ address: "0x0000000000000000000000000000000000000001", ...me }), "unknown");
});

test("the webhook's signature is an HMAC over the bytes received, compared whole and in constant time", () => {
  const secret = "whsec_test";
  const body = '{"eventName":"wallet.delegation.revoked","eventId":"e1","timestamp":"2026-09-27T00:00:00.000Z","userId":"u","data":{"walletId":"w","chain":"EVM"}}';
  const good = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  assert.equal(verifyWebhookSignature(secret, body, good), true);
  assert.equal(verifyWebhookSignature(secret, body, good.toUpperCase().replace("SHA256=", "sha256=")), true, "hex case is not the signature");
  assert.equal(verifyWebhookSignature(secret, `${body} `, good), false, "one byte more and it is another body");
  assert.equal(verifyWebhookSignature(secret, body, `sha256=${"0".repeat(64)}`), false);
  assert.equal(verifyWebhookSignature(secret, body, good.slice(0, -2)), false, "a short header never matches a prefix");
  assert.equal(verifyWebhookSignature(secret, body, null), false);
  assert.equal(verifyWebhookSignature("", body, good), false, "no secret, nothing verifies");
  assert.equal(verifyWebhookSignature("other", body, good), false);
});

test("what is stored is sealed under the app's key and bound to its row: the wrong key, a tampered byte or another row's binding opens nothing", () => {
  const key = randomBytes(32);
  const plain = Buffer.from('{"pubkey":{"pubkey":"…"},"secretShare":"not a real share"}', "utf8");
  const sealed = seal(plain, key, "delegation:user:wallet");
  assert.ok(sealed.length >= plain.length + 28, "iv and tag ride along");
  assert.deepEqual(open(sealed, key, "delegation:user:wallet"), plain);
  assert.notDeepEqual(seal(plain, key, "delegation:user:wallet"), sealed, "a fresh iv every time");
  assert.equal(open(sealed, randomBytes(32), "delegation:user:wallet"), null, "another key");
  assert.equal(open(sealed, key, "delegation:user:other-wallet"), null, "another row's binding");
  const tampered = Buffer.from(sealed);
  tampered[tampered.length - 1] ^= 1;
  assert.equal(open(tampered, key, "delegation:user:wallet"), null, "a flipped byte");
  assert.equal(open(Buffer.alloc(0), key, "delegation:user:wallet"), null, "wiped material opens nothing");
  assert.throws(() => seal(plain, randomBytes(16), "x"), /32 bytes/);
});

test("Dynamic's events parse by name: created carries two envelopes, revoked a wallet id, and anything else, the ping above all, is read for its name alone", () => {
  const envelope = { alg: "HYBRID-RSA-AES-256", iv: "dzePdAUMQd6lWQngEXWPdQ", ct: "pJIT5UU", tag: "Yq8bpMU8huIx7UzUUUgI9Q", ek: "uix2E6E" };
  const created = parseDelegationEvent({
    messageId: "f44da9f0-a5b5-47f6-965f-f04af51c903e",
    eventId: "2cf779a8-89da-486f-974e-2b77b738e4ac",
    eventName: "wallet.delegation.created",
    timestamp: "2025-10-01T15:13:26.348Z",
    webhookId: "9a31fefc-64e4-4551-81da-1502eacc852d",
    userId: "7eb7843b-2a4d-4f69-b95e-d219f0662fda",
    environmentId: "53728749-1f19-4cab-becf-b88f952c3a3c",
    environmentName: "sandbox",
    data: { chain: "EVM", encryptedDelegatedShare: envelope, encryptedWalletApiKey: { ...envelope, kid: "dynamic_rsa_lSuvWlCy" }, publicKey: "0xd74ff800a3c6f66ecd217118aaa6fb1c916fa4e2", userId: "7eb7843b-2a4d-4f69-b95e-d219f0662fda", walletId: "25193936-3ecd-4c1b-84e6-9eabc82e53c2" },
  });
  assert.ok(created && created.kind === "created");
  assert.equal(created.event.data.encryptedWalletApiKey.kid, "dynamic_rsa_lSuvWlCy");
  assert.equal(created.event.data.walletId, "25193936-3ecd-4c1b-84e6-9eabc82e53c2");
  const revoked = parseDelegationEvent({ eventName: "wallet.delegation.revoked", eventId: "3f0a1b1c-0000-4000-8000-aaaaaaaaaaaa", timestamp: "2025-10-01T16:00:00.000Z", userId: "7eb7843b-2a4d-4f69-b95e-d219f0662fda", data: { walletId: "25193936-3ecd-4c1b-84e6-9eabc82e53c2", chain: "EVM" } });
  assert.ok(revoked && revoked.kind === "revoked");
  assert.equal(revoked.event.data.walletId, "25193936-3ecd-4c1b-84e6-9eabc82e53c2");
  // The real delivery, recorded from the sandbox (its ciphertexts blanked): the user id is null at the top and inside `data`.
  const real = parseDelegationEvent(JSON.parse(readFileSync(new URL("../fixtures/dynamic/delegation-created.json", import.meta.url), "utf8")));
  assert.ok(real && real.kind === "created", "the recorded delivery is a created event");
  assert.deepEqual([real.event.userId, typeof real.event.data.userId, real.event.data.encryptedDelegatedShare.alg, typeof real.event.data.shareSetId], [null, "string", "HYBRID-RSA-AES-256", "string"], "read as Dynamic actually sends it");
  assert.deepEqual(parseDelegationEvent({ eventName: "ping" }), { kind: "other", name: "ping" });
  assert.equal(parseDelegationEvent({ eventName: "wallet.delegation.created", eventId: "x", timestamp: "t", userId: "u", data: { walletId: "w", publicKey: "0x1" } }), null, "a created event without its envelopes is not one");
  assert.equal(parseDelegationEvent({ eventName: "wallet.delegation.revoked", eventId: "x" }), null, "a revocation without a wallet is not one");
  assert.equal(parseDelegationEvent({ hello: 1 }), null);
});

test("the private key is read as the PEM or as its base64, and anything else is nothing", () => {
  const pem = "-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----\n";
  const was = process.env.DYNAMIC_DELEGATION_PRIVATE_KEY;
  try {
    process.env.DYNAMIC_DELEGATION_PRIVATE_KEY = pem;
    assert.equal(delegationPrivateKeyPem(), pem.trim());
    process.env.DYNAMIC_DELEGATION_PRIVATE_KEY = Buffer.from(pem, "utf8").toString("base64");
    assert.equal(delegationPrivateKeyPem(), pem.trim());
    process.env.DYNAMIC_DELEGATION_PRIVATE_KEY = `"${Buffer.from(pem, "utf8").toString("base64").replace(/(.{40})/g, "$1\n")}"`;
    assert.equal(delegationPrivateKeyPem(), pem.trim(), "quoted and line-wrapped base64, as a console field leaves it");
    process.env.DYNAMIC_DELEGATION_PRIVATE_KEY = pem.trim().replace(/\n/g, "\\n");
    assert.equal(delegationPrivateKeyPem(), pem.trim(), "the PEM with backslash-n where a single-line field put it");
    process.env.DYNAMIC_DELEGATION_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nMIIB";
    assert.equal(delegationPrivateKeyPem(), null, "a PEM cut short is nothing");
    process.env.DYNAMIC_DELEGATION_PRIVATE_KEY = "not a key";
    assert.equal(delegationPrivateKeyPem(), null);
    delete process.env.DYNAMIC_DELEGATION_PRIVATE_KEY;
    assert.equal(delegationPrivateKeyPem(), null);
  } finally {
    if (was === undefined) delete process.env.DYNAMIC_DELEGATION_PRIVATE_KEY;
    else process.env.DYNAMIC_DELEGATION_PRIVATE_KEY = was;
  }
});
