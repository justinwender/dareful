import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { hashToken, newToken } from "@/lib/ledger/tokens";

test("a token is 32 random bytes as base64url", () => {
  const t = newToken();
  assert.match(t, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(t, "base64url").length, 32);
  assert.notEqual(newToken(), t);
});

test("only the sha256 of a token is what gets stored", () => {
  const t = newToken();
  assert.deepEqual(hashToken(t), createHash("sha256").update(t).digest());
});

test("anything not shaped like a token never reaches a query", () => {
  for (const bad of ["", "not-a-token", "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}!`, "eyJnIjoiYSJ9.c2ln"]) assert.equal(hashToken(bad), null, bad);
});
