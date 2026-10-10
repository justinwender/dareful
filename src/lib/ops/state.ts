/**
 * The few facts the operations code keeps between runs (the ops round): the tick's last run, the last time a system
 * refused for rate or credit, the hourly checks' last answers, and each day's morning email once claimed. One row
 * each, in `ops_state`. Nothing here is the product's, and nothing here ever throws into the path that called it.
 */
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export type OpsState = { at: Date; value: Record<string, unknown> };

export async function readState(key: string): Promise<OpsState | null> {
  const [row] = await db.select().from(schema.opsState).where(eq(schema.opsState.key, key)).limit(1);
  return row ? { at: row.at, value: row.value as Record<string, unknown> } : null;
}

export async function putState(key: string, value: Record<string, unknown> = {}, at = new Date()): Promise<void> {
  await db.insert(schema.opsState).values({ key, at, value }).onConflictDoUpdate({ target: schema.opsState.key, set: { at, value } });
}

/** Takes a key once: true for the one caller that wrote it, false for every other (a morning email two ticks raced for). */
export async function claimState(key: string, value: Record<string, unknown> = {}, at = new Date()): Promise<boolean> {
  const rows = await db.insert(schema.opsState).values({ key, at, value }).onConflictDoNothing({ target: schema.opsState.key }).returning({ key: schema.opsState.key });
  return rows.length > 0;
}

/** The systems that can refuse the app: the RPC for rate or its month, the hosted indexer for its 100 a minute, the model API for credit. */
export type Refuser = "alchemy" | "indexer" | "anthropic";

/** One write a minute per system and process at most: a burst of refusals is one fact, not a write per request. */
const lastNoted = new Map<Refuser, number>();
export const REFUSAL_NOTE_EVERY_MS = 60_000;

/** Whether a refusal seen now is written, given when this process last wrote one for the system. Pure. */
export function refusalDue(last: number | undefined, now: number): boolean {
  return last === undefined || now - last >= REFUSAL_NOTE_EVERY_MS;
}

/**
 * A system said no for rate or for credit: kept as `refused:<system>` with when and why, which holds its runway line at
 * urgent for an hour (`REFUSAL_HOLDS_MS`). Never throws: a refusal that could not be written is a line in the log.
 */
export async function noteRefusal(system: Refuser, why: string, now = new Date()): Promise<void> {
  if (!refusalDue(lastNoted.get(system), now.getTime())) return;
  lastNoted.set(system, now.getTime());
  try {
    await putState(`refused:${system}`, { why: why.slice(0, 120) }, now);
  } catch (err) {
    console.warn("a refusal could not be kept", { system, why: err instanceof Error ? err.message.split("\n")[0] : "unknown" });
  }
}

/** When a system last refused, or null. */
export async function lastRefusal(system: Refuser): Promise<OpsState | null> {
  return readState(`refused:${system}`);
}

/** Rows older than this are let go: the operations tables keep judging's weeks and no more. */
export const KEEP_DAYS = 45;

/** The day's trim, from the morning email's run: health runs, model calls, sends and RPC days past `KEEP_DAYS`. */
export async function trimOps(now: Date): Promise<void> {
  const before = new Date(now.getTime() - KEEP_DAYS * 86_400_000);
  await db.delete(schema.healthRuns).where(sql`${schema.healthRuns.at} < ${before.toISOString()}::timestamptz`);
  await db.delete(schema.channelSends).where(sql`${schema.channelSends.at} < ${before.toISOString()}::timestamptz`);
  await db.delete(schema.rpcCalls).where(sql`${schema.rpcCalls.day} < ${before.toISOString().slice(0, 10)}`);
}
