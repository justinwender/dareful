/**
 * The RPC provider's compute units, counted as the app spends them (the ops round, section 1). Alchemy's free plan gives
 * thirty million a month and answers no API about what is left, so every call the app makes through the relayer's
 * transport is weighed at its method's published cost and added to the day's row in `rpc_calls`, a write per request
 * at most, after the request has answered. A refusal for rate (HTTP 429) or for the month (its 403) is kept as a
 * refusal, which holds the Alchemy line at urgent. Only calls to Alchemy count: the audit's public RPC is nobody's quota.
 */
import { after } from "next/server";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { noteRefusal } from "./state";

/** Each method's compute units, from Alchemy's EVM cost table (read on 2026-10-09). */
export const CU_COST: Readonly<Record<string, number>> = {
  eth_blockNumber: 10,
  eth_getBalance: 20,
  eth_call: 26,
  eth_getCode: 20,
  eth_getTransactionCount: 20,
  eth_sendRawTransaction: 40,
  eth_getTransactionReceipt: 20,
  eth_getTransactionByHash: 20,
  eth_getBlockByNumber: 20,
  eth_getBlockByHash: 20,
  eth_chainId: 0,
  net_version: 0,
  eth_gasPrice: 20,
  eth_maxPriorityFeePerGas: 10,
  eth_feeHistory: 10,
  eth_estimateGas: 20,
  eth_getLogs: 60,
};
/** A method the table does not list counts as an `eth_call`, so a new one is never free. */
export const UNLISTED_CU = 26;

export function cuFor(method: string): number {
  return CU_COST[method] ?? UNLISTED_CU;
}

/** The methods a JSON-RPC body asks for, one call or a batch. Pure. */
export function methodsOf(body: string | null | undefined): string[] {
  if (!body) return [];
  try {
    const parsed = JSON.parse(body) as unknown;
    return (Array.isArray(parsed) ? parsed : [parsed]).flatMap((c) => (c && typeof c === "object" && typeof (c as { method?: unknown }).method === "string" ? [(c as { method: string }).method] : []));
  } catch {
    return [];
  }
}

/** Whether an answer is Alchemy saying no: its throughput limit (HTTP 429), or the month's units spent (its 403). Pure. */
export function refusalOf(status: number, text: string): "rate" | "month" | null {
  if (/monthly capacity limit/i.test(text)) return "month";
  if (status === 429 || /compute units per second capacity/i.test(text)) return "rate";
  return null;
}

/** Whether an address is the provider whose units are counted. Pure. */
export function isAlchemy(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".alchemy.com");
  } catch {
    return false;
  }
}

export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

const pending = new Map<string, { calls: number; cu: number }>();
let scheduled = false;

/** Calls weighed and kept in memory until the request that made them has answered. */
export function tally(methods: readonly string[], at = new Date()): void {
  const day = utcDay(at);
  for (const m of methods) {
    const key = `${day}|${m}`;
    const t = pending.get(key) ?? { calls: 0, cu: 0 };
    t.calls += 1;
    t.cu += cuFor(m);
    pending.set(key, t);
  }
  if (methods.length > 0) scheduleFlush();
}

function scheduleFlush(): void {
  if (scheduled) return;
  scheduled = true;
  try {
    // Inside a request: once it has answered, so no person waits on the count.
    after(flushRpcUsage);
  } catch {
    // Anywhere else (the tick's own scripts, the test runner): a moment later, and before the process ends.
    setTimeout(() => void flushRpcUsage(), 2_000).unref();
  }
}

if (typeof process !== "undefined" && typeof process.once === "function") process.once("beforeExit", () => void flushRpcUsage());

/** Everything counted so far, added to its day's row. A count that cannot be written is lost and said once, never retried into a loop. */
export async function flushRpcUsage(): Promise<void> {
  scheduled = false;
  if (pending.size === 0) return;
  const rows = [...pending.entries()].map(([key, t]) => {
    const [day = "", method = ""] = key.split("|");
    return { day, method, calls: t.calls, cu: t.cu };
  });
  pending.clear();
  try {
    await db
      .insert(schema.rpcCalls)
      .values(rows)
      .onConflictDoUpdate({ target: [schema.rpcCalls.day, schema.rpcCalls.method], set: { calls: sql`${schema.rpcCalls.calls} + excluded.calls`, cu: sql`${schema.rpcCalls.cu} + excluded.cu` } });
  } catch (err) {
    console.warn("the RPC's units could not be counted", { why: err instanceof Error ? err.message.split("\n")[0] : "unknown" });
  }
}

/**
 * The relayer transport's fetch: the call goes as it would, and an answer from Alchemy is weighed (a call the node
 * answered, an error in the body included, costs its units) or, if it says no for rate or the month, kept as a refusal.
 */
export async function countedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!isAlchemy(url)) return fetch(input, init);
  const res = await fetch(input, init);
  if (res.ok) {
    tally(methodsOf(typeof init?.body === "string" ? init.body : null));
    return res;
  }
  const text = await res
    .clone()
    .text()
    .catch(() => "");
  const refused = refusalOf(res.status, text);
  if (refused) void noteRefusal("alchemy", refused === "month" ? "the month's compute units are spent" : "too many calls a second");
  return res;
}

/** The month's units so far (a UTC calendar month), from the rows. */
export async function cuThisMonth(now: Date): Promise<number> {
  const month = now.toISOString().slice(0, 7);
  const rows = (await db.execute(sql`select coalesce(sum(cu), 0)::bigint as cu from rpc_calls where day like ${`${month}-%`}`)) as unknown as Array<{ cu: string | number }>;
  return Number(rows[0]?.cu ?? 0);
}
