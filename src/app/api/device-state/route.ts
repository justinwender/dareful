import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { currentUser } from "@/lib/auth/session";
import { platformOf } from "@/lib/auth/device";

const Body = z.object({ state: z.enum(["signed-out", "other-account", "keys-missing"]), standalone: z.boolean() });

/**
 * What a signed-in person's device could not do, said once per page load, and kept. The database shows both keys
 * recorded for every account and cannot show that a particular phone has neither in reach, which is how two of
 * four accounts sat stuck for hours with nothing anywhere saying so. It was a log line first; the host discards
 * those within the hour, and a recurring sign-out needs evidence that outlives that (docs/decisions.md 2026-09-20).
 * The platform is reduced to one of four words here; the user agent string is never stored.
 */
export async function POST(req: Request): Promise<Response> {
  const me = await currentUser();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!me || !parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  await db.insert(schema.deviceStates).values({ userId: me.id, state: parsed.data.state, standalone: parsed.data.standalone, platform: platformOf(req.headers.get("user-agent")) });
  return NextResponse.json({ ok: true });
}
