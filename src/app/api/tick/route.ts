import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { notifyBackstopResult, notifyBackstopWarning, notifyDeadline } from "@/lib/notify";
import { tick } from "@/lib/ledger/settle";
import { sportsTick } from "@/lib/sports";
import { balldontlie } from "@/lib/sports/balldontlie";
import { watchRelayer } from "@/lib/chain/watch";

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
  const report = await tick(now, notifyDeadline, { notifyWarning: (id, flavour, actsAt) => notifyBackstopWarning(id, flavour, actsAt, now), check: balldontlie });
  // The tiebreaker's backstop and the void rule's end are backstops acting: the one notice after, in place of the result notice.
  await Promise.all([...report.arbitrated, ...report.expired].map((id) => notifyBackstopResult(id)));
  if (report.failed.length > 0) console.error("tick: some jobs failed", report.failed);
  // What's on (src/lib/sports): the schedule, the finals, the first drives, the feed's proposals, and the backstop's endings.
  const sports = await sportsTick(now);
  await Promise.all([...sports.settled, ...sports.voided].map((id) => notifyBackstopResult(id)));
  if (sports.failed.length > 0) console.error("tick: some feed jobs failed", sports.failed);
  // The relayer's gas, read after the jobs so the read never delays a send; unread is reported, never thrown.
  const relayer = await watchRelayer(now).catch((err: unknown) => {
    console.error("tick: the relayer's balance could not be read", err instanceof Error ? err.message : err);
    return null;
  });
  return NextResponse.json({ locked: report.locked.length, notified: report.notified.length, expired: report.expired.length, arbitrated: report.arbitrated.length, warned: report.warned.length, failed: report.failed.length, feed: { synced: sports.synced, polled: sports.polled.length, drives: sports.drives.length, proposed: sports.proposed.length, settled: sports.settled.length, voided: sports.voided.length, failed: sports.failed.length }, relayer });
}
