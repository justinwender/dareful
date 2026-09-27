/**
 * The client names its own governance wallet to Dynamic by the credential id in the login token, the same token
 * the server counts wallets from (src/lib/auth/login.ts). The credential is the recorded one, spelled by Dynamic's
 * serializer, never by hand.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { walletIdFromToken } from "@/lib/auth/token-wallets";

const credential = JSON.parse(readFileSync("tests/fixtures/dynamic-wallet-credential.json", "utf8")) as { id: string; address: string; format: string };
const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const tokenWith = (creds: unknown[]) => `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({ sub: "x", verified_credentials: creds }))}.sig`;

test("the governance wallet's credential id is read from the login token by address, whatever the case, and only from a wallet credential", () => {
  const token = tokenWith([credential, { ...credential, id: "phone-cred", format: "phoneNumber" }, { id: "other", address: "0x000000000000000000000000000000000000dEaD", format: "blockchain" }]);
  assert.equal(walletIdFromToken(token, credential.address), credential.id);
  assert.equal(walletIdFromToken(token, credential.address.toUpperCase().replace("0X", "0x")), credential.id, "the users row keeps the address lowercase; the token keeps it checksummed");
  assert.equal(walletIdFromToken(token, "0x000000000000000000000000000000000000dEaD"), "other");
  assert.equal(walletIdFromToken(tokenWith([{ ...credential, format: "email" }]), credential.address), null, "a credential that is not a wallet names no wallet");
  assert.equal(walletIdFromToken(null, credential.address), null);
  assert.equal(walletIdFromToken("not.a.token", credential.address), null);
  assert.equal(walletIdFromToken(tokenWith([]), credential.address), null);
});
