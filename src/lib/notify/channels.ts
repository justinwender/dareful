/**
 * The two channels the app sends on itself (PLANNING.md 8d). Web Push reaches installed apps, which on iOS is
 * the only way it reaches anything. Email reaches whoever logged in by email. Neither reaches everyone, which
 * is why the voter-relayed nudge and "Needs you" exist. Server-only; a channel that is not configured is off
 * and says so once, and a failure here never costs anyone their vote.
 */
import webpush from "web-push";
import { Resend } from "resend";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
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

/** True if at least one of this person's browsers took it. A subscription the push service says is gone is deleted. */
export async function sendPush(userId: string, notice: Notice): Promise<boolean> {
  if (!vapid()) return false;
  const subs = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId));
  let delivered = false;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(notice), { TTL: 60 * 60 * 12 });
      delivered = true;
    } catch (err) {
      const status = typeof err === "object" && err !== null && "statusCode" in err ? Number((err as { statusCode: unknown }).statusCode) : 0;
      if (status === 404 || status === 410) await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, s.id));
      else console.error("push failed", { userId, status });
    }
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
 * The address this person logs in with, read from Dynamic when it is needed and never stored: `users` has no
 * email column and does not gain one (docs/decisions.md 2026-09-19). Null for a phone login.
 */
async function loginEmail(dynamicUserId: string): Promise<string | null> {
  const env = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;
  const token = process.env.DYNAMIC_API_TOKEN;
  if (!env || !token || dynamicUserId.includes(":")) return null; // seed and test users have no Dynamic record
  const res = await fetch(`https://app.dynamicauth.com/api/v0/environments/${env}/users/${dynamicUserId}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) });
  if (!res.ok) return null;
  return emailOfDynamicUser(await res.json());
}

let warnedOps = false;
/**
 * A line to whoever runs the app, never to a person in it: the relayer's balance (src/lib/chain/watch.ts). Off,
 * and said once, when `OPS_EMAIL` or the email channel is not set. Nothing about any user goes through here.
 */
export async function sendOps(subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const to = process.env.OPS_EMAIL;
  if (!key || !from || !to) {
    if (!warnedOps) console.warn("ops email is off: RESEND_API_KEY, EMAIL_FROM or OPS_EMAIL is not set");
    warnedOps = true;
    return false;
  }
  const { error } = await new Resend(key).emails.send({ from, to, subject, text });
  if (error) console.error("ops email failed", { name: error.name });
  return !error;
}

let warnedEmail = false;
export async function sendEmail(userId: string, notice: Notice): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    if (!warnedEmail) console.warn("email is off: RESEND_API_KEY or EMAIL_FROM is not set");
    warnedEmail = true;
    return false;
  }
  const [user] = await db.select({ dynamicUserId: schema.users.dynamicUserId }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  const to = user ? await loginEmail(user.dynamicUserId) : null;
  if (!to) return false;
  // A backstop notice carries its own subject and footer (docs/design.md 4.10): the sentence, then the question, the sentence, "Open it" and the one line.
  const text = notice.email ? `${notice.title}\n\n${notice.body}\n\nOpen it: ${notice.url}\n\n${notice.email.footer}` : `${notice.body}\n\n${notice.url}\n\nYou're getting this because a friend did something in a question you're part of. Dareful never writes because time passed.`;
  const { error } = await new Resend(key).emails.send({ from, to, subject: notice.email?.subject ?? notice.title, text });
  if (error) console.error("email failed", { userId, name: error.name });
  return !error;
}
