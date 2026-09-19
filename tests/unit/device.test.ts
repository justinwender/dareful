/**
 * What a device can do for the person the session names, and which wallets a login vouches for. The first
 * guards the 2B blocker: a session with no Dynamic login in that browser was called "still setting up", forever.
 * The second reads a credential recorded from Dynamic, not one written by hand (docs/decisions.md 2026-09-19).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { JwtVerifiedCredentialFromJSON, JwtVerifiedCredentialToJSON } from "@dynamic-labs/sdk-api-core";
import { deviceState, type Me } from "@/lib/auth/device";
import { evmAddressesOf } from "@/lib/auth/jwt";

const L = "0x" + "a".repeat(40);
const G = "0x" + "b".repeat(40);
const me: Me = { dynamicUserId: "dyn-1", ledgerWallet: L, governanceWallet: G };
const base = { me, sdkHasLoaded: true, sdkUserId: "dyn-1", addresses: [L, G], graceOver: false };

test("a session with no Dynamic login on this device is signed out, not setting up", () => {
  assert.equal(deviceState({ ...base, sdkUserId: null, addresses: [] }), "signed-out");
  assert.equal(deviceState({ ...base, sdkUserId: null, addresses: [], graceOver: true }), "signed-out");
});

test("nothing is said before the SDK has loaded", () => {
  assert.equal(deviceState({ ...base, sdkHasLoaded: false, sdkUserId: null, addresses: [] }), "checking");
});

test("a Dynamic login for somebody else is not this person's keys", () => {
  assert.equal(deviceState({ ...base, sdkUserId: "dyn-2" }), "other-account");
});

test("both recorded keys in reach is ready, whatever their case and whatever else is there", () => {
  assert.equal(deviceState({ ...base, addresses: ["0x" + "c".repeat(40), G.toUpperCase().replace("0X", "0x"), L] }), "ready");
});

test("one key is not enough: a vote needs the other one", () => {
  assert.equal(deviceState({ ...base, addresses: [L], graceOver: true }), "keys-missing");
});

test("missing keys are waited for briefly and then called missing, never waited for forever", () => {
  assert.equal(deviceState({ ...base, addresses: [] }), "checking");
  assert.equal(deviceState({ ...base, addresses: [], graceOver: true }), "keys-missing");
});

const recorded = JSON.parse(readFileSync(new URL("../fixtures/dynamic-wallet-credential.json", import.meta.url), "utf8")) as Record<string, unknown>;
delete recorded._recorded;

test("a recorded embedded-wallet credential is counted as a wallet the login vouches for", () => {
  assert.deepEqual(evmAddressesOf({ sub: "u", verified_credentials: [recorded] } as never), ["0xabcdef0123456789abcdef0123456789abcdef01"]);
});

test("the recorded credential has the keys Dynamic's serializer writes, so the two cannot drift apart unseen", () => {
  const written = JwtVerifiedCredentialToJSON(JwtVerifiedCredentialFromJSON(recorded)) as Record<string, unknown>;
  const keys = (o: Record<string, unknown>) => Object.keys(o).filter((k) => o[k] !== undefined).sort();
  assert.deepEqual(keys(written), keys(recorded));
});

test("the same credential on another chain is not one of the two", () => {
  assert.deepEqual(evmAddressesOf({ sub: "u", verified_credentials: [{ ...recorded, chain: "solana" }] } as never), []);
});
