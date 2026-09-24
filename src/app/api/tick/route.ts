import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { notifyDeadline, notifyRuling } from "@/lib/notify";
import { tick } from "@/lib/ledger/settle";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The scheduler's one door (docs/decisions.md 2026-09-21). The database calls this once a minute (pg_cron and
 * pg_net) with a shared secret, and it does everything a timer has to do: lock a question whose time has come,
 * tell its asker, expire what was set to go unsettled, and hear a deadlock nobody pressed on for a day.
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
  const report = await tick(new Date(), notifyDeadline);
  await Promise.all(report.arbitrated.map((id) => notifyRuling(id, null)));
  if (report.failed.length > 0) console.error("tick: some jobs failed", report.failed);
  return NextResponse.json({ locked: report.locked.length, notified: report.notified.length, expired: report.expired.length, arbitrated: report.arbitrated.length, failed: report.failed.length });
}
