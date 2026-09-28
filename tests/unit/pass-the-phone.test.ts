/**
 * Pass the phone, the pure parts (docs/design.md 3.45; 3.41 amended 2026-09-28): what a PIN is, how wrong
 * tries lock it and for how long, what the lockout and entered-from notices say and never say, and which
 * actions the server may be asked to sign from its own inputs, which never includes a vote.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { afterWrongTry, isLocked, LOCK_AFTER, LOCK_FOR_MS, validPin } from "@/lib/ledger/pass-the-phone";
import { Via } from "@/lib/ledger/via";
import { enteredFromNotice, pinLockedNotice } from "@/lib/notify/messages";

test("a PIN is exactly four digits", () => {
  assert.equal(validPin("0420"), true);
  assert.equal(validPin("42"), false);
  assert.equal(validPin("12345"), false);
  assert.equal(validPin("12a4"), false);
  assert.equal(validPin(" 1234"), false);
});

test("the fifth wrong try in a row locks the PIN for an hour and counts a lockout; the tries start again after; a lock ends when its hour does", () => {
  const t = new Date("2026-09-28T20:00:00Z");
  let s = { failedTries: 0, lockedUntil: null as Date | null, lockouts: 0 };
  for (let i = 1; i < LOCK_AFTER; i++) {
    const next = afterWrongTry(s, t);
    assert.deepEqual([next.failedTries, next.lockedUntil, next.lockedNow], [i, null, false], `try ${i} counts and does not lock`);
    s = next;
  }
  const locked = afterWrongTry(s, t);
  assert.deepEqual([locked.failedTries, locked.lockedUntil?.getTime(), locked.lockouts, locked.lockedNow], [0, t.getTime() + LOCK_FOR_MS, 1, true]);
  assert.equal(LOCK_AFTER, 5);
  assert.equal(LOCK_FOR_MS, 3_600_000);
  assert.equal(isLocked(locked, new Date(t.getTime() + LOCK_FOR_MS - 1)), true);
  assert.equal(isLocked(locked, new Date(t.getTime() + LOCK_FOR_MS)), false);
  assert.equal(isLocked({ lockedUntil: null }, t), false);
});

test("the lockout notice names whose phone and never the PIN; the entered-from notice carries the question and whose phone, and neither carries a number or an amount", () => {
  const locked = pinLockedNotice({ hostName: "Sam", appUrl: "https://dareful.app" });
  assert.equal(locked.title, "Your PIN is locked for an hour");
  assert.ok(locked.body.startsWith("Five wrong tries on Sam’s phone.") && locked.url === "https://dareful.app/you");
  const entered = enteredFromNotice({ hostName: "Sam", title: "Does Theo clear the fence?", marketId: "m1", appUrl: "https://dareful.app" });
  assert.deepEqual([entered.title, entered.body, entered.url], ["Does Theo clear the fence?", "You entered this from Sam’s phone.", "https://dareful.app/m/m1"]);
  for (const n of [locked, entered]) assert.equal(/\$|%|beer|owe|debt|\d{4}/.test(`${n.title} ${n.body}`), false, n.body);
});

test("what the server may be asked to sign is a named routine action with its ids, never typed data and never a vote", () => {
  const id = "3f2b5c1e-9d7a-4b8c-8e2f-1a2b3c4d5e6f";
  assert.equal(Via.safeParse({ action: "enter", dareId: id, stake: "500", value: "7000" }).success, true);
  assert.equal(Via.safeParse({ action: "close", obligationId: id, reason: "forgiven" }).success, true);
  assert.equal(Via.safeParse({ action: "vote", dareId: id, outcome: "1" }).success, false, "a vote is a governance signature and is not a thing the server signs");
  assert.equal(Via.safeParse({ action: "enter", dareId: id, stake: "500", value: "7000", typedData: { message: {} } }).success, true, "extra fields are dropped, never signed");
  const parsed = Via.parse({ action: "enter", dareId: id, stake: "500", value: "7000", typedData: { message: {} } });
  assert.ok(!("typedData" in parsed), "nothing a client sends as typed data survives parsing");
  assert.equal(Via.safeParse({ action: "enter", dareId: id, stake: "5.5", value: "7000" }).success, false, "whole numbers only");
});
