/**
 * What the model API costs, from the app's own record of every answer it got (the ops round, section 1). No API says
 * what credit is left, so the owner enters it on /stats after each top-up and the app subtracts what it has spent since,
 * each answer priced from its usage at the published prices: tokens in and out, the cache's tokens, and searches. The
 * record holds a label, a model and counts, never the prompt or the answer.
 */
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { noteRefusal } from "@/lib/ops/state";

/**
 * Nano-dollars a token, in and out, from Anthropic's pricing page on 2026-10-04 (Haiku 5.5 at a tenth of Haiku 4.5's, as
 * the owner's brief of 2026-10-08 gives it). Integers, so a price never rides on a float.
 */
export const PRICES: Readonly<Record<string, { input: bigint; output: bigint }>> = {
  "claude-haiku-4-5-20251001": { input: 1_000n, output: 5_000n },
  "claude-haiku-5-5": { input: 100n, output: 500n },
  "claude-sonnet-5": { input: 2_000n, output: 10_000n },
  "claude-sonnet-5-5": { input: 2_000n, output: 10_000n },
  "claude-opus-5-5": { input: 4_000n, output: 20_000n },
  "claude-fable-5-1": { input: 10_000n, output: 50_000n },
};
/** A model nobody priced is priced as the dearest here, so it never reads as free. */
export const UNPRICED = { input: 10_000n, output: 50_000n };
/** Web search: ten dollars a thousand, on top of the tokens its results add. */
export const SEARCH_NANO = 10_000_000n;
const NANO_PER_CENT = 10_000_000n;

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number; searches: number };

/** One answer's cost in nano-dollars: a cache write at a quarter over the input price, a cache read at a tenth of it. Pure. */
export function nanoOf(model: string, u: Usage): bigint {
  const p = PRICES[model] ?? UNPRICED;
  const written = (p.input * 5n * BigInt(u.cacheWrite)) / 4n;
  const read = (p.input * BigInt(u.cacheRead)) / 10n;
  return p.input * BigInt(u.input) + p.output * BigInt(u.output) + written + read + SEARCH_NANO * BigInt(u.searches);
}

/** Nano-dollars as whole cents, rounded up: what is left is never overstated. Pure. */
export function centsUp(nano: bigint): bigint {
  return (nano + NANO_PER_CENT - 1n) / NANO_PER_CENT;
}

/** Dollars and cents as typed on /stats ("20", "20.5", "$12.34", "1,250") as whole cents, or null for anything else. Pure. */
export function centsFromTyped(typed: string): bigint | null {
  const m = typed.trim().replace(/^\$/, "").replace(/,/g, "").match(/^(\d{1,6})(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  return BigInt(m[1] as string) * 100n + BigInt((m[2] ?? "").padEnd(2, "0") || "0");
}

/** A response's usage as the API reports it. */
export function usageOf(res: { usage?: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null; server_tool_use?: { web_search_requests?: number | null } | null } | null }): Usage {
  const u = res.usage;
  return { input: u?.input_tokens ?? 0, output: u?.output_tokens ?? 0, cacheRead: u?.cache_read_input_tokens ?? 0, cacheWrite: u?.cache_creation_input_tokens ?? 0, searches: u?.server_tool_use?.web_search_requests ?? 0 };
}

/** Every answer the API gave, kept as its usage. Never throws: a record that could not be written is a line in the log. */
export async function recordAiCall(label: string, model: string, u: Usage, at: Date = new Date()): Promise<void> {
  try {
    await db.insert(schema.aiCalls).values({ at, label: label.slice(0, 60), model, inputTokens: u.input, outputTokens: u.output, cacheReadTokens: u.cacheRead, cacheWriteTokens: u.cacheWrite, searches: u.searches });
  } catch (err) {
    console.warn("a model call's usage could not be kept", { why: err instanceof Error ? err.message.split("\n")[0] : "unknown" });
  }
}

/**
 * Whether an error is the API saying the credit is gone: its documented billing error (402), or the 400 whose message
 * says the balance is too low, which it still sends (read in Anthropic's own SDK repository, September 2026). Pure.
 */
export function outOfCredit(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const status = "status" in err ? Number((err as { status: unknown }).status) : 0;
  const message = err instanceof Error ? err.message : "";
  const type = "type" in err ? String((err as { type: unknown }).type ?? "") : "";
  return status === 402 || type === "billing_error" || /credit balance is too low/i.test(message);
}

/** An error from the API, noted when it says the credit is gone (it holds the line at urgent), and passed on as it was. */
export function noteIfOutOfCredit(err: unknown): void {
  if (outOfCredit(err)) void noteRefusal("anthropic", "the credit balance is too low");
}

/** What the app has spent since a moment (up to another, or now), by model, priced here. */
export async function spentSince(at: Date | null, until: Date | null = null): Promise<{ nano: bigint; calls: number }> {
  const rows = (await db.execute(
    sql`select model, count(*)::int as calls, coalesce(sum(input_tokens), 0)::bigint as input, coalesce(sum(output_tokens), 0)::bigint as output, coalesce(sum(cache_read_tokens), 0)::bigint as cache_read, coalesce(sum(cache_write_tokens), 0)::bigint as cache_write, coalesce(sum(searches), 0)::bigint as searches from ai_calls where ${at ? sql`at >= ${at.toISOString()}::timestamptz` : sql`true`} and ${until ? sql`at < ${until.toISOString()}::timestamptz` : sql`true`} group by model`,
  )) as unknown as Array<{ model: string; calls: number; input: string | number; output: string | number; cache_read: string | number; cache_write: string | number; searches: string | number }>;
  let nano = 0n;
  let calls = 0;
  for (const r of rows) {
    calls += Number(r.calls);
    nano += nanoOf(r.model, { input: Number(r.input), output: Number(r.output), cacheRead: Number(r.cache_read), cacheWrite: Number(r.cache_write), searches: Number(r.searches) });
  }
  return { nano, calls };
}

/** The credit as the owner last entered it, or null if never. */
export async function lastCredit(): Promise<{ cents: bigint; at: Date } | null> {
  const [row] = await db.select().from(schema.anthropicCredit).orderBy(sql`${schema.anthropicCredit.enteredAt} desc`).limit(1);
  return row ? { cents: row.cents, at: row.enteredAt } : null;
}

/** What is left of an amount entered at a moment: less what has been spent since (up to `until`, or now), in cents, never below zero. */
export async function creditLeftFrom(entry: { cents: bigint; at: Date }, until: Date | null = null): Promise<{ cents: bigint; enteredCents: bigint; enteredAt: Date; spentCents: bigint }> {
  const spent = centsUp((await spentSince(entry.at, until)).nano);
  return { cents: entry.cents > spent ? entry.cents - spent : 0n, enteredCents: entry.cents, enteredAt: entry.at, spentCents: spent };
}

/** What is left of the last amount entered, or null if none was. */
export async function creditLeft(): Promise<{ cents: bigint; enteredCents: bigint; enteredAt: Date; spentCents: bigint } | null> {
  const last = await lastCredit();
  return last ? creditLeftFrom(last) : null;
}
