/** What a verified login means. The two bugs this guards both shipped: wallet sprawl, and an unnamed "Friend". */
import assert from "node:assert/strict";
import { test } from "node:test";
import { decideLogin } from "@/lib/auth/login";

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
