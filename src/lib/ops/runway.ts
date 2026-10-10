/**
 * Runway (the ops round, section 1): every limit production can run into, read against the owner's lines in
 * src/lib/ops/lines.ts. Each level is read on its own with its own time limit; one that cannot be read is "unread" and
 * leaves its alerts as they were. A level past its warning line, and again past its urgent line, tells the owner once
 * (src/lib/ops/alerts.ts). The relayer's own alerts (under the floor, under three days) are folded in here.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { creditLeft } from "@/lib/ai/spend";
import { daysCovered, monOf, relayerLow, relayerRunway } from "@/lib/chain/watch";
import { within } from "@/lib/usage/within";
import { LINES, REFUSAL_HOLDS_MS } from "./lines";
import { markTold, observe, tellDue, tellOwner, type Teller } from "./alerts";
import { cuThisMonth } from "./rpc-usage";
import { lastRefusal, noteRefusal, type OpsState } from "./state";
import { allInTurns } from "./turns";

export type RunwayKey = "relayer" | "anthropic" | "database" | "storage" | "resend_day" | "resend_month" | "alchemy" | "indexer";
export type LevelState = "ok" | "warn" | "urgent" | "unread";
export type Level = {
  key: RunwayKey;
  /** What runs out, in words. */
  what: string;
  /** The level as read, in words. */
  reading: string;
  state: LevelState;
  /** The lines, in words, for the morning email. */
  lines: string;
  /** What crossed, in words, when it is past a line. */
  why: string | null;
};

const fmtCents = (c: bigint) => `$${(c / 100n).toString()}.${(c % 100n).toString().padStart(2, "0")}`;
const fmtBytes = (b: number) => (b >= 1_000_000_000 ? `${(b / 1_000_000_000).toFixed(2)} GB` : `${(b / 1_000_000).toFixed(1)} MB`);
const pct = (used: number, limit: number) => Math.floor((100 * used) / limit);
const recent = (r: OpsState | null, now: Date) => r !== null && now.getTime() - r.at.getTime() < REFUSAL_HOLDS_MS;
const hhmm = (at: Date) => `${at.toISOString().slice(11, 16)} UTC`;

/** The relayer's MON: warned under ten, urgent under five or under three days at the past week's rate. Pure. */
export function relayerLevel(balance: bigint, perDay: bigint): Level {
  const L = LINES.relayer;
  const days = daysCovered(balance, perDay);
  const reading = `${monOf(balance)} MON${days === null ? "" : `, about ${days} days at the past week's rate of ${monOf(perDay)} a day`}`;
  const urgent = relayerLow(balance, L.urgent, perDay);
  const warn = balance < L.warn;
  return {
    key: "relayer",
    what: "The relayer's MON",
    reading,
    state: urgent ? "urgent" : warn ? "warn" : "ok",
    lines: `warned under ${monOf(L.warn)} MON, urgent under ${monOf(L.urgent)} MON or ${L.urgentDays} days`,
    why: urgent ? (balance < L.urgent ? `the relayer is under ${monOf(L.urgent)} MON` : `the relayer covers under ${L.urgentDays} days`) : warn ? `the relayer is under ${monOf(L.warn)} MON` : null,
  };
}

/** The model API's credit: what was entered less what was spent since; urgent under two dollars or on any answer saying it is gone. Pure. */
export function creditLevel(left: { cents: bigint; enteredCents: bigint; enteredAt: Date; spentCents: bigint } | null, refused: OpsState | null, now: Date): Level {
  const L = LINES.anthropic;
  const lines = `warned under ${fmtCents(L.warnCents)}, urgent under ${fmtCents(L.urgentCents)} or when the API says the balance is too low`;
  const out = recent(refused, now);
  if (!left && !out) return { key: "anthropic", what: "The model API's credit", reading: "never entered: enter it on dareful.app/stats after a top-up", state: "unread", lines, why: null };
  const reading = left ? `${fmtCents(left.cents)} left of ${fmtCents(left.enteredCents)} entered ${left.enteredAt.toISOString().slice(0, 10)}, ${fmtCents(left.spentCents)} spent since` : "never entered";
  const urgent = out || (left !== null && left.cents < L.urgentCents);
  const warn = left !== null && left.cents < L.warnCents;
  return {
    key: "anthropic",
    what: "The model API's credit",
    reading: out && refused ? `${reading}; the API said the balance is too low at ${hhmm(refused.at)}` : reading,
    state: urgent ? "urgent" : warn ? "warn" : "ok",
    lines,
    why: out ? "the model API says the credit balance is too low" : urgent ? `the model API's credit is under ${fmtCents(L.urgentCents)}` : warn ? `the model API's credit is under ${fmtCents(L.warnCents)}` : null,
  };
}

/** A share of a plan's limit: warned at the first percent, urgent at the second (the owner's lines, or a walk's lowered one). Pure. */
export function percentLevel(key: "database" | "storage", used: number, L: { limitBytes: number; warnPercent: number; urgentPercent: number } = LINES[key]): Level {
  const p = pct(used, L.limitBytes);
  const what = key === "database" ? "Supabase's database" : "Supabase Storage";
  const state: LevelState = p >= L.urgentPercent ? "urgent" : p >= L.warnPercent ? "warn" : "ok";
  return {
    key,
    what,
    reading: `${fmtBytes(used)} of ${fmtBytes(L.limitBytes)} (${p}%)`,
    state,
    lines: `warned at ${L.warnPercent}%, urgent at ${L.urgentPercent}%${key === "database" ? ", past which the project goes read-only" : ""}`,
    why: state === "ok" ? null : `${what} is at ${p}% of the free plan's ${fmtBytes(L.limitBytes)}`,
  };
}

/** Resend's sends today (a UTC day) and this month, against the free plan's 100 and 3,000. Pure. */
export function resendLevels(today: number, month: number): [Level, Level] {
  const L = LINES.resend;
  const day: LevelState = today >= L.dayUrgent ? "urgent" : today >= L.dayWarn ? "warn" : "ok";
  const mon: LevelState = month >= L.monthUrgent ? "urgent" : month >= L.monthWarn ? "warn" : "ok";
  return [
    { key: "resend_day", what: "Resend's emails today (UTC)", reading: `${today} of ${L.dayLimit}`, state: day, lines: `warned at ${L.dayWarn}, urgent at ${L.dayUrgent}`, why: day === "ok" ? null : `${today} emails sent today, of Resend's ${L.dayLimit} a day` },
    { key: "resend_month", what: "Resend's emails this month (UTC)", reading: `${month.toLocaleString("en-US")} of ${L.monthLimit.toLocaleString("en-US")}`, state: mon, lines: `warned at ${L.monthWarn.toLocaleString("en-US")}, urgent at ${L.monthUrgent.toLocaleString("en-US")}`, why: mon === "ok" ? null : `${month.toLocaleString("en-US")} emails sent this month, of Resend's ${L.monthLimit.toLocaleString("en-US")}` },
  ];
}

/** Alchemy's compute units this month, against the free plan's thirty million; urgent on any refusal. Pure. */
export function alchemyLevel(cu: number, refused: OpsState | null, now: Date): Level {
  const L = LINES.alchemy;
  const p = pct(cu, L.limitCu);
  const out = recent(refused, now);
  const state: LevelState = out || p >= L.urgentPercent ? "urgent" : p >= L.warnPercent ? "warn" : "ok";
  const reading = `${(cu / 1_000_000).toFixed(2)} million of ${L.limitCu / 1_000_000} million units this month (${p}%)`;
  return {
    key: "alchemy",
    what: "Alchemy's compute units",
    reading: out && refused ? `${reading}; refused (${String(refused.value.why ?? "for rate")}) at ${hhmm(refused.at)}` : reading,
    state,
    lines: `warned at ${L.warnPercent}%, urgent at ${L.urgentPercent}% or on any refusal`,
    why: out ? `Alchemy refused a call (${String(refused?.value.why ?? "for rate")})` : state === "ok" ? null : `Alchemy is at ${p}% of the month's units`,
  };
}

/** The hosted indexer's deployment: days left of its thirty, from when it started; urgent at three or on any refusal. Pure. */
export function indexerLevel(startedAt: Date, refused: OpsState | null, now: Date): Level {
  const L = LINES.indexer;
  const ends = startedAt.getTime() + L.lifespanDays * 86_400_000;
  const left = Math.floor((ends - now.getTime()) / 86_400_000);
  const out = recent(refused, now);
  const state: LevelState = out || left <= L.urgentDaysLeft ? "urgent" : left <= L.warnDaysLeft ? "warn" : "ok";
  const reading = `started ${startedAt.toISOString().slice(0, 10)}, ${Math.max(0, left)} days before the Development plan deletes it`;
  return {
    key: "indexer",
    what: "The hosted indexer's deployment",
    reading: out && refused ? `${reading}; it refused a query at ${hhmm(refused.at)}` : reading,
    state,
    lines: `warned at ${L.warnDaysLeft} days left, urgent at ${L.urgentDaysLeft} or on any refusal`,
    why: out ? "the hosted indexer refused a query (100 a minute)" : state === "ok" ? null : `the hosted indexer's deployment has ${Math.max(0, left)} days left`,
  };
}

/**
 * When the deployment the app reads first caught up with the chain, from its own metadata: the day it was made, near
 * enough, and the day the Development plan's thirty count from. A redeploy answers with its own.
 */
export async function indexerStarted(): Promise<Date> {
  const url = process.env.ENVIO_GRAPHQL_URL;
  if (!url) throw new Error("ENVIO_GRAPHQL_URL is not set");
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "query Started { chain_metadata { timestamp_caught_up_to_head_or_endblock } }" }), cache: "no-store" });
  if (res.status === 429) void noteRefusal("indexer", "too many queries a minute");
  if (!res.ok) throw new Error(`the indexer answered ${res.status}`);
  const json = (await res.json()) as { data?: { chain_metadata?: Array<{ timestamp_caught_up_to_head_or_endblock?: string | null }> } };
  const at = json.data?.chain_metadata?.[0]?.timestamp_caught_up_to_head_or_endblock;
  if (!at) throw new Error("the indexer has not caught up yet");
  return new Date(at);
}

/** How long each read may take before it is called unread. */
export const READ_LIMIT_MS = 6_000;

async function oneNumber(q: ReturnType<typeof sql>): Promise<number> {
  const rows = (await db.execute(q)) as unknown as Array<{ n: string | number | null }>;
  return Number(rows[0]?.n ?? 0);
}

/** Supabase's database size as its usage page counts it: every database's size summed. */
export async function databaseBytes(): Promise<number> {
  return oneNumber(sql`select sum(pg_database_size(datname))::bigint as n from pg_database where datallowconn`);
}

export async function storageBytes(): Promise<number> {
  return oneNumber(sql`select coalesce(sum((metadata->>'size')::bigint), 0)::bigint as n from storage.objects`);
}

/** The app's emails that went today and this month, each a UTC calendar day and month. */
export async function emailsSent(now: Date): Promise<{ today: number; month: number }> {
  const day = now.toISOString().slice(0, 10);
  const month = `${now.toISOString().slice(0, 7)}-01`;
  const rows = (await db.execute(
    sql`select count(*) filter (where at >= ${day}::date)::int as today, count(*)::int as month from channel_sends where channel = 'email' and ok and at >= ${month}::date`,
  )) as unknown as Array<{ today: number; month: number }>;
  return { today: Number(rows[0]?.today ?? 0), month: Number(rows[0]?.month ?? 0) };
}

const unread = (key: RunwayKey, what: string, err: unknown): Level => ({ key, what, reading: `couldn't be read (${err instanceof Error ? err.name : "unknown"})`, state: "unread", lines: "", why: null });

/** Every level, read now, each on its own time. */
export async function readRunway(now: Date): Promise<Level[]> {
  // Each read on its own time, a few at a time (src/lib/ops/turns.ts): the database's pooler stalls on a deep queue.
  const read = <T>(f: () => Promise<T>) => () => within(READ_LIMIT_MS, f()).then((value): PromiseSettledResult<T> => ({ status: "fulfilled", value }), (reason: unknown): PromiseSettledResult<T> => ({ status: "rejected", reason }));
  const [relayer, credit, database, storage, emails, alchemy, indexer] = await allInTurns([
    read(() => relayerRunway(now)),
    read(async () => [await creditLeft(), await lastRefusal("anthropic")] as const),
    read(() => databaseBytes()),
    read(() => storageBytes()),
    read(() => emailsSent(now)),
    read(async () => [await cuThisMonth(now), await lastRefusal("alchemy")] as const),
    read(async () => [await indexerStarted(), await lastRefusal("indexer")] as const),
  ]);
  return [
    relayer.status === "fulfilled" ? relayerLevel(relayer.value.balance, relayer.value.perDay) : unread("relayer", "The relayer's MON", relayer.reason),
    credit.status === "fulfilled" ? creditLevel(credit.value[0], credit.value[1], now) : unread("anthropic", "The model API's credit", credit.reason),
    database.status === "fulfilled" ? percentLevel("database", database.value) : unread("database", "Supabase's database", database.reason),
    storage.status === "fulfilled" ? percentLevel("storage", storage.value) : unread("storage", "Supabase Storage", storage.reason),
    ...(emails.status === "fulfilled" ? resendLevels(emails.value.today, emails.value.month) : [unread("resend_day", "Resend's emails today (UTC)", emails.reason), unread("resend_month", "Resend's emails this month (UTC)", emails.reason)]),
    alchemy.status === "fulfilled" ? alchemyLevel(alchemy.value[0], alchemy.value[1], now) : unread("alchemy", "Alchemy's compute units", alchemy.reason),
    indexer.status === "fulfilled" ? indexerLevel(indexer.value[0], indexer.value[1], now) : unread("indexer", "The hosted indexer's deployment", indexer.reason),
  ];
}

/** The two alerts a level holds: past its warning line, and past its urgent line. Unread changes neither. */
export function alertsOf(l: Level, prefix = "runway:"): Array<{ key: string; active: boolean; line: string }> {
  if (l.state === "unread") return [];
  return [
    { key: `${prefix}${l.key}:warn`, active: l.state === "warn" || l.state === "urgent", line: `${l.why ?? l.what}: ${l.reading}` },
    { key: `${prefix}${l.key}:urgent`, active: l.state === "urgent", line: `Urgent: ${l.why ?? l.what}: ${l.reading}` },
  ];
}

/** Reads every level and tells the owner of each line crossed since it was last clear, at once. A test passes its own levels and its own names' start. */
export async function watchRunway(now: Date, tell: Teller = tellOwner, levels?: Level[], prefix = "runway:"): Promise<{ levels: Level[]; told: string[] }> {
  const read = levels ?? (await readRunway(now));
  const due: Array<{ key: string; line: string }> = [];
  for (const l of read) for (const a of alertsOf(l, prefix)) if (await observe(a.key, a.active, l.reading, now, 0)) due.push({ key: a.key, line: a.line });
  // An urgent line crossed says the warning too; the owner reads the urgent one alone.
  const urgentKeys = new Set(due.filter((d) => d.key.endsWith(":urgent")).map((d) => d.key.replace(/:urgent$/, ":warn")));
  const lines = due.filter((d) => !urgentKeys.has(d.key));
  const told = await tellDue(lines, now, tell);
  // The warning rode on the urgent one's telling, so it is marked told with it and never told on its own after.
  if (told.length > 0) await markTold([...urgentKeys], now);
  return { levels: read, told };
}
