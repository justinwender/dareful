/**
 * A send is never lost (docs/decisions.md 2026-09-27). Every transaction the relayer signs is in `chain_writes`
 * before it is broadcast, with the kind of mirror the action would write once the receipt is in. A request
 * that saw the receipt wrote its own mirror and marked the row complete; a request the node stopped answering
 * left the row pending, told the person the send was on its way, and this is what finishes it, from the tick,
 * once a minute: read the receipt, and if it is in, write the mirror through the kind's completion; if it is
 * not, broadcast the signed bytes again; and if the nonce went to something else or the write aged out, mark it
 * dropped and tell the owner, since a person was told it was on its way. Reverted after pending is told too.
 *
 * Pure in its decisions and injectable in its edges (the receipt read, the re-broadcast, the completions, the
 * alert), so the rules have tests without a chain.
 */
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Hex } from "viem";
import { db, schema } from "@/db";
import { isAlreadyKnown, isNonceProblem, relayer, type WriteKind } from "./relayer";

/** A pending write is left alone this long: the request that made it is still waiting for its receipt. */
export const PENDING_AFTER_MS = 60_000;
/** A write with no receipt after this long is dropped: the network has forgotten it, and the person is told nothing went through. */
export const DROP_AFTER_MS = 30 * 60_000;
/** How many times the signed bytes are broadcast again before the write is left to age out. */
export const REBROADCAST_MAX = 5;
/** How many writes one tick looks at. */
const PER_TICK = 10;

export type Receipt = { status: "success" | "reverted"; blockNumber: bigint };
/** The mirror for one kind of write, from its subject and the receipt: true when written, false when not yet possible (the indexer behind), in which case it is tried again. */
export type Completion = (subject: Record<string, unknown>, receipt: { hash: Hex; blockNumber: bigint }) => Promise<boolean>;
export type Completions = Partial<Record<WriteKind, Completion>>;

export type Reconciled = { mined: Hex[]; completed: Hex[]; reverted: Hex[]; dropped: Hex[]; rebroadcast: Hex[]; waiting: Hex[] };

export type ReconcileDeps = {
  complete: Completions;
  /** The receipt, or null when the network has none for the hash. */
  receipt?: (hash: Hex) => Promise<Receipt | null>;
  /** Broadcasts the signed bytes again: "sent" (accepted, or already known), "consumed" (the nonce went to something else). */
  rebroadcast?: (raw: Hex) => Promise<"sent" | "consumed">;
  alert?: (subject: string, text: string) => Promise<unknown>;
  /** Tests scope to their own writes; the tick passes nothing. */
  onlyHashes?: Hex[];
};

const hexOf = (b: Buffer): Hex => `0x${b.toString("hex")}`;
const bufOf = (h: Hex): Buffer => Buffer.from(h.slice(2), "hex");

async function readReceipt(hash: Hex): Promise<Receipt | null> {
  try {
    const r = await relayer().publicClient.getTransactionReceipt({ hash });
    return { status: r.status, blockNumber: r.blockNumber };
  } catch {
    return null;
  }
}

async function broadcastAgain(raw: Hex): Promise<"sent" | "consumed"> {
  try {
    await relayer().publicClient.sendRawTransaction({ serializedTransaction: raw });
    return "sent";
  } catch (err) {
    if (isAlreadyKnown(err)) return "sent";
    if (isNonceProblem(err)) return "consumed";
    throw err;
  }
}

async function opsAlert(subject: string, text: string): Promise<unknown> {
  const { sendOps } = await import("@/lib/notify/channels");
  return sendOps(subject, text);
}

export async function reconcileChainWrites(now: Date, deps: ReconcileDeps): Promise<Reconciled> {
  const receipt = deps.receipt ?? readReceipt;
  const rebroadcast = deps.rebroadcast ?? broadcastAgain;
  const alert = deps.alert ?? opsAlert;
  const W = schema.chainWrites;
  const out: Reconciled = { mined: [], completed: [], reverted: [], dropped: [], rebroadcast: [], waiting: [] };
  const due = new Date(now.getTime() - PENDING_AFTER_MS);
  const rows = await db
    .select()
    .from(W)
    .where(
      and(
        or(and(eq(W.status, "pending"), lt(W.createdAt, due)), and(eq(W.status, "mined"), isNull(W.completedAt))),
        deps.onlyHashes ? inArray(W.hash, deps.onlyHashes.map(bufOf)) : sql`true`,
      ),
    )
    .orderBy(W.createdAt)
    .limit(PER_TICK);

  for (const row of rows) {
    const hash = hexOf(row.hash);
    let subject: Record<string, unknown> = {};
    try {
      subject = JSON.parse(row.subject) as Record<string, unknown>;
    } catch {
      subject = {};
    }
    const finish = async (blockNumber: bigint) => {
      const fn = deps.complete[row.kind as WriteKind];
      const done = fn ? await fn(subject, { hash, blockNumber }).catch((err: unknown) => (console.error(`reconcile: ${row.label} could not be completed`, err instanceof Error ? err.message : err), false)) : true;
      if (done) {
        await db.update(W).set({ completedAt: now, updatedAt: now }).where(eq(W.hash, row.hash));
        out.completed.push(hash);
      }
    };

    if (row.status === "mined") {
      await finish(row.blockNumber ?? 0n);
      continue;
    }
    const r = await receipt(hash);
    if (r) {
      await db.update(W).set({ status: r.status === "success" ? "mined" : "reverted", blockNumber: r.blockNumber, updatedAt: now }).where(eq(W.hash, row.hash));
      if (r.status === "success") {
        out.mined.push(hash);
        await finish(r.blockNumber);
      } else {
        out.reverted.push(hash);
        await db.update(W).set({ completedAt: now }).where(eq(W.hash, row.hash));
        await alert("Dareful: a send reverted after the person was told it was on its way", `${row.label}\n${hash}\nblock ${r.blockNumber}\n\nThe action's mirror was never written, so the person's screen does not show it. Nothing here undoes anything; look at the transaction.`).catch(() => undefined);
      }
      continue;
    }
    const age = now.getTime() - row.createdAt.getTime();
    if (age >= DROP_AFTER_MS || row.attempts > REBROADCAST_MAX) {
      await db.update(W).set({ status: "dropped", completedAt: now, updatedAt: now }).where(eq(W.hash, row.hash));
      out.dropped.push(hash);
      await alert("Dareful: a send was dropped", `${row.label}\n${hash}\nnonce ${row.nonce}, ${row.attempts} attempts, ${Math.round(age / 60_000)} minutes\n\nThe network never mined it and the person was told it was on its way. They will need to do it again.`).catch(() => undefined);
      continue;
    }
    let result: "sent" | "consumed";
    try {
      result = await rebroadcast(hexOf(row.raw));
    } catch (err) {
      // The network is not answering; next minute.
      console.warn(`reconcile: ${row.label} could not be broadcast again`, err instanceof Error ? err.message : err);
      out.waiting.push(hash);
      continue;
    }
    if (result === "consumed") {
      await db.update(W).set({ status: "dropped", completedAt: now, updatedAt: now }).where(eq(W.hash, row.hash));
      out.dropped.push(hash);
      await alert("Dareful: a send was dropped", `${row.label}\n${hash}\nnonce ${row.nonce} went to another transaction before this one was mined.\n\nThe person was told it was on its way. They will need to do it again.`).catch(() => undefined);
      continue;
    }
    await db.update(W).set({ attempts: row.attempts + 1, updatedAt: now }).where(eq(W.hash, row.hash));
    out.rebroadcast.push(hash);
  }
  return out;
}
