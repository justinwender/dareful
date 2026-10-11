/**
 * A line to the owner that no channel carried, kept until one does (pre-submission bug fixes 1). Email was off in
 * production from the start (`EMAIL_FROM` was never set), and the lines sent once and forgotten (a canary step that
 * failed, a send dropped or reverted after a person was told it was on its way, a governance wallet offered for
 * delegation, the morning email) went nowhere with nothing kept. Each now goes through `tellOrKeep`: one that does not
 * go is kept in `ops_state` under `untold:` and sent again by the tick until it goes, three days at most. The alerts and
 * the failing chain writes need none of this: they count as told only once a channel carried them, and stay due until
 * then (src/lib/ops/alerts.ts, src/lib/chain/failures.ts).
 */
import { randomUUID } from "node:crypto";
import { asc, eq, like } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendOps } from "@/lib/notify/channels";

/** Production's kept lines; a test keeps its own under a prefix of its own, which the tick never reads. */
export const UNTOLD_PREFIX = "untold:";

/** A kept line older than this is let go: by then the morning email and /stats have said it. */
export const UNTOLD_KEEP_MS = 3 * 86_400_000;

/** How many kept lines one tick sends at most, oldest first. */
export const UNTOLD_PER_RUN = 5;

type Send = (subject: string, text: string) => Promise<boolean>;

/** The line as sent late: its own text, after a sentence saying when it could not be sent. Pure. */
export function lateText(text: string, keptAt: Date): string {
  return `This could not be sent at ${keptAt.toISOString().slice(11, 16)} UTC on ${keptAt.toISOString().slice(0, 10)}, when it happened, and is sent now that email goes.\n\n${text}`;
}

/** Keeps a line for the tick to send. Never throws: a line that cannot be kept is an error in the log. */
export async function keepUntold(subject: string, text: string, now = new Date(), prefix = UNTOLD_PREFIX): Promise<void> {
  try {
    await db.insert(schema.opsState).values({ key: `${prefix}${randomUUID()}`, at: now, value: { subject: subject.slice(0, 200), text: text.slice(0, 8_000) } });
  } catch (err) {
    console.error("a line to the owner could not be kept", { subject, why: err instanceof Error ? err.message.split("\n")[0] : "unknown" });
  }
}

/**
 * Sends a line to the owner by email, and keeps it for the tick when no channel carried it. True if it went now. A
 * sender of a test's own keeps nothing unless the test names a prefix of its own.
 */
export async function tellOrKeep(subject: string, text: string, now = new Date(), send: Send = sendOps, prefix: string | null = send === sendOps ? UNTOLD_PREFIX : null): Promise<boolean> {
  const went = await send(subject, text).catch(() => false);
  if (!went && prefix !== null) await keepUntold(subject, text, now, prefix);
  return went;
}

/**
 * The tick's part: the kept lines, oldest first, each taken before it is sent (so two ticks never send one twice) and
 * kept again if it still does not go, which also stops the run: email is still off. Answers how many went.
 */
export async function tellKept(now: Date, send: Send = sendOps, prefix = UNTOLD_PREFIX): Promise<number> {
  const S = schema.opsState;
  const rows = await db.select({ key: S.key }).from(S).where(like(S.key, `${prefix}%`)).orderBy(asc(S.at)).limit(UNTOLD_PER_RUN);
  let sent = 0;
  for (const { key } of rows) {
    const [taken] = await db.delete(S).where(eq(S.key, key)).returning();
    if (!taken) continue;
    const value = taken.value as { subject?: unknown; text?: unknown };
    if (now.getTime() - taken.at.getTime() > UNTOLD_KEEP_MS || typeof value.subject !== "string" || typeof value.text !== "string") continue;
    const went = await send(value.subject, lateText(value.text, taken.at)).catch(() => false);
    if (!went) {
      await db.insert(S).values({ key, at: taken.at, value: taken.value }).onConflictDoNothing({ target: S.key });
      break;
    }
    sent += 1;
  }
  return sent;
}
