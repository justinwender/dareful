/**
 * A send is never lost (docs/decisions.md 2026-09-27): the tick's reconciliation of writes whose receipt
 * outlived their request, against the real `chain_writes` table with every edge injected (the receipt read,
 * the re-broadcast, the completions, the alert), so the rules are exercised without a chain. The rows are the
 * test's own, scoped by hash, and removed after.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, test } from "node:test";
import { inArray } from "drizzle-orm";
import type { Hex } from "viem";
import { db, schema } from "@/db";
import { DROP_AFTER_MS, PENDING_AFTER_MS, reconcileChainWrites, type Completions } from "@/lib/chain/reconcile";

const made: Buffer[] = [];
after(async () => {
  if (made.length) await db.delete(schema.chainWrites).where(inArray(schema.chainWrites.hash, made));
  await db.$client.end();
});

const hex = (b: Buffer): Hex => `0x${b.toString("hex")}`;
async function write(input: { kind: string; subject: Record<string, unknown>; ageMs: number; status?: "pending" | "mined"; attempts?: number }): Promise<Hex> {
  const hash = randomBytes(32);
  made.push(hash);
  await db.insert(schema.chainWrites).values({ hash, raw: randomBytes(64), label: `test ${input.kind}`, kind: input.kind, subject: JSON.stringify(input.subject), nonce: 7, status: input.status ?? "pending", attempts: input.attempts ?? 1, createdAt: new Date(Date.now() - input.ageMs), updatedAt: new Date(Date.now() - input.ageMs) });
  return hex(hash);
}
const rowOf = async (h: Hex) => (await db.select().from(schema.chainWrites).where(inArray(schema.chainWrites.hash, [Buffer.from(h.slice(2), "hex")])))[0]!;

test("a pending write with a receipt is finished by its kind's completion; without one it is broadcast again, then dropped and the owner told; a revert is told too; the young are left alone", async () => {
  const now = new Date();
  const H = 3_600_000;
  const minedOk = await write({ kind: "close", subject: { obligationId: "o-1" }, ageMs: 2 * PENDING_AFTER_MS });
  const minedLater = await write({ kind: "confirm", subject: { proposalIds: ["p-1"] }, ageMs: 2 * PENDING_AFTER_MS });
  const young = await write({ kind: "close", subject: { obligationId: "o-young" }, ageMs: PENDING_AFTER_MS / 2 });
  const lost = await write({ kind: "close", subject: { obligationId: "o-lost" }, ageMs: 2 * PENDING_AFTER_MS });
  const consumed = await write({ kind: "close", subject: { obligationId: "o-consumed" }, ageMs: 2 * PENDING_AFTER_MS });
  const aged = await write({ kind: "close", subject: { obligationId: "o-aged" }, ageMs: DROP_AFTER_MS + H });
  const reverted = await write({ kind: "close", subject: { obligationId: "o-reverted" }, ageMs: 2 * PENDING_AFTER_MS });
  const all = [minedOk, minedLater, young, lost, consumed, aged, reverted];

  const completed: string[] = [];
  const rebroadcast: Hex[] = [];
  const alerts: string[] = [];
  let laterDone = false;
  const complete: Completions = {
    close: async (subject, receipt) => (completed.push(`close ${String(subject.obligationId)} @${receipt.blockNumber}`), true),
    confirm: async (subject) => (completed.push(`confirm ${String((subject.proposalIds as string[])[0])}`), laterDone),
  };
  const receipts = new Map<Hex, { status: "success" | "reverted"; blockNumber: bigint }>([
    [minedOk, { status: "success", blockNumber: 100n }],
    [minedLater, { status: "success", blockNumber: 101n }],
    [reverted, { status: "reverted", blockNumber: 102n }],
    [young, { status: "success", blockNumber: 103n }],
  ]);
  const deps = {
    complete,
    receipt: async (h: Hex) => receipts.get(h) ?? null,
    rebroadcast: async (raw: Hex) => (rebroadcast.push(raw), raw === hex((await rowOf(consumed)).raw) ? ("consumed" as const) : ("sent" as const)),
    alert: async (subject: string, text: string) => void alerts.push(`${subject} :: ${text}`),
    onlyHashes: all,
  };

  const r1 = await reconcileChainWrites(now, deps);
  assert.deepEqual([r1.mined.sort(), r1.completed, r1.reverted, r1.dropped.sort(), r1.rebroadcast, r1.waiting], [[minedOk, minedLater].sort(), [minedOk], [reverted], [consumed, aged].sort(), [lost], []]);
  assert.deepEqual(completed, ["close o-1 @100", "confirm p-1"], "the completion runs for a mined write, with the receipt's block, and never for a revert");
  assert.equal(rebroadcast.length, 2, "the two with no receipt and time left were broadcast again; the aged one was not");
  assert.deepEqual([(await rowOf(minedOk)).status, (await rowOf(minedOk)).completedAt !== null, (await rowOf(minedOk)).blockNumber], ["mined", true, 100n]);
  assert.deepEqual([(await rowOf(minedLater)).status, (await rowOf(minedLater)).completedAt], ["mined", null], "a completion that could not finish yet leaves the write for next time");
  assert.deepEqual([(await rowOf(young)).status, (await rowOf(young)).attempts], ["pending", 1], "a write younger than the wait is not even looked at: its request is still waiting");
  assert.deepEqual([(await rowOf(lost)).status, (await rowOf(lost)).attempts], ["pending", 2], "broadcast again and still pending");
  assert.deepEqual([(await rowOf(consumed)).status, (await rowOf(aged)).status, (await rowOf(reverted)).status], ["dropped", "dropped", "reverted"]);
  assert.equal(alerts.length, 3, "the owner hears of the two drops and the revert, once each");
  assert.ok(alerts.some((a) => a.includes("dropped") && a.includes(consumed)) && alerts.some((a) => a.includes("dropped") && a.includes(aged)) && alerts.some((a) => a.includes("reverted") && a.includes(reverted)));

  // Next minute: the mined write whose completion was not yet possible is finished once it is; the write that was
  // too young to look at is due now, and its receipt finishes it too; the lost one is broadcast once more.
  laterDone = true;
  const r2 = await reconcileChainWrites(new Date(now.getTime() + 60_000), deps);
  // Least recently tried first (the field round): the write tried and left last minute comes after the one not yet tried.
  assert.deepEqual([r2.completed, r2.mined, r2.dropped, r2.rebroadcast], [[young, minedLater], [young], [], [lost]]);
  assert.ok((await rowOf(minedLater)).completedAt !== null);
  assert.equal(completed.filter((c) => c === "confirm p-1").length, 2, "asked again, and done");
  assert.deepEqual([(await rowOf(young)).status, (await rowOf(young)).completedAt !== null, (await rowOf(lost)).attempts], ["mined", true, 3]);
});

test("a mined write whose mirror cannot be finished goes to the back of the line each time it is tried, so it never holds a place", async () => {
  const stuck = await write({ kind: "confirm", subject: { proposalIds: ["p-stuck"] }, ageMs: 2 * PENDING_AFTER_MS, status: "mined" });
  const before = (await rowOf(stuck)).updatedAt.getTime();
  const now = new Date(Date.now() + 60_000);
  const complete: Completions = { confirm: async () => false };
  const out = await reconcileChainWrites(now, { complete, receipt: async () => null, rebroadcast: async () => "sent", alert: async () => undefined, onlyHashes: [stuck] });
  assert.deepEqual(out.completed, []);
  const row = await rowOf(stuck);
  assert.equal(row.completedAt, null, "still to finish");
  assert.ok(row.updatedAt.getTime() === now.getTime() && row.updatedAt.getTime() > before, "tried now, so it sorts after everything not yet tried");
});
