/**
 * Accounts the app cannot reach (the first-contact round, 2026-10-04): no push subscription on any device and no
 * email to fall back on, so a vote, a nudge or a settlement reaches them only when they open the app. One card,
 * once, offers to add an email or link Google. The server knows the push half and whether the card was shown; only
 * the device holding the login knows the credentials, so the card decides the rest there (`reachableBy`).
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/** Whether this account is still owed the card: never shown it, and no device of theirs takes a push. */
export async function owesReachCard(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.id, userId), isNull(schema.users.reachCardAt), sql`not exists (select 1 from push_subscriptions p where p.user_id = ${schema.users.id})`))
    .limit(1);
  return row !== undefined;
}

/** The card was shown: it never comes back. */
export async function markReachCardShown(userId: string, now: Date): Promise<void> {
  await db.update(schema.users).set({ reachCardAt: now }).where(and(eq(schema.users.id, userId), isNull(schema.users.reachCardAt)));
}
