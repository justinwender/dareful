/**
 * The two channels the app sends on itself (PLANNING.md 8d). Web Push reaches installed apps, which on iOS is
 * the only way it reaches anything. Email reaches whoever logged in by email. Neither reaches everyone, which
 * is why the voter-relayed nudge and "Needs you" exist. Server-only; a channel that is not configured is off
 * and says so once, and a failure here never costs anyone their vote.
 */
import webpush from "web-push";
import { Resend } from "resend";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { isTestEmail } from "@/lib/auth/test-sign-in";
import { hereEnv } from "@/lib/ops/here";
import type { Notice } from "./messages";

let vapidReady: boolean | undefined;
function vapid(): boolean {
  if (vapidReady !== undefined) return vapidReady;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.warn("web push is off: NEXT_PUBLIC_VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY is not set");
    return (vapidReady = false);
  }
  webpush.setVapidDetails(process.env.NEXT_PUBLIC_APP_URL ?? "https://dareful.app", publicKey, privateKey);
  return (vapidReady = true);
}

/**
 * What a failed push says (the touch-ups round): the subscription is dead (the push service's 404 or 410, a 403 for a
 * key pair this server does not hold, a 400 for a token it will never take, or keys the library cannot encrypt to,
 * which it says before anything is sent and which carry no status at all), the send may go through a second time
 * (the network, or the service's 429 or 5xx), or neither. Pure.
 */
export function pushFailure(err: unknown): "dead" | "retry" | "failed" {
  const status = typeof err === "object" && err !== null && "statusCode" in err ? Number((err as { statusCode: unknown }).statusCode) : 0;
  if (status === 400 || status === 403 || status === 404 || status === 410) return "dead";
  if (status === 429 || status >= 500) return "retry";
  if (status !== 0) return "failed";
  const message = err instanceof Error ? err.message : "";
  if (/subscription (p256dh|auth)|user public key|user auth|subscription endpoint|at least an endpoint/i.test(message)) return "dead";
  return "retry";
}

/** How long a second try waits: long enough for a dropped connection, short enough for the request it rides in. */
export const PUSH_RETRY_MS = 600;

/**
 * Every email the app hands Resend and every push it tries, with whether it went (the ops round): what the email
 * quota's line counts, and what the push check's failure rate reads. Never who to or what. Never throws.
 */
export async function recordSend(channel: "email" | "push", kind: "notice" | "ops", ok: boolean, at: Date = new Date()): Promise<void> {
  try {
    await db.insert(schema.channelSends).values({ at, channel, kind, ok });
  } catch (err) {
    console.warn("a send could not be counted", { channel, why: err instanceof Error ? err.message.split("\n")[0] : "unknown" });
  }
}

/**
 * True if at least one of this person's browsers took it. A subscription that can never take one is deleted; a send
 * that failed on the way is tried once more, and only a second failure is logged, by its status alone.
 */
export async function sendPush(userId: string, notice: Notice, send: typeof webpush.sendNotification = (sub, payload, opts) => webpush.sendNotification(sub, payload, opts), kind: "notice" | "ops" = "notice"): Promise<boolean> {
  if (!vapid()) return false;
  const subs = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId));
  let delivered = false;
  for (const s of subs) {
    const once = () => send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(notice), { TTL: 60 * 60 * 12 });
    let went = false;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await once();
        delivered = true;
        went = true;
        break;
      } catch (err) {
        const what = pushFailure(err);
        if (what === "dead") {
          await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, s.id));
          break;
        }
        if (what === "retry" && attempt === 1) {
          await new Promise((r) => setTimeout(r, PUSH_RETRY_MS));
          continue;
        }
        const status = typeof err === "object" && err !== null && "statusCode" in err ? Number((err as { statusCode: unknown }).statusCode) : 0;
        console.error("push failed", { userId, status, tries: attempt });
        break;
      }
    }
    // One row a subscription tried, gone or not: the push check's share failing over a day (a dead subscription is a push that did not go).
    await recordSend("push", kind, went);
  }
  return delivered;
}

const Credential = z.object({ format: z.string().optional(), email: z.string().optional(), oauth_emails: z.array(z.string()).optional(), oauthEmails: z.array(z.string()).optional() }).passthrough();
const Emailed = z.object({ email: z.string().email().nullish(), verifiedCredentials: z.array(Credential).optional(), verified_credentials: z.array(Credential).optional() }).passthrough();
const DynamicUser = z.union([z.object({ user: Emailed }), Emailed]);

/**
 * The address a Dynamic user record gives: its email, else an email credential's, else the first address a linked
 * Google account carries (the first-contact round: a Google login may have no top-level email, and its notices went
 * nowhere). Pure, so the three shapes have a test. Never stored.
 */
export function emailOfDynamicUser(json: unknown): string | null {
  const parsed = DynamicUser.safeParse(json);
  if (!parsed.success) return null;
  const u: z.infer<typeof Emailed> = "user" in parsed.data && parsed.data.user ? (parsed.data.user as z.infer<typeof Emailed>) : (parsed.data as z.infer<typeof Emailed>);
  if (u.email) return u.email;
  const creds = u.verifiedCredentials ?? u.verified_credentials ?? [];
  const valid = (s: string | undefined) => (s && z.string().email().safeParse(s).success ? s : null);
  for (const c of creds) if (c.format === "email" && valid(c.email)) return c.email as string;
  for (const c of creds) for (const e of c.oauth_emails ?? c.oauthEmails ?? []) if (valid(e)) return e;
  return null;
}

/**
 * What reading an address from Dynamic found: the address, none on the account (a phone login, or a seed or test row
 * with no Dynamic record), or a failure with its cause (a status, a timeout, a shape it could not read), never an address.
 */
export type AddressRead = { address: string } | { none: true } | { failed: string };

/**
 * The address this person logs in with, read from Dynamic when it is needed and never stored: `users` has no
 * email column and does not gain one (docs/decisions.md 2026-09-19). A lookup that fails is logged as an error with its
 * cause and answered as a failure (pre-submission bug fixes 1): it was a quiet null, and a notice it cost went nowhere
 * with nothing kept to say why.
 */
export async function loginEmail(dynamicUserId: string, fetcher: typeof fetch = fetch): Promise<AddressRead> {
  if (dynamicUserId.includes(":")) return { none: true }; // seed and test users have no Dynamic record
  const env = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;
  const token = process.env.DYNAMIC_API_TOKEN;
  const failed = (cause: string): AddressRead => {
    console.error("reading a login email failed", { dynamicUserId, cause });
    return { failed: cause };
  };
  if (!env || !token) return failed(!env ? "NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID is not set" : "DYNAMIC_API_TOKEN is not set");
  let res: Response;
  try {
    res = await fetcher(`https://app.dynamicauth.com/api/v0/environments/${env}/users/${dynamicUserId}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) });
  } catch (err) {
    return failed(err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError") ? "Dynamic did not answer in 5 seconds" : `Dynamic could not be reached (${err instanceof Error ? err.name : "unknown"})`);
  }
  if (!res.ok) return failed(`Dynamic answered ${res.status}`);
  const json: unknown = await res.json().catch(() => undefined);
  if (json === undefined || !DynamicUser.safeParse(json).success) return failed("Dynamic's answer had a shape this cannot read");
  const address = emailOfDynamicUser(json);
  return address ? { address } : { none: true };
}

/**
 * Why an email meant for a notice did not go (pre-submission bug fixes 1), kept on its `notification_log` row:
 * see `email_skipped` there.
 */
export type EmailSkip = NonNullable<typeof schema.notificationLog.$inferInsert.emailSkipped>;

/** The skips the health check's email line counts: email failing, never a person with no inbox or a laptop with email off. */
export const COUNTED_SKIPS = ["off", "unread", "refused"] as const satisfies readonly EmailSkip[];

export type EmailSent = { went: true } | { went: false; skip: EmailSkip; cause?: string };

/** Whether email is set up here: the key and the sender. The names of the ones missing, if not. */
function emailSetUp(): { key: string; from: string } | { missing: string } {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (key && from) return { key, from };
  return { missing: [key ? null : "RESEND_API_KEY", from ? null : "EMAIL_FROM"].filter(Boolean).join(" and ") };
}

let warnedOps = false;
/**
 * A line to whoever runs the app, never to a person in it: the relayer's balance (src/lib/chain/watch.ts). Off,
 * and said once, when `OPS_EMAIL` or the email channel is not set. Nothing about any user goes through here.
 */
export async function sendOps(subject: string, text: string): Promise<boolean> {
  const set = emailSetUp();
  const to = process.env.OPS_EMAIL;
  if ("missing" in set || !to) {
    if (!warnedOps) console.warn("ops email is off: RESEND_API_KEY, EMAIL_FROM or OPS_EMAIL is not set");
    warnedOps = true;
    return false;
  }
  const { error } = await new Resend(set.key).emails.send({ from: set.from, to, subject, text });
  if (error) console.error("ops email failed", { name: error.name });
  await recordSend("email", "ops", !error);
  return !error;
}

/** The address a person's notices go to: their account's Dynamic record, read now. */
async function addressOf(userId: string): Promise<AddressRead> {
  const [user] = await db.select({ dynamicUserId: schema.users.dynamicUserId }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  return user ? loginEmail(user.dynamicUserId) : { none: true };
}

type EmailDeps = {
  /** Resend, unless a test stands in for it. */
  send?: (message: { from: string; to: string; subject: string; text: string }) => Promise<{ error: { name: string } | null }>;
  /** The address, unless a test stands in for the account and Dynamic. */
  read?: (userId: string) => Promise<AddressRead>;
  /** The quota's count, unless a test keeps its sends out of production's. */
  record?: typeof recordSend;
};

/**
 * A notice by email, and why not when it does not go. Never throws: a read that fails is `unread` and a send that throws
 * is `refused`, each with its cause and logged as an error; an account with no address, a test sign-in and a laptop
 * are skipped by design and say which.
 */
export async function sendEmail(userId: string, notice: Notice, deps: EmailDeps = {}): Promise<EmailSent> {
  const set = emailSetUp();
  if ("missing" in set) {
    // Anywhere but production email is off on purpose: `.env.local` has no sender, so a laptop never emails anyone.
    if (hereEnv() !== "production") return { went: false, skip: "not_production" };
    console.error("email is off in production", { missing: set.missing });
    return { went: false, skip: "off", cause: `${set.missing} not set` };
  }
  let read: AddressRead;
  try {
    read = await (deps.read ?? addressOf)(userId);
  } catch (err) {
    console.error("reading a login email failed", { userId, cause: err instanceof Error ? err.name : "unknown" });
    read = { failed: `the account could not be read (${err instanceof Error ? err.name : "unknown"})` };
  }
  if ("failed" in read) return { went: false, skip: "unread", cause: read.failed };
  if ("none" in read) return { went: false, skip: "no_address" };
  if (isTestEmail(read.address)) return { went: false, skip: "test_account" };
  // A backstop notice carries its own subject and footer (docs/design.md 4.10): the sentence, then the question, the sentence, "Open it" and the one line.
  const text = notice.email ? `${notice.title}\n\n${notice.body}\n\nOpen it: ${notice.url}\n\n${notice.email.footer}` : `${notice.body}\n\n${notice.url}\n\nYou're getting this because a friend did something in a question you're part of. Dareful never writes because time passed.`;
  let error: { name: string } | null;
  try {
    const message = { from: set.from, to: read.address, subject: notice.email?.subject ?? notice.title, text };
    ({ error } = await (deps.send ? deps.send(message) : new Resend(set.key).emails.send(message)));
  } catch (err) {
    error = { name: `unreachable: ${err instanceof Error ? err.name : "unknown"}` };
  }
  if (error) console.error("email failed", { userId, name: error.name });
  await (deps.record ?? recordSend)("email", "notice", !error);
  return error ? { went: false, skip: "refused", cause: `Resend said ${error.name}` } : { went: true };
}

/** One notice's missed email, by reason and cause, for the health line. */
export type EmailMiss = { skip: EmailSkip; cause: string | null; n: number };

/**
 * The emails meant for notices over the day to `now` that did not go for a reason the health check counts, by reason
 * and cause. Only notices to counted accounts: the suites, the canary and the owner's test accounts are left out of
 * counts, and the suites run against this database.
 */
export async function emailMisses(now: Date): Promise<EmailMiss[]> {
  const since = new Date(now.getTime() - 24 * 3_600_000);
  const L = schema.notificationLog;
  const rows = await db
    .select({ skip: L.emailSkipped, cause: L.emailSkipCause, n: sql<number>`count(*)::int` })
    .from(L)
    .innerJoin(schema.users, eq(schema.users.id, L.userId))
    .where(and(inArray(L.emailSkipped, [...COUNTED_SKIPS]), gte(L.createdAt, since), lte(L.createdAt, now), eq(schema.users.excludedFromCounts, false)))
    .groupBy(L.emailSkipped, L.emailSkipCause);
  return rows.filter((r): r is EmailMiss => r.skip !== null).map((r) => ({ skip: r.skip, cause: r.cause, n: Number(r.n) }));
}

const SKIP_WORDS: Record<(typeof COUNTED_SKIPS)[number], string> = { off: "email off", unread: "address unread", refused: "refused" };

/**
 * The health line's words for the day's misses, or null with none: the total, then each reason with its causes, the
 * commonest first. Pure.
 */
export function missesLine(misses: readonly EmailMiss[]): string | null {
  const counted = misses.filter((m) => (COUNTED_SKIPS as readonly string[]).includes(m.skip) && m.n > 0);
  const total = counted.reduce((sum, m) => sum + m.n, 0);
  if (total === 0) return null;
  const byReason = new Map<string, { n: number; causes: Map<string, number> }>();
  for (const m of counted) {
    const words = SKIP_WORDS[m.skip as (typeof COUNTED_SKIPS)[number]];
    const entry = byReason.get(words) ?? { n: 0, causes: new Map<string, number>() };
    entry.n += m.n;
    if (m.cause) entry.causes.set(m.cause, (entry.causes.get(m.cause) ?? 0) + m.n);
    byReason.set(words, entry);
  }
  const parts = [...byReason.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))
    .map(([words, e]) => {
      const causes = [...e.causes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c, n]) => (n === e.n ? c : `${c} ${n}`));
      return `${e.n} ${words}${causes.length ? ` (${causes.join("; ")})` : ""}`;
    });
  return `${total} ${total === 1 ? "notice" : "notices"} in the last day did not go by email: ${parts.join(", ")}`;
}
