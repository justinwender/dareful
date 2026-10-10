/**
 * The morning email (the ops round, section 5): at 8am Eastern the tick sends `OPS_EMAIL` one summary of the last 24
 * hours. Every runway level against its lines and the two to read by hand with where; each system's state now, with
 * every failure and when; the canary's runs; what the model API cost; the errors people saw, by cause; and yesterday's
 * numbers. Once a day: the day is claimed in `ops_state` before anything is sent, so two ticks never send it twice.
 * Urgent things do not wait for it (src/lib/ops/runway.ts, src/lib/ops/health.ts).
 */
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { centsUp, spentSince } from "@/lib/ai/spend";
import { sendOps } from "@/lib/notify/channels";
import { countStats, dayOf, dayWindow, STATS, PERCENT_STATS, STATS_ZONE } from "@/lib/usage/stats";
import { BY_HAND } from "./lines";
import { readRunway, type Level } from "./runway";
import { hereEnv, type CheckName, type CheckResult, type CheckState } from "./health";
import { claimState, putState, trimOps } from "./state";
import { allInTurns } from "./turns";
import { canaryOff } from "./canary";

/** The hour, Eastern, from which the day's email goes. */
export const MORNING_HOUR = 8;

const easternHour = (at: Date) => Number(new Intl.DateTimeFormat("en-US", { timeZone: STATS_ZONE, hour: "2-digit", hourCycle: "h23" }).format(at));

/** Whether the morning email is due by the clock: 8am Eastern or later on the day. The claim makes it once. Pure. */
export function morningDue(now: Date): boolean {
  return easternHour(now) >= MORNING_HOUR;
}

/** The Eastern day before this one, YYYY-MM-DD, by the calendar. Pure. */
export function yesterdayOf(now: Date): string {
  const [y, m, d] = dayOf(now).split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

export type Span = { name: CheckName; state: Exclude<CheckState, "ok">; from: Date; to: Date; runs: number; note: string | null };

/**
 * Every stretch a check was not ok over the runs given, oldest first: consecutive runs in the same state are one span,
 * from its first run to its last. Pure.
 */
export function failureSpans(runs: ReadonlyArray<{ at: Date; checks: readonly CheckResult[] }>): Span[] {
  const sorted = [...runs].sort((a, b) => a.at.getTime() - b.at.getTime());
  const open = new Map<CheckName, Span>();
  const out: Span[] = [];
  for (const r of sorted) {
    const seen = new Set<CheckName>();
    for (const c of r.checks) {
      seen.add(c.name);
      const cur = open.get(c.name);
      if (c.state === "ok") {
        if (cur) {
          out.push(cur);
          open.delete(c.name);
        }
        continue;
      }
      if (cur && cur.state === c.state) {
        cur.to = r.at;
        cur.runs += 1;
        continue;
      }
      if (cur) out.push(cur);
      open.set(c.name, { name: c.name, state: c.state, from: r.at, to: r.at, runs: 1, note: c.note });
    }
    for (const [name, span] of open) if (!seen.has(name)) (out.push(span), open.delete(name));
  }
  out.push(...open.values());
  return out.sort((a, b) => a.from.getTime() - b.from.getTime() || a.name.localeCompare(b.name));
}

const utc = (at: Date) => `${at.toISOString().slice(11, 16)} UTC`;
const dollars = (cents: bigint) => `$${(cents / 100n).toString()}.${(cents % 100n).toString().padStart(2, "0")}`;

export type MorningFacts = {
  now: Date;
  levels: Level[];
  latest: { at: Date; checks: CheckResult[] } | null;
  spans: Span[];
  canary: Array<{ startedAt: Date; ok: boolean | null; step: string | null; error: string | null; ms: number | null }>;
  /** Why the canary cannot run here, when it cannot. */
  canaryOff: string | null;
  ai: { cents: bigint; calls: number };
  errors: Array<{ cause: string; n: number }>;
  yesterday: { day: string; counts: Record<string, number> | null };
};

/** The email itself, from what was read. Pure, so its words have a test. */
export function composeMorning(f: MorningFacts): { subject: string; text: string } {
  const urgent = f.levels.filter((l) => l.state === "urgent");
  const warn = f.levels.filter((l) => l.state === "warn");
  const down = f.latest?.checks.filter((c) => c.state === "down") ?? [];
  const canaryFailed = f.canary.filter((c) => c.ok === false).length;
  const headline = urgent.length || down.some((c) => c.core) ? "needs you" : warn.length || down.length || canaryFailed ? "has something to look at" : "is fine";
  const subject = `Dareful this morning ${headline}`;
  const lines: string[] = [];
  lines.push(`Dareful, the 24 hours to ${utc(f.now)} on ${f.now.toISOString().slice(0, 10)}.`, "");
  lines.push("RUNWAY");
  for (const l of f.levels) lines.push(`- ${l.what}: ${l.reading}. ${l.state === "ok" ? "Fine" : l.state === "unread" ? "Not read" : l.state === "warn" ? "Past the warning line" : "URGENT"}${l.lines ? ` (${l.lines})` : ""}.`);
  lines.push("", "To read by hand (no API answers them on these plans):");
  for (const h of BY_HAND) lines.push(`- ${h.what}: against ${h.line}. ${h.url}`);
  lines.push("", "SYSTEMS");
  if (f.latest) {
    lines.push(`At ${utc(f.latest.at)}: ${f.latest.checks.map((c) => `${c.name} ${c.state}`).join(", ")}.`);
  } else lines.push("No health run kept in the last 24 hours: the tick and the outside check have both been quiet.");
  if (f.spans.length === 0) lines.push("Nothing failed in the 24 hours.");
  else for (const s of f.spans) lines.push(`- ${s.name} ${s.state} ${s.runs === 1 ? `at ${utc(s.from)}` : `from ${utc(s.from)} to ${utc(s.to)} (${s.runs} runs)`}${s.note ? `: ${s.note}` : ""}`);
  lines.push("", "THE CANARY");
  if (f.canaryOff) lines.push(`Off: ${f.canaryOff}.`);
  if (f.canary.length === 0) lines.push("No run in the 24 hours.");
  else for (const c of f.canary) lines.push(`- ${utc(c.startedAt)}: ${c.ok === true ? `passed${c.ms !== null ? ` in ${Math.round(c.ms / 1000)}s` : ""}` : c.ok === false ? `failed at ${c.step ?? "an unknown step"}${c.error ? `: ${c.error}` : ""}` : "still running or stopped"}`);
  lines.push("", "THE MODEL API");
  lines.push(`${dollars(f.ai.cents)} across ${f.ai.calls} ${f.ai.calls === 1 ? "call" : "calls"}, at the published prices.`);
  lines.push("", "ERRORS PEOPLE SAW");
  if (f.errors.length === 0) lines.push("None.");
  else lines.push(f.errors.map((e) => `${e.cause.replace(/_/g, " ")} ${e.n}`).join(", "));
  lines.push("", `YESTERDAY (${f.yesterday.day}, Eastern)`);
  if (!f.yesterday.counts) lines.push("The numbers couldn't be read.");
  else for (const s of STATS.slice(0, 12)) lines.push(`- ${s.label}: ${f.yesterday.counts[s.key] ?? 0}${PERCENT_STATS.has(s.key) ? "%" : ""}`);
  lines.push("", "Every number with its definition is on dareful.app/stats.");
  return { subject, text: lines.join("\n") };
}

/** Everything the email says, read now: the systems as this environment's own runs saw them, never a laptop's. */
export async function morningFacts(now: Date, env = hereEnv()): Promise<MorningFacts> {
  const since = new Date(now.getTime() - 24 * 3_600_000);
  // A few reads at a time (src/lib/ops/turns.ts): the database's pooler stalls on a deep queue.
  const levels = await readRunway(now);
  const [runs, canary, ai, errorRows] = await allInTurns([
    () => db.select({ at: schema.healthRuns.at, checks: schema.healthRuns.checks }).from(schema.healthRuns).where(and(eq(schema.healthRuns.env, env), gte(schema.healthRuns.at, since), lt(schema.healthRuns.at, now))).orderBy(desc(schema.healthRuns.at)),
    () => db.select().from(schema.canaryRuns).where(and(gte(schema.canaryRuns.startedAt, since), lt(schema.canaryRuns.startedAt, now))).orderBy(schema.canaryRuns.startedAt),
    () => spentSince(since, now),
    () =>
      db.execute(
        sql`select coalesce(e.props->>'cause', 'other') as cause, count(*)::int as n from usage_events e left join users u on u.id = e.user_id left join participant_claims c on c.id = e.claim_id where e.name = 'error_shown' and e.at >= ${since.toISOString()}::timestamptz and e.at < ${now.toISOString()}::timestamptz and coalesce(u.excluded_from_counts, false) = false and coalesce(c.excluded_from_counts, false) = false group by 1 order by 2 desc`,
      ) as unknown as Promise<Array<{ cause: string; n: number }>>,
  ]);
  const day = yesterdayOf(now);
  const counts = await countStats(dayWindow(day)).catch(() => null);
  const typed = runs.map((r) => ({ at: r.at, checks: r.checks as CheckResult[] }));
  return {
    now,
    levels,
    latest: typed[0] ?? null,
    spans: failureSpans(typed),
    canary: canary.map((c) => ({ startedAt: c.startedAt, ok: c.ok, step: c.step, error: c.error, ms: c.finishedAt ? c.finishedAt.getTime() - c.startedAt.getTime() : null })),
    canaryOff: canaryOff(),
    ai: { cents: centsUp(ai.nano), calls: ai.calls },
    errors: Array.from(errorRows, (r) => ({ cause: r.cause, n: Number(r.n) })),
    yesterday: { day, counts: counts as Record<string, number> | null },
  };
}

/**
 * The tick's part: from 8am Eastern, the day's email once. The day is claimed before anything is read, so a second
 * tick in the same minute sends nothing; a send that failed is kept as failed and not tried again that day.
 */
export async function sendMorning(now: Date, send: (subject: string, text: string) => Promise<boolean> = sendOps): Promise<"sent" | "failed" | "not due" | "taken"> {
  if (!morningDue(now)) return "not due";
  const key = `morning:${dayOf(now)}`;
  if (!(await claimState(key, { at: now.toISOString() }, now))) return "taken";
  // A summary that cannot be read still goes, saying so: a silent morning would read as a quiet one.
  const { subject, text } = await morningFacts(now).then(composeMorning, (err: unknown) => ({ subject: "Dareful this morning could not be read", text: `The morning summary could not be read (${err instanceof Error ? err.name : "unknown"}). The health route and dareful.app/stats say how things stand.` }));
  const went = await send(subject, text);
  await putState(key, { sent: went }, now);
  await trimOps(now).catch(() => undefined);
  return went ? "sent" : "failed";
}
