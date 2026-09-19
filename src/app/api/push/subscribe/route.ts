import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { currentUser } from "@/lib/auth/session";

/** Only real push services. An endpoint is a URL this server will later POST to, so it is never an arbitrary one. */
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /\.google\.com$/, /\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
const Body = z.object({
  endpoint: z
    .string()
    .url()
    .max(1000)
    .refine((u) => {
      try {
        const url = new URL(u);
        return url.protocol === "https:" && PUSH_HOSTS.some((h) => h.test(url.hostname));
      } catch {
        return false;
      }
    }),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

export async function POST(req: Request): Promise<Response> {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "not a push subscription" }, { status: 400 });
  const { endpoint, keys } = parsed.data;
  // A browser belongs to whoever is signed in on it now: a shared phone moves with the session.
  await db
    .insert(schema.pushSubscriptions)
    .values({ userId: me.id, endpoint, p256dh: keys.p256dh, auth: keys.auth })
    .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: { userId: me.id, p256dh: keys.p256dh, auth: keys.auth } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request): Promise<Response> {
  const me = await currentUser();
  const parsed = z.object({ endpoint: z.string().url().max(1000) }).safeParse(await req.json().catch(() => null));
  if (!me || !parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  await db.delete(schema.pushSubscriptions).where(and(eq(schema.pushSubscriptions.endpoint, parsed.data.endpoint), eq(schema.pushSubscriptions.userId, me.id)));
  return NextResponse.json({ ok: true });
}
