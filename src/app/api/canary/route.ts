import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { canaryOff, runCanary } from "@/lib/ops/canary";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The canary's own door (the ops round, section 4): called every six hours by the database's scheduler with the tick's
 * secret, as a job of its own and never inside the minute tick's time. Off, and saying so, until `CANARY_MNEMONIC` is
 * set. A wrong secret learns nothing, including whether the route exists.
 */
export async function POST(req: Request): Promise<Response> {
  const secret = process.env.TICK_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const ok = Boolean(secret) && secret !== undefined && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return new NextResponse(null, { status: 404 });
  const off = canaryOff();
  if (off) return NextResponse.json({ off });
  const run = await runCanary({ mnemonic: process.env.CANARY_MNEMONIC as string });
  return NextResponse.json({ ok: run.ok, step: run.step, error: run.error, txs: run.txs, steps: run.steps });
}
