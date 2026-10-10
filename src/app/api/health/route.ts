import { NextResponse } from "next/server";
import { healthAnswer } from "@/lib/ops/health";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Production's health (the ops round, section 2), for the workflow that watches from outside and for anyone who asks:
 * each system as ok, slow or down, with a few plain words and nothing secret, 200 while every core system is up and 503
 * otherwise. One run a minute however often it is asked (`healthAnswer`), and the platform's edge keeps the answer that
 * minute too, so the checks behind it are never asked faster than that. It says whose run it is (`env`), so the outside
 * check can tell production's own answer from one kept by anywhere else.
 */
export async function GET(): Promise<Response> {
  const run = await healthAnswer();
  return NextResponse.json(
    { ok: run.ok, at: run.at, env: run.env, checks: run.checks.map((c) => ({ name: c.name, core: c.core, state: c.state, ms: c.ms, note: c.note, at: c.at })) },
    { status: run.ok ? 200 : 503, headers: { "cache-control": "no-cache, max-age=0, must-revalidate", "vercel-cdn-cache-control": "max-age=60" } },
  );
}
