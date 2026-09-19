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

const Emailed = z.object({ email: z.string().email().nullish() });
const DynamicUser = z.union([z.object({ user: Emailed }), Emailed]);

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
  const parsed = DynamicUser.safeParse(await res.json());
  if (!parsed.success) return null;
  return ("user" in parsed.data ? parsed.data.user.email : parsed.data.email) ?? null;
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
  const { error } = await new Resend(key).emails.send({ from, to, subject: notice.title, text: `${notice.body}\n\n${notice.url}\n\nYou're getting this because a friend did something in a question you're part of. Dareful never writes because time passed.` });
  if (error) console.error("email failed", { userId, name: error.name });
  return !error;
}
