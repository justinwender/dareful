import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { notifyAfterVote, notifyBackstopResult, notifyBackstopWarning, notifyDeadline } from "@/lib/notify";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { tick } from "@/lib/ledger/settle";
import { sportsTick } from "@/lib/sports";
import { balldontlie } from "@/lib/sports/balldontlie";
import { reconcileChainWrites } from "@/lib/chain/reconcile";
import { watchRelayer } from "@/lib/chain/watch";
import { completions } from "@/lib/ledger/completions";
import { keepWarm } from "@/lib/ops/warm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  const report = await tick(now, notifyDeadline, { notifyWarning: (id, flavour, actsAt) => notifyBackstopWarning(id, flavour, actsAt, now), check: balldontlie });
  // The tiebreaker's backstop and the void rule's end are backstops acting: the one notice after, in place of the result notice.
  await Promise.all([...report.arbitrated, ...report.expired].map((id) => notifyBackstopResult(id)));
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
  // The relayer's gas, read after the jobs so the read never delays a send; unread is reported, never thrown.
  const relayer = await watchRelayer(now).catch((err: unknown) => {
    console.error("tick: the relayer's balance could not be read", err instanceof Error ? err.message : err);
    return null;
  });
  return NextResponse.json({ locked: report.locked.length, resolved: report.resolved.length, notified: report.notified.length, expired: report.expired.length, arbitrated: report.arbitrated.length, warned: report.warned.length, failed: report.failed.length, feed: { synced: sports.synced, polled: sports.polled.length, drives: sports.drives.length, proposed: sports.proposed.length, settled: sports.settled.length, voided: sports.voided.length, failed: sports.failed.length }, writes: writes ? { mined: writes.mined.length, completed: writes.completed.length, reverted: writes.reverted.length, dropped: writes.dropped.length, rebroadcast: writes.rebroadcast.length } : null, relayer, warmed: await warming });
}
