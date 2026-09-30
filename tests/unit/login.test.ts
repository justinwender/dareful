/**
 * What a verified login means. The three bugs this guards all shipped: wallet sprawl, an unnamed "Friend", and an
 * email's local part stored as a name (Phase 1) and never asked again (docs/decisions.md 2026-09-19).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { JwtVerifiedCredentialFormatEnum, JwtVerifiedCredentialToJSON } from "@dynamic-labs/sdk-api-core";
import { suggestedNameOf } from "@/lib/auth/jwt";
import { decideLogin, nameSettled } from "@/lib/auth/login";

const L = "0x" + "a".repeat(40);
const G = "0x" + "b".repeat(40);
const ORPHAN = "0x" + "c".repeat(40);
const account = { ledgerWallet: L, governanceWallet: G, displayName: "Alex" };

test("an existing account is never told it needs wallets, however few the client could see", () => {
  assert.deepEqual(decideLogin({ existing: account, vouched: [L, G] }), { kind: "session" });
  assert.equal(decideLogin({ existing: account, vouched: [L] }).kind, "refuse");
  assert.equal(decideLogin({ existing: account, vouched: [] }).kind, "refuse");
});

test("an orphan wallet on the login, in any position, does not lock the account out", () => {
  assert.deepEqual(decideLogin({ existing: account, vouched: [ORPHAN, G.toUpperCase().replace("0X", "0x"), L] }), { kind: "session" });
});

test("a login that no longer vouches for the recorded pair is refused, not rewritten", () => {
  assert.deepEqual(decideLogin({ existing: account, vouched: [L, ORPHAN] }), { kind: "refuse", reason: "wallets do not match this account" });
});

test("a new person is told how many wallets the token has, and gets exactly the missing ones", () => {
  assert.deepEqual(decideLogin({ existing: null, vouched: [] }), { kind: "need-wallets", have: 0 });
  assert.deepEqual(decideLogin({ existing: null, vouched: [L] }), { kind: "need-wallets", have: 1 });
  assert.deepEqual(decideLogin({ existing: null, vouched: [L, L] }), { kind: "need-wallets", have: 1 });
});

test("a new person is asked their name before an account exists, and is never called Friend", () => {
  assert.deepEqual(decideLogin({ existing: null, vouched: [L, G] }), { kind: "need-name" });
  assert.deepEqual(decideLogin({ existing: null, vouched: [L, G], displayName: "   " }), { kind: "need-name" });
  assert.deepEqual(decideLogin({ existing: null, vouched: [L, G], displayName: " Sam " }), { kind: "create", ledgerWallet: L, governanceWallet: G, displayName: "Sam" });
});

test("the first wallet the token lists is the ledger wallet and the second the governance wallet", () => {
  const d = decideLogin({ existing: null, vouched: [G, L, ORPHAN], displayName: "Sam" });
  assert.deepEqual(d, { kind: "create", ledgerWallet: G, governanceWallet: L, displayName: "Sam" });
});

test("someone still carrying the placeholder name is asked once, and renamed when they answer", () => {
  const friend = { ...account, displayName: "Friend" };
  assert.deepEqual(decideLogin({ existing: friend, vouched: [L, G] }), { kind: "need-name" });
  assert.deepEqual(decideLogin({ existing: friend, vouched: [L, G], displayName: "Dana" }), { kind: "rename", displayName: "Dana" });
  assert.deepEqual(decideLogin({ existing: account, vouched: [L, G], displayName: "Dana" }), { kind: "session" });
});

test("a stored name that is an address, a tag, a number or a handle is asked once, and renamed when they answer", () => {
  for (const stored of ["justin.wender", "justin.wender+dynamic_test", "a@b.co", "5550142", "dana_q"]) {
    const legacy = { ...account, displayName: stored };
    assert.deepEqual(decideLogin({ existing: legacy, vouched: [L, G] }), { kind: "need-name" }, stored);
    assert.deepEqual(decideLogin({ existing: legacy, vouched: [L, G], displayName: "Justin" }), { kind: "rename", displayName: "Justin" }, stored);
  }
  for (const given of ["Claude Safari", "J.R.", "Mary-Jane", "D’Arcy", "José", "Dr. K"]) {
    assert.deepEqual(decideLogin({ existing: { ...account, displayName: given }, vouched: [L, G] }), { kind: "session" }, given);
  }
});

test("a typed address or handle is never stored as a name", () => {
  const friend = { ...account, displayName: "Friend" };
  for (const typed of ["justin.wender@example.com", "jane+dynamic_test", "justin.wender", "5550142"]) {
    assert.deepEqual(decideLogin({ existing: null, vouched: [L, G], displayName: typed }), { kind: "need-name", refused: true }, typed);
    assert.deepEqual(decideLogin({ existing: friend, vouched: [L, G], displayName: typed }), { kind: "need-name", refused: true }, typed);
  }
  for (const typed of ["Justin", "Claude Safari", "J.R.", "Mary-Jane", "José", "D’Arcy"]) {
    assert.deepEqual(decideLogin({ existing: null, vouched: [L, G], displayName: typed }), { kind: "create", ledgerWallet: L, governanceWallet: G, displayName: typed }, typed);
    assert.deepEqual(decideLogin({ existing: friend, vouched: [L, G], displayName: typed }), { kind: "rename", displayName: typed }, typed);
  }
});

test("someone whose stored name is not one is not settled", () => {
  assert.equal(nameSettled("Friend"), false);
  assert.equal(nameSettled("justin.wender"), false);
  assert.equal(nameSettled("sam@example.com"), false);
  assert.equal(nameSettled("(212) 555-0142"), false);
  assert.equal(nameSettled("Justin"), true);
  assert.equal(nameSettled("Claude Safari"), true);
});

// The claims are built by Dynamic's own serializer, as tests/unit/phone.test.ts builds them, never by hand.
const email = (address: string) => ({ sub: "u", email: address, verified_credentials: [JwtVerifiedCredentialToJSON({ id: "c", format: JwtVerifiedCredentialFormatEnum.Email, email: address, signInEnabled: true })] });

test("the address a login came with is never offered as a name", () => {
  assert.equal(suggestedNameOf(email("justin.wender+dynamic_test@example.com")), undefined);
  assert.equal(suggestedNameOf({ sub: "u", verified_credentials: [JwtVerifiedCredentialToJSON({ id: "c", format: JwtVerifiedCredentialFormatEnum.PhoneNumber, phoneNumber: "2125550142", phoneCountryCode: "1", isoCountryCode: "US", signInEnabled: true })] }), undefined);
  assert.equal(suggestedNameOf({ ...email("justin.wender@example.com"), given_name: "Justin Wender" }), "Justin");
});
