/**
 * Telling the owner (the ops round, sections 1 and 5). An alert is a condition with a name (a runway line crossed, a core
 * system down) and a row in `ops_alerts`: when it began, and when the owner was told. It is told once, by email and a
 * push to the owner's phone, as soon as it has held for its delay (none for a line, ten minutes for a system), and told
 * again only after it has cleared and begun again. These go to the owner alone (`OWNER_USER_IDS`, `OPS_EMAIL`): they are
 * the operator's, not notifications about a person, never in `notification_log`, and never counted.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendOps, sendPush } from "@/lib/notify/channels";
import { ownerIds } from "@/lib/usage/owner";

export type AlertRow = { since: Date | null; toldAt: Date | null };

/**
 * One look at a condition. Active and new, it begins now; active long enough and not yet told, it is due; no longer
 * active, it clears, so the next time it begins it is told again. Pure.
 */
export function alertStep(prev: AlertRow | null, active: boolean, now: Date, delayMs: number): { next: AlertRow; due: boolean; cleared: boolean } {
  const since = prev?.since ?? null;
  const toldAt = prev?.toldAt ?? null;
  if (!active) return since === null ? { next: { since: null, toldAt: null }, due: false, cleared: false } : { next: { since: null, toldAt: null }, due: false, cleared: true };
  const began = since ?? now;
  return { next: { since: began, toldAt }, due: toldAt === null && now.getTime() - began.getTime() >= delayMs, cleared: false };
}

/** Looks at one condition and writes what changed; answers whether the owner is due to be told of it now. */
export async function observe(key: string, active: boolean, reading: string, now: Date, delayMs: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.insert(schema.opsAlerts).values({ key }).onConflictDoNothing({ target: schema.opsAlerts.key });
    const [row] = await tx.select().from(schema.opsAlerts).where(eq(schema.opsAlerts.key, key)).for("update");
    const step = alertStep(row ? { since: row.since, toldAt: row.toldAt } : null, active, now, delayMs);
    await tx
      .update(schema.opsAlerts)
      .set({ since: step.next.since, toldAt: step.next.toldAt, reading: reading.slice(0, 200), ...(step.cleared ? { clearedAt: now } : {}) })
      .where(eq(schema.opsAlerts.key, key));
    return step.due;
  });
}

/** Marks these told, once: a second run racing this one marks nothing it has not told. */
export async function markTold(keys: readonly string[], now: Date): Promise<void> {
  if (keys.length === 0) return;
  await db.update(schema.opsAlerts).set({ toldAt: now }).where(and(inArray(schema.opsAlerts.key, [...keys]), isNull(schema.opsAlerts.toldAt)));
}

export type Teller = (subject: string, text: string, push: { title: string; body: string }) => Promise<boolean>;

/** A teller from its two channels and the owner's accounts: one email, and a push to every phone each account has subscribed; true if either went. */
export function tellerOf(channels: { email: (subject: string, text: string) => Promise<boolean>; push: (userId: string, notice: { title: string; body: string; url: string }) => Promise<boolean>; owners: () => Iterable<string> }): Teller {
  return async (subject, text, push) => {
    const emailed = await channels.email(subject, text).catch(() => false);
    let pushed = false;
    for (const id of channels.owners()) pushed = (await channels.push(id, { title: push.title, body: push.body, url: "/stats" }).catch(() => false)) || pushed;
    return emailed || pushed;
  };
}

/** The owner, by `OPS_EMAIL` and by a push to every phone on the accounts `OWNER_USER_IDS` names. */
export const tellOwner: Teller = tellerOf({ email: sendOps, push: (id, notice) => sendPush(id, notice, undefined, "ops"), owners: () => ownerIds() });

/**
 * Tells the owner of everything due in one email and one push (one line each), and marks them told if either went;
 * if neither did, they stay due and the next run tries again.
 */
export async function tellDue(due: ReadonlyArray<{ key: string; line: string }>, now: Date, tell: Teller = tellOwner): Promise<string[]> {
  if (due.length === 0) return [];
  const subject = due.length === 1 ? (due[0] as { line: string }).line : `${(due[0] as { line: string }).line}, and ${due.length - 1} more`;
  const text = `${due.map((d) => `- ${d.line}`).join("\n")}\n\nEvery level is on dareful.app/stats, and in tomorrow's morning email. This is told once; it is told again only after it recovers and crosses again.`;
  const went = await tell(`Dareful: ${subject}`, text, { title: "Dareful", body: subject });
  if (!went) return [];
  await markTold(
    due.map((d) => d.key),
    now,
  );
  return due.map((d) => d.key);
}
