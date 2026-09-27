/**
 * The relayer's rule for one key shared by many senders (docs/decisions.md 2026-09-27): a nonce collision is
 * the one failure a resend with the next nonce fixes, and it is retried a few times; anything else is thrown
 * at once. The lock that keeps the senders apart is tested against the real database (tests/db/relayer.test.ts).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { isAlreadyKnown, isNonceProblem, pendingCopy, SEND_PENDING_COPY, SendPending, SendTimedOut, sendWithNonceRetry, SETUP_PENDING_COPY, subjectKey, withTimeout } from "@/lib/chain/relayer";

const failing = (message: string) => Object.assign(new Error(message), { name: "TransactionExecutionError" });

test("a nonce collision is retried with the next nonce, a few times, and any other failure is thrown at once", async () => {
  // Which failures are collisions: by viem's name, or by the node's words anywhere down the cause chain.
  assert.equal(isNonceProblem(Object.assign(new Error("Nonce provided for the transaction is lower than the current nonce"), { name: "NonceTooLowError" })), true);
  assert.equal(isNonceProblem(Object.assign(new Error("Request failed"), { cause: { cause: { message: "replacement transaction underpriced" } } })), true);
  assert.equal(isNonceProblem(failing("nonce too low: next nonce 42, tx nonce 41")), true);
  assert.equal(isNonceProblem(failing("already known")), true);
  // Monad's own words for a colliding nonce, seen when twelve suites sent side by side (docs/testing.md session 19).
  assert.equal(isNonceProblem(failing("Missing or invalid parameters.\n\nDetails: An existing transaction had higher priority")), true);
  assert.equal(isNonceProblem(failing("execution reverted: unknown group")), false, "a revert is not a collision");
  assert.equal(isNonceProblem("nonce too low"), false, "a bare string is not an error");
  assert.equal(isNonceProblem(null), false);

  // Two collisions, then success: the third send carries the nonce two past the first.
  const sent: number[] = [];
  const twice = await sendWithNonceRetry(async (nonce) => {
    sent.push(nonce);
    if (sent.length < 3) throw failing("nonce too low");
    return `0x${nonce}`;
  }, 7);
  assert.deepEqual([twice, sent], ["0x9", [7, 8, 9]]);

  // Collisions every time: given up after the attempts, with the last failure.
  const always: number[] = [];
  await assert.rejects(
    sendWithNonceRetry(async (nonce) => {
      always.push(nonce);
      throw failing("nonce too low");
    }, 7),
    /nonce too low/,
  );
  assert.deepEqual(always, [7, 8, 9], "three attempts, no more");

  // A revert on the first send is thrown at once, never resent with another nonce.
  const once: number[] = [];
  await assert.rejects(
    sendWithNonceRetry(async (nonce) => {
      once.push(nonce);
      throw failing("execution reverted");
    }, 7),
    /execution reverted/,
  );
  assert.deepEqual(once, [7]);
});


test("a send that hangs is given up after the timeout, so a stalled node never holds the lock; a send that answers in time is untouched", async () => {
  const never = new Promise<string>(() => undefined);
  const t0 = Date.now();
  await assert.rejects(withTimeout(never, 120), (err: unknown) => err instanceof SendTimedOut && /120ms/.test(err.message));
  assert.ok(Date.now() - t0 < 2_000, "given up at the timeout, not later");
  assert.equal(await withTimeout(Promise.resolve("0xhash"), 120), "0xhash");
  await assert.rejects(withTimeout(Promise.reject(new Error("execution reverted")), 120), /execution reverted/, "a real failure keeps its own words");
});

test("a node that already holds the transaction counts as a broadcast, and a pending send names its hash", () => {
  assert.equal(isAlreadyKnown(failing("already known")), true);
  assert.equal(isAlreadyKnown(Object.assign(new Error("Request failed"), { cause: { message: "AlreadyKnown" } })), true, "down the cause chain, whatever the case");
  assert.equal(isAlreadyKnown(failing("known transaction: 0xabc")), true);
  assert.equal(isAlreadyKnown(failing("nonce too low")), false, "a collision is not the same transaction");
  assert.equal(isAlreadyKnown(failing("execution reverted")), false);
  assert.equal(isAlreadyKnown(null), false);
  const pending = new SendPending("0xabc", "confirm x");
  assert.deepEqual([pending.name, pending.hash, pending.message.includes("0xabc") && pending.message.includes("confirm x")], ["SendPending", "0xabc", true]);
});

test("a pending send is said to be on its way, except a pending registration, which is setup: nothing of the person's was sent, and they try again", () => {
  assert.equal(pendingCopy(new SendPending("0xabc", "confirm x", "confirm")), SEND_PENDING_COPY);
  assert.equal(pendingCopy(new SendPending("0xabc", "confirm x")), SEND_PENDING_COPY, "a write of no named kind is the person's");
  assert.equal(pendingCopy(new SendPending("0xdef", "createGroup g", "register")), SETUP_PENDING_COPY);
  assert.notEqual(SETUP_PENDING_COPY, SEND_PENDING_COPY);
  assert.ok(!/will show/.test(SETUP_PENDING_COPY) && /again/.test(SETUP_PENDING_COPY), "the setup line never promises the person's own action will show");
  // The subject is stored the one way, so a later send for the same thing is found by equality.
  assert.equal(subjectKey({ dareId: "d", n: 5n }), JSON.stringify({ dareId: "d", n: "5" }));
});
