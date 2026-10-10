/**
 * Health (the ops round, section 2): every system the app depends on, each checked with its own time limit and answered
 * as ok, slow or down, with nothing secret in the answer (no address with a key, no error's text, a few plain words at
 * most). The core systems decide whether production is up: the database, the tick having run in the last three
 * minutes, Monad's RPC with a block under two minutes old, code at both contract addresses, the relayer over its floor,
 * and the hosted indexer within a minute of the chain's head. The rest are reported without deciding it, and the ones
 * that cost something to ask (a model call, a drawing, another service's quota) are asked at most once an hour.
 *
 * Every run's answer is kept in `health_runs`, and a run is shared for a minute however often the answer is asked for
 * (`healthAnswer`), so the hosted indexer sees at most a query a minute from here and the model API a call an hour. A
 * core system down for ten minutes reaches the owner at once (src/lib/ops/alerts.ts). Every environment shares the
 * database and each one's health is its own (its tick, its indexer, its pages), so a run is kept under the environment
 * that made it (`hereEnv`), each reads and shares only its own, and only production's reach the owner.
 */
import { resolveTxt } from "node:dns/promises";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { pingModel } from "@/lib/ai/client";
import { contracts } from "@/lib/chain/contracts";
import { relayer } from "@/lib/chain/relayer";
import { monOf, RELAYER_FLOOR } from "@/lib/chain/watch";
import { putObject, signedUrl, storageConfigured } from "@/lib/media/storage";
import { espn } from "@/lib/sports/espn";
import { checkGamesOn } from "@/lib/sports/balldontlie";
import { renderNumbersCard } from "@/lib/ui/numbers-card";
import { loadTileFonts } from "@/lib/ui/tile-fonts";
import { renderTile } from "@/lib/ui/tiles";
import { publicNumbers } from "@/lib/usage/public-numbers";
import { within } from "@/lib/usage/within";
import { DOWN_TELLS_AFTER_MS } from "./lines";
import { observe, tellDue, tellOwner, type Teller } from "./alerts";
import { readState } from "./state";
import { inTurns, TURN } from "./turns";

export type CheckState = "ok" | "slow" | "down";
export type CheckName = "database" | "tick" | "rpc" | "contracts" | "relayer" | "indexer" | "anthropic" | "resend" | "dynamic" | "storage" | "scoreboard" | "second_source" | "push" | "numbers_image" | "link_tile";
export type CheckResult = { name: CheckName; core: boolean; state: CheckState; ms: number; note: string | null; at: string };
export type HealthRun = { ok: boolean; at: string; env: string; checks: CheckResult[] };

/** The tick's last run must be this recent for the scheduler to count as up. */
export const TICK_FRESH_MS = 3 * 60_000;
/** Monad's latest block must be this recent for its RPC to count as up. */
export const BLOCK_FRESH_MS = 2 * 60_000;
/** The hosted indexer must be this close to the chain's head. */
export const INDEXER_LAG_MS = 60_000;
/** A run is shared this long: asked again inside it, the answer kept is the answer. */
export const SHARE_MS = 60_000;
/** The longest the route waits on one read or write of its own (the last run, the claim, the keep), so a stalled pool never holds the answer. */
const READ_MS = 4_000;
/** And on the alerts' look at the core, a few small writes. */
const KEEP_MS = 8_000;
/** The checks that cost something to ask are asked this often at most; between, their last answer stands. */
export const HOURLY_MS = 60 * 60_000;

type Ctx = { now: Date; head: Promise<{ number: bigint; timestamp: bigint }> };
type Check = { name: CheckName; core: boolean; limitMs: number; slowMs: number; every?: number; run: (ctx: Ctx) => Promise<string | null> };
type RunOpts = { tell?: Teller; checks?: readonly Check[]; /** The alerts' names' start: a test's own, never production's. */ prefix?: string; /** Whose run it is: a test's own name, else where this server runs. */ env?: string };

/**
 * Where a run is made, from the platform's own word: production, a preview, or anywhere else (a laptop, a test run).
 * A laptop's run reads its own indexer and its own pages and has no tick, so production never stands on it. Pure.
 */
export function hereEnv(env: Record<string, string | undefined> = process.env): string {
  return env.VERCEL_ENV === "production" ? "production" : env.VERCEL_ENV === "preview" ? "preview" : "local";
}

/** Whether a run looks at the core for the owner: production's always, anywhere else only for a test with a teller of its own. Pure. */
export function watchesHere(env: string, ownTeller: boolean): boolean {
  return ownTeller || env === "production";
}

/** A check's own failure, said in a few plain words: nothing it says can carry an address or a key. */
export class Down extends Error {
  constructor(public readonly words: string) {
    super(words);
    this.name = "Down";
  }
}

const ago = (ms: number) => (ms < 90_000 ? `${Math.round(ms / 1000)}s ago` : `${Math.round(ms / 60_000)} min ago`);

/** The checks, in the order the answer lists them. */
export const CHECKS: readonly Check[] = [
  {
    name: "database",
    core: true,
    limitMs: 4_000,
    slowMs: 1_500,
    run: async () => {
      await db.execute(sql`select 1`);
      return null;
    },
  },
  {
    name: "tick",
    core: true,
    limitMs: 4_000,
    slowMs: 1_500,
    run: async ({ now }) => {
      const beat = await readState("tick");
      if (!beat) throw new Down("has never run");
      const age = now.getTime() - beat.at.getTime();
      if (!tickFresh(beat.at, now)) throw new Down(`last ran ${ago(age)}`);
      return `last ran ${ago(age)}`;
    },
  },
  {
    name: "rpc",
    core: true,
    limitMs: 6_000,
    slowMs: 2_500,
    run: async ({ now, head }) => {
      const b = await head;
      const age = now.getTime() - Number(b.timestamp) * 1000;
      if (!blockFresh(b.timestamp, now)) throw new Down(`latest block ${ago(age)}`);
      return `block ${b.number}`;
    },
  },
  {
    name: "contracts",
    core: true,
    limitMs: 6_000,
    slowMs: 2_500,
    run: async () => {
      const { publicClient } = relayer();
      const c = contracts();
      const [ledger, dares] = await Promise.all([publicClient.getCode({ address: c.ledger.address }), publicClient.getCode({ address: c.dares.address })]);
      const missing = [!ledger || ledger === "0x" ? "the ledger" : null, !dares || dares === "0x" ? "the questions" : null].filter(Boolean);
      if (missing.length > 0) throw new Down(`no code at ${missing.join(" and ")}`);
      return null;
    },
  },
  {
    name: "relayer",
    core: true,
    limitMs: 6_000,
    slowMs: 2_500,
    run: async () => {
      const { account, publicClient } = relayer();
      const balance = await publicClient.getBalance({ address: account.address });
      if (balance < RELAYER_FLOOR) throw new Down(`${monOf(balance)} MON, under the ${monOf(RELAYER_FLOOR)} floor`);
      return `${monOf(balance)} MON`;
    },
  },
  {
    name: "indexer",
    core: true,
    limitMs: 8_000,
    slowMs: 3_000,
    run: async ({ head }) => {
      const processed = await indexerHead();
      const b = await head;
      if (processed >= b.number) return "at the head";
      const { publicClient } = relayer();
      const at = await publicClient.getBlock({ blockNumber: processed });
      const lag = Number(b.timestamp - at.timestamp) * 1000;
      if (!indexerCaughtUp(lag)) throw new Down(`${ago(lag).replace(" ago", "")} behind the chain`);
      return `${Math.round(lag / 1000)}s behind`;
    },
  },
  {
    name: "anthropic",
    core: false,
    limitMs: 20_000,
    slowMs: 8_000,
    every: HOURLY_MS,
    run: async () => {
      try {
        await pingModel(18_000);
      } catch (err) {
        throw new Down(modelWords(err));
      }
      return null;
    },
  },
  {
    name: "resend",
    core: false,
    limitMs: 6_000,
    slowMs: 2_500,
    every: HOURLY_MS,
    run: async () => {
      const key = process.env.RESEND_API_KEY;
      const domain = (process.env.EMAIL_FROM ?? "").match(/@([^>\s]+)/)?.[1]?.toLowerCase();
      if (!key || !domain) throw new Down("not set up");
      const res = await fetch("https://api.resend.com/domains", { headers: { authorization: `Bearer ${key}` }, cache: "no-store" });
      // The app's key can only send (Resend answers 401 to anything else), so the domain is read where Resend verifies it: its DNS records.
      if (res.status === 401 && /restricted to only send/i.test(await res.clone().text())) return sendingRecords(domain);
      if (!res.ok) throw new Down(`answered ${res.status}`);
      const body = (await res.json()) as { data?: Array<{ name?: string; status?: string }> };
      const found = body.data?.find((d) => d.name?.toLowerCase() === domain);
      if (!found) throw new Down("the sending domain is not on the account");
      if (found.status !== "verified") throw new Down(`the sending domain is ${found.status ?? "unverified"}`);
      return "the sending domain is verified";
    },
  },
  {
    name: "dynamic",
    core: false,
    limitMs: 6_000,
    slowMs: 2_500,
    every: HOURLY_MS,
    run: async () => {
      const env = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;
      const token = process.env.DYNAMIC_API_TOKEN;
      if (!env || !token) throw new Down("not set up");
      const res = await fetch(`https://app.dynamicauth.com/api/v0/environments/${env}/users?limit=1`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!res.ok) throw new Down(`answered ${res.status}`);
      return null;
    },
  },
  {
    name: "storage",
    core: false,
    limitMs: 8_000,
    slowMs: 3_000,
    every: HOURLY_MS,
    run: async () => {
      if (!storageConfigured()) throw new Down("not set up");
      // A known object of the check's own, never a person's photo: written once, then signed and read each hour.
      const url = await signedUrl(PROBE_KEY, 30).catch(async () => {
        await putObject(PROBE_KEY, PROBE_PNG, "image/png").catch(() => undefined);
        return signedUrl(PROBE_KEY, 30);
      });
      const res = await fetch(url, { cache: "no-store" });
      if (res.status !== 200) throw new Down(`a signed address answered ${res.status}`);
      if ((await res.arrayBuffer()).byteLength !== PROBE_PNG.byteLength) throw new Down("served something else");
      return null;
    },
  },
  {
    name: "scoreboard",
    core: false,
    limitMs: 10_000,
    slowMs: 4_000,
    every: HOURLY_MS,
    run: async ({ now }) => {
      const games = await espn.listGames("nfl", espnDay(now));
      return `${games.length} NFL games today parse`;
    },
  },
  {
    name: "second_source",
    core: false,
    limitMs: 10_000,
    slowMs: 4_000,
    every: HOURLY_MS,
    run: async ({ now }) => {
      const games = await checkGamesOn("nfl", now.toISOString().slice(0, 10));
      if (games === null) throw new Down("not set up");
      return `${games.length} NFL games today parse`;
    },
  },
  {
    name: "push",
    core: false,
    limitMs: 4_000,
    slowMs: 1_500,
    run: async ({ now }) => {
      const { sent, failed } = await pushFailures(now);
      const state = pushState(sent, failed);
      const note = sent === 0 ? "none sent in the last day" : `${failed} of ${sent} failed in the last day`;
      if (state === "down") throw new Down(note);
      if (state === "slow") throw new Slow(note);
      return note;
    },
  },
  {
    name: "numbers_image",
    core: false,
    limitMs: 20_000,
    slowMs: 8_000,
    every: HOURLY_MS,
    run: async () => {
      const png = await renderNumbersCard(await publicNumbers(), await loadTileFonts(), {}).arrayBuffer();
      if (png.byteLength < 1_000) throw new Down("drew nothing");
      return null;
    },
  },
  {
    name: "link_tile",
    core: false,
    limitMs: 20_000,
    slowMs: 8_000,
    every: HOURLY_MS,
    run: async () => {
      const png = await renderTile({ kind: "ask", asker: { name: "Sam", hue: "sky" }, frame: "What are the odds?", mark: null, markImage: null, ink: "olive", closes: "Closes Friday at 9pm", unit: null }, await loadTileFonts()).arrayBuffer();
      if (png.byteLength < 1_000) throw new Down("drew nothing");
      return null;
    },
  },
];

/** The storage check's own object: a one-pixel PNG, kept in the bucket under a key no person's photo can have. */
export const PROBE_KEY = "ops/health-probe.png";
export const PROBE_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

/** A check that answered but is degraded, said in a few plain words (the push check's failing share). */
export class Slow extends Error {
  constructor(public readonly words: string) {
    super(words);
    this.name = "Slow";
  }
}

/** Whether the tick's last run is recent enough. Pure. */
export function tickFresh(lastRun: Date, now: Date): boolean {
  return now.getTime() - lastRun.getTime() < TICK_FRESH_MS;
}

/** Whether a block's timestamp (seconds) is recent enough. Pure. */
export function blockFresh(timestamp: bigint, now: Date): boolean {
  return now.getTime() - Number(timestamp) * 1000 < BLOCK_FRESH_MS;
}

/** Whether the indexer's lag behind the chain's head is inside a minute. Pure. */
export function indexerCaughtUp(lagMs: number): boolean {
  return lagMs <= INDEXER_LAG_MS;
}

/** The pushes tried in the day before `now`, and how many did not go. */
export async function pushFailures(now: Date): Promise<{ sent: number; failed: number }> {
  const rows = (await db.execute(
    sql`select count(*)::int as sent, count(*) filter (where not ok)::int as failed from channel_sends where channel = 'push' and at > ${new Date(now.getTime() - 86_400_000).toISOString()}::timestamptz and at <= ${now.toISOString()}::timestamptz`,
  )) as unknown as Array<{ sent: number; failed: number }>;
  return { sent: Number(rows[0]?.sent ?? 0), failed: Number(rows[0]?.failed ?? 0) };
}

/** The push check: down past half failing, slow past a fifth, from five sends; fewer say nothing either way. Pure. */
export function pushState(sent: number, failed: number): CheckState {
  if (sent < 5) return "ok";
  if (failed * 2 > sent) return "down";
  if (failed * 5 > sent) return "slow";
  return "ok";
}

/** What a failed model call is, in a few words: the credit, the key, the API itself, or time. Pure. */
export function modelWords(err: unknown): string {
  const status = typeof err === "object" && err !== null && "status" in err ? Number((err as { status: unknown }).status) : 0;
  const message = err instanceof Error ? err.message : "";
  if (status === 402 || /credit balance is too low/i.test(message)) return "the credit balance is too low";
  if (status === 401 || status === 403) return "the key was refused";
  if (/timed? ?out|timeout/i.test(`${err instanceof Error ? err.name : ""} ${message}`)) return "took too long";
  if (status >= 500) return `answered ${status}`;
  if (status > 0) return `answered ${status}`;
  return /live model calls are off/.test(message) ? "off under the test runner" : "did not answer";
}

/** The scoreboard's day as it keys one (YYYYMMDD), in its own zone. */
function espnDay(now: Date): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}`;
}

/**
 * The records Resend verifies a sending domain by, read from DNS: its DKIM key (`resend._domainkey`) and the SPF record on
 * its `send.` subdomain. Both there, the domain is as Resend verified it; either gone, mail from it stops.
 */
async function sendingRecords(domain: string): Promise<string> {
  const txt = async (name: string) => (await resolveTxt(name).catch(() => [] as string[][])).map((parts) => parts.join(""));
  const [dkim, spf] = await Promise.all([txt(`resend._domainkey.${domain}`), txt(`send.${domain}`)]);
  if (!dkim.some((r) => r.includes("p="))) throw new Down("the sending domain's DKIM record is gone");
  if (!spf.some((r) => r.startsWith("v=spf1"))) throw new Down("the sending domain's SPF record is gone");
  return "the sending domain's records are in place";
}

/** The latest block the hosted indexer has processed, from its own metadata. */
async function indexerHead(): Promise<bigint> {
  const url = process.env.ENVIO_GRAPHQL_URL;
  if (!url) throw new Down("not set up");
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "query Head { chain_metadata { latest_processed_block } }" }), cache: "no-store" });
  if (res.status === 429) throw new Down("refused for rate");
  if (!res.ok) throw new Down(`answered ${res.status}`);
  const json = (await res.json()) as { data?: { chain_metadata?: Array<{ latest_processed_block?: number | string | null }> } };
  const n = json.data?.chain_metadata?.[0]?.latest_processed_block;
  if (n === undefined || n === null) throw new Down("answered without its metadata");
  return BigInt(n);
}

/** How one check went, within its own time. A check past its time is down; past its slow mark, slow. */
export async function runCheck(check: Check, ctx: Ctx): Promise<CheckResult> {
  const started = Date.now();
  const at = ctx.now.toISOString();
  try {
    const note = await within(check.limitMs, check.run(ctx));
    const ms = Date.now() - started;
    return { name: check.name, core: check.core, state: ms > check.slowMs ? "slow" : "ok", ms, note, at };
  } catch (err) {
    const ms = Date.now() - started;
    if (err instanceof Slow) return { name: check.name, core: check.core, state: "slow", ms, note: err.words, at };
    const note = err instanceof Down ? err.words : err instanceof Error && err.name === "TookTooLong" ? `no answer in ${check.limitMs / 1000}s` : "failed";
    return { name: check.name, core: check.core, state: "down", ms, note, at };
  }
}

/** Whether a kept answer of an hourly check can stand: under an hour old, and not down (a failure is asked again on the next run). Pure. */
export function stillStands(kept: { at: string; state: CheckState } | undefined, now: Date, every: number): boolean {
  return kept !== undefined && kept.state !== "down" && now.getTime() - new Date(kept.at).getTime() < every;
}

/** The answers the hourly checks gave last, from this environment's last run. */
async function lastAnswers(env: string): Promise<Map<CheckName, CheckResult>> {
  const rows = await db.select({ checks: schema.healthRuns.checks }).from(schema.healthRuns).where(eq(schema.healthRuns.env, env)).orderBy(desc(schema.healthRuns.at)).limit(1);
  const out = new Map<CheckName, CheckResult>();
  for (const c of (rows[0]?.checks as CheckResult[] | undefined) ?? []) out.set(c.name, c);
  return out;
}

/**
 * One run of every check: the core ones and the free ones now, the hourly ones only when their last answer is an hour
 * old. Kept in `health_runs` and looked at for the alerts; if the database itself is down, the answer still comes
 * back, unkept.
 */
export async function runHealth(source: "tick" | "request", now = new Date(), opts: RunOpts = {}): Promise<HealthRun> {
  const checks = opts.checks ?? CHECKS;
  const env = opts.env ?? hereEnv();
  // The chain's head, read once for the checks that compare with it; a node that does not answer is said so, never quoted.
  const head = (async () => {
    const b = await relayer().publicClient.getBlock();
    return { number: b.number, timestamp: b.timestamp };
  })().catch(() => {
    throw new Down("the node did not answer");
  });
  head.catch(() => undefined);
  const ctx: Ctx = { now, head };
  const kept = await within(READ_MS, lastAnswers(env)).catch(() => new Map<CheckName, CheckResult>());
  // In turns, the core first: fifteen checks at once over the pooler stalls the driver (`turns.ts`), and the keep below then waits forever.
  const results = await inTurns(
    checks.map((c) => () => (c.every && stillStands(kept.get(c.name), now, c.every) ? Promise.resolve(kept.get(c.name) as CheckResult) : runCheck(c, ctx))),
    TURN,
  );
  const run: HealthRun = { ok: results.every((r) => !r.core || r.state !== "down"), at: now.toISOString(), env, checks: results };
  try {
    await within(READ_MS, db.insert(schema.healthRuns).values({ at: now, source, env, coreOk: run.ok, checks: results }));
    if (watchesHere(env, opts.tell !== undefined)) await within(KEEP_MS, watchDown(run, now, opts.tell ?? tellOwner, opts.prefix));
  } catch (err) {
    console.warn("a health run could not be kept", { why: err instanceof Error ? err.message.split("\n")[0] : "unknown" });
  }
  return run;
}

/** Each core system down for ten minutes, told once, by email and push, until it is back. */
export async function watchDown(run: HealthRun, now: Date, tell: Teller, prefix = "health:"): Promise<string[]> {
  const due: Array<{ key: string; line: string }> = [];
  for (const c of run.checks.filter((x) => x.core)) {
    if (await observe(`${prefix}${c.name}`, c.state === "down", c.note ?? c.state, now, DOWN_TELLS_AFTER_MS)) due.push({ key: `${prefix}${c.name}`, line: `${c.name} has been down for ten minutes${c.note ? ` (${c.note})` : ""}` });
  }
  return tellDue(due, now, tell);
}

/** Whether the last run kept can answer a request now: under a minute old. Pure. */
export function shareable(lastAt: Date, now: Date): boolean {
  return now.getTime() - lastAt.getTime() < SHARE_MS;
}

/**
 * The answer for a request: this environment's last run if it is under a minute old, else a run now, with one runner
 * a minute (a claim in `ops_state`, one per environment); another request in the same minute gets the last run kept.
 * With the database down, a run now, unkept.
 */
export async function healthAnswer(now = new Date(), opts: RunOpts = {}): Promise<HealthRun> {
  const env = opts.env ?? hereEnv();
  let last: { at: Date; coreOk: boolean; checks: unknown } | undefined;
  try {
    [last] = await within(READ_MS, db.select({ at: schema.healthRuns.at, coreOk: schema.healthRuns.coreOk, checks: schema.healthRuns.checks }).from(schema.healthRuns).where(eq(schema.healthRuns.env, env)).orderBy(desc(schema.healthRuns.at)).limit(1));
  } catch {
    return runHealth("request", now, { ...opts, env });
  }
  if (last && shareable(last.at, now)) return { ok: last.coreOk, at: last.at.toISOString(), env, checks: last.checks as CheckResult[] };
  const claimed = await within(READ_MS, claimRun(now, env)).catch(() => true);
  if (!claimed && last) return { ok: last.coreOk, at: last.at.toISOString(), env, checks: last.checks as CheckResult[] };
  return runHealth("request", now, { ...opts, env });
}

/** One run a minute in each environment: true for the caller that took this minute's turn there. */
async function claimRun(now: Date, env: string): Promise<boolean> {
  const rows = (await db.execute(
    sql`insert into ops_state (key, at, value) values (${`health:claim:${env}`}, ${now.toISOString()}::timestamptz, '{}'::jsonb) on conflict (key) do update set at = excluded.at where ops_state.at < excluded.at - interval '60 seconds' returning key`,
  )) as unknown as Array<{ key: string }>;
  return rows.length > 0;
}
