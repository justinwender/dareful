import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { notifyAfterVote, notifyBackstopResult, notifyBackstopWarning, notifyDeadline, notifyVotingOpened, notifyVoteReminder } from "@/lib/notify";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { tick } from "@/lib/ledger/settle";
import { sportsTick } from "@/lib/sports";
import { balldontlie } from "@/lib/sports/balldontlie";
import { reconcileChainWrites } from "@/lib/chain/reconcile";
import { hourly, watchRelayer } from "@/lib/chain/watch";
import { forgetOldFailures, tellFailures } from "@/lib/chain/failures";
import { sendOps } from "@/lib/notify/channels";
import { completions } from "@/lib/ledger/completions";
import { keepWarm } from "@/lib/ops/warm";
import { beat, opsTick } from "@/lib/ops/tick";

export const dynamic = "force-dynamic";
// The ledger's jobs and, every five minutes, the operations jobs after them (an hourly check may take twenty seconds).
export const maxDuration = 120;

/**
 * The scheduler's one door (docs/decisions.md 2026-09-21). The database calls this once a minute (pg_cron and
 * pg_net) with a shared secret, and it does everything a timer has to do: lock a question whose time has come,
 * tell its asker, expire what was set to go unsettled, hear a deadlock nobody pressed on for a day, and send the
 * one warning before any backstop acts and the one notice after (docs/design.md 4.10), which stands in for the
 * ordinary result notice.
 *
 * Idempotent and safe to call twice, late, or not at all: every job is also reachable by a person, so a missed
 * tick delays and never breaks. The secret compares in constant time, and a wrong one learns nothing, including
 * whether the route exists.
 */
export async function POST(req: Request): Promise<Response> {
  const secret = process.env.TICK_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const ok = Boolean(secret) && secret !== undefined && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return new NextResponse(null, { status: 404 });
  const now = new Date();
  // Now's own door, knocked on beside the jobs and never waited for ahead of them (src/lib/ops/warm.ts).
  const warming = keepWarm();
  const report = await tick(now, notifyDeadline, {
    // The two voting notices (the field round, 1.8): the tick holds each claim, so the senders skip their own.
    notifyVoting: { opened: (id, causedBy, how, actorName) => notifyVotingOpened(id, causedBy, how, { claimed: true, ...(actorName ? { actorName } : {}) }), remind: (id) => notifyVoteReminder(id, now) },
    notifyWarning: (id, flavour, actsAt) => notifyBackstopWarning(id, flavour, actsAt, now),
    check: balldontlie,
  });
  // The tiebreaker's backstop and the void rule's end are backstops acting: the one notice after, in place of the result notice.
  await Promise.all([...report.arbitrated, ...report.expired, ...report.stood].map((id) => notifyBackstopResult(id)));
  // A resolution the tick landed from votes already signed: the result notice goes out as the last vote's, since that vote is what decided it.
  await Promise.all(
    report.resolved.map(async (id) => {
      const [last] = await db.select({ userId: schema.dareVotes.userId }).from(schema.dareVotes).where(eq(schema.dareVotes.dareId, id)).orderBy(desc(schema.dareVotes.signedAt)).limit(1);
      if (last) await notifyAfterVote(id, last.userId);
    }),
  );
  if (report.failed.length > 0) console.error("tick: some jobs failed", report.failed);
  // What's on (src/lib/sports): the schedule, the finals, the first drives, the feed's proposals, and the backstop's endings.
  const sports = await sportsTick(now);
  await Promise.all([...sports.settled, ...sports.voided].map((id) => notifyBackstopResult(id)));
  if (sports.failed.length > 0) console.error("tick: some feed jobs failed", sports.failed);
  // A send is never lost: writes whose receipt outlived their request are read, finished or dropped here.
  const writes = await reconcileChainWrites(now, { complete: completions }).catch((err: unknown) => {
    console.error("tick: chain writes could not be reconciled", err instanceof Error ? err.message : err);
    return null;
  });
  // The relayer's gas, read after the jobs so the read never delays a send; unread is reported, never thrown. The owner
  // is told by the runway's lines (src/lib/ops/runway.ts), into which the hourly email is folded.
  const relayer = await watchRelayer().catch((err: unknown) => {
    console.error("tick: the relayer's balance could not be read", err instanceof Error ? err.message : err);
    return null;
  });
  // A chain write failing for more than fifteen minutes reaches the owner, whatever the cause (the touch-ups round, section 0);
  // a write nobody has tried for a week is forgotten, so the list stays the writes that are failing.
  const failing = await tellFailures(now, sendOps).catch((err: unknown) => {
    console.error("tick: failing chain writes could not be told", err instanceof Error ? err.message : err);
    return 0;
  });
  if (hourly(now)) await forgetOldFailures(now).catch(() => undefined);
  // The operations jobs (the ops round): health and the runway every five minutes, the morning email from 8am Eastern,
  // after the ledger's jobs and never beside them, since the database's pooler stalls on a deep queue; none can fail it.
  const ops = await opsTick(now);
  const summary = { locked: report.locked.length, resolved: report.resolved.length, failed: report.failed.length + sports.failed.length, relayer: relayer?.mon ?? null, health: ops.health, told: ops.told.length, morning: ops.morning };
  // The run, recorded once it is done: the health check's word that the scheduler is alive (a tick that dies midway records nothing).
  await beat(now, summary).catch((err: unknown) => console.error("tick: the run could not be recorded", err instanceof Error ? err.message.split("\n")[0] : err));
  return NextResponse.json({ locked: report.locked.length, resolved: report.resolved.length, notified: report.notified.length, expired: report.expired.length, arbitrated: report.arbitrated.length, warned: report.warned.length, failed: report.failed.length, feed: { synced: sports.synced, polled: sports.polled.length, drives: sports.drives.length, proposed: sports.proposed.length, settled: sports.settled.length, voided: sports.voided.length, failed: sports.failed.length }, writes: writes ? { mined: writes.mined.length, completed: writes.completed.length, reverted: writes.reverted.length, dropped: writes.dropped.length, rebroadcast: writes.rebroadcast.length } : null, relayer, failing, ops, warmed: await warming });
}
