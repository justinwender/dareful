/**
 * A chain write that keeps failing, kept until it succeeds (the touch-ups round, section 0). The relayer ran dry on
 * October 8 and every close that wrote to the chain failed for more than sixteen hours with nobody told: the floor
 * email watched the balance, not the writes. Every failed send is filed here under the thing it was writing (its
 * kind and subject), and a success for that thing clears it, so the tick can tell the owner once something has been
 * failing for more than fifteen minutes, whatever the cause.
 */
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/** How long a write may go on failing before the owner hears of it. */
export const TELL_AFTER_MS = 15 * 60_000;
/** A write still failing a day after the owner was told is told again. */
export const TELL_AGAIN_MS = 24 * 3_600_000;

/**
 * The first line of a failure, with every address taken out: an RPC's address carries its key, and viem puts it in
 * the message. Pure.
 */
export function failureWhy(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "unknown";
  const detail = err instanceof Error ? (err as unknown as { details?: unknown }).details : undefined;
  const details = typeof detail === "string" && detail.length > 0 ? ` (${detail})` : "";
  const first = (raw.split("\n").find((l) => l.trim().length > 0) ?? "unknown").trim();
  return `${first}${details}`.replace(/https?:\/\/\S+/g, "[rpc]").slice(0, 300);
}

/**
 * Whether the contract refused the write as sent (a revert, at the simulate or in the receipt), as opposed to the
 * network, a node, or the relayer's gas. A refusal can come from a node a block behind, so a caller retries before
 * believing it. Pure.
 */
export function contractRefused(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && typeof e === "object" && depth < 8; e = (e as { cause?: unknown }).cause, depth += 1) {
    const name = typeof (e as { name?: unknown }).name === "string" ? (e as { name: string }).name : "";
    const message = typeof (e as { message?: unknown }).message === "string" ? (e as { message: string }).message : "";
    if (name === "ContractFunctionRevertedError" || name === "RelayerTransactionFailed") return true;
    if (/reverted/i.test(message) && !/insufficient|balance|nonce|timeout|fetch/i.test(message)) return true;
  }
  return false;
}

/** Files a failure under its write, or counts one more for a write already failing. Never throws: a log that fails must not hide the failure it logs. */
export async function noteChainFailure(w: { key: string; kind: string; label: string }, err: unknown, now: Date = new Date()): Promise<void> {
  const why = failureWhy(err);
  await db
    .insert(schema.chainFailures)
    .values({ key: w.key, kind: w.kind, label: w.label.slice(0, 200), firstFailedAt: now, lastFailedAt: now, lastWhy: why })
    .onConflictDoUpdate({ target: schema.chainFailures.key, set: { lastFailedAt: now, lastWhy: why, label: w.label.slice(0, 200), failures: sql`${schema.chainFailures.failures} + 1` } })
    .catch((e: unknown) => console.error("a chain failure could not be filed", failureWhy(e)));
}

/** A send for this write succeeded: whatever was failing has stopped. */
export async function clearChainFailure(key: string): Promise<void> {
  await db
    .delete(schema.chainFailures)
    .where(eq(schema.chainFailures.key, key))
    .catch((e: unknown) => console.error("a chain failure could not be cleared", failureWhy(e)));
}

export type FailureRow = typeof schema.chainFailures.$inferSelect;

/**
 * Whether the owner should hear of this failure now: failing for more than fifteen minutes, failed again within the
 * last fifteen (a write nobody is trying any more is not failing, it is abandoned, and the drop email covers those),
 * and not told within the last day. Pure.
 */
export function dueToTell(f: Pick<FailureRow, "firstFailedAt" | "lastFailedAt" | "alertedAt">, now: Date): boolean {
  const t = now.getTime();
  if (t - f.firstFailedAt.getTime() < TELL_AFTER_MS) return false;
  if (t - f.lastFailedAt.getTime() > TELL_AFTER_MS) return false;
  return f.alertedAt === null || t - f.alertedAt.getTime() >= TELL_AGAIN_MS;
}

/** The failures `dueToTell` admits, read in SQL by the same three rules. */
export async function failuresToTell(now: Date): Promise<FailureRow[]> {
  const since = new Date(now.getTime() - TELL_AFTER_MS);
  const again = new Date(now.getTime() - TELL_AGAIN_MS);
  const F = schema.chainFailures;
  return db
    .select()
    .from(F)
    .where(and(lte(F.firstFailedAt, since), sql`${F.lastFailedAt} >= ${since.toISOString()}::timestamptz`, or(isNull(F.alertedAt), lte(F.alertedAt, again))))
    .orderBy(F.firstFailedAt)
    .limit(20);
}

/** Tells the owner, once a day at most per write, everything that has been failing for more than fifteen minutes. */
export async function tellFailures(now: Date, send: (subject: string, text: string) => Promise<boolean>): Promise<number> {
  const due = (await failuresToTell(now)).filter((f) => dueToTell(f, now));
  if (due.length === 0) return 0;
  const minutes = (f: FailureRow) => Math.round((now.getTime() - f.firstFailedAt.getTime()) / 60_000);
  const lines = due.map((f) => `${f.label}\nfailing for ${minutes(f)} minutes, ${f.failures} attempts\nlast: ${f.lastWhy}`);
  const told = await send(
    due.length === 1 ? `A chain write has been failing for ${minutes(due[0] as FailureRow)} minutes` : `${due.length} chain writes have been failing for over 15 minutes`,
    `${lines.join("\n\n")}\n\nThe tick keeps trying. A close is already closed for the people in it; its write lands when this clears. If the last line says insufficient balance, refill the relayer from the Monad testnet faucet.`,
  );
  if (told)
    await db
      .update(schema.chainFailures)
      .set({ alertedAt: now })
      .where(sql`${schema.chainFailures.key} in (${sql.join(due.map((f) => sql`${f.key}`), sql`, `)})`);
  return told ? due.length : 0;
}

/** A write nobody has tried for a week is abandoned, not failing: its row goes, so the table holds what is failing now. */
export async function forgetOldFailures(now: Date): Promise<void> {
  await db.delete(schema.chainFailures).where(lte(schema.chainFailures.lastFailedAt, new Date(now.getTime() - 7 * 24 * 3_600_000)));
}
