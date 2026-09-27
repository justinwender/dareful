/**
 * The relayer's send lock, against the real database (docs/decisions.md 2026-09-27): every sender reads the
 * nonce and sends under one transaction-scoped lock, so two of them never overlap between the read and the
 * send. Nothing here touches the chain: the lock is exercised with a pause in place of the send.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { db } from "@/db";
import { withSendLock } from "@/lib/chain/relayer";

after(async () => {
  await db.$client.end();
});

test("two senders never hold the send lock at once: the second starts only after the first has finished", async () => {
  const log: string[] = [];
  const sender = async (name: string) =>
    withSendLock(async () => {
      log.push(`${name}:start`);
      await new Promise((r) => setTimeout(r, 300));
      log.push(`${name}:end`);
      return name;
    });
  const done = await Promise.all([sender("a"), sender("b")]);
  assert.deepEqual(done, ["a", "b"], "both ran and returned");
  assert.equal(log.length, 4);
  const first = log[0]!.split(":")[0];
  assert.deepEqual(log.slice(0, 2), [`${first}:start`, `${first}:end`], "whichever went first finished before the other began");
});
