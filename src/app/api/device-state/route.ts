import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth/session";

const Body = z.object({ state: z.enum(["signed-out", "other-account", "keys-missing"]), standalone: z.boolean() });

/**
 * What a signed-in person's device could not do, said once per page load. The database shows both keys
 * recorded for every account and cannot show that a particular phone has neither in reach, which is how two of
 * four accounts sat stuck for hours with nothing anywhere saying so (docs/decisions.md 2026-09-19). A log line,
 * and nothing about the person beyond their id.
 */
export async function POST(req: Request): Promise<Response> {
  const me = await currentUser();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!me || !parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  console.warn("device cannot approve", { userId: me.id, ...parsed.data, agent: req.headers.get("user-agent")?.slice(0, 120) });
  return NextResponse.json({ ok: true });
}
