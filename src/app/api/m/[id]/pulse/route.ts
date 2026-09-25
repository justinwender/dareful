import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth/session";
import { isMember } from "@/lib/ledger/groups";
import { marketById } from "@/lib/ledger/markets";
import { pulseFor } from "@/lib/ledger/pulse";

export const dynamic = "force-dynamic";

/**
 * The poll behind a market in voting (src/components/markets/vote-poll.tsx): a string that changes when the
 * screen would, read from Postgres only, for someone in the market's group. Anyone else, and any id that
 * matches nothing, gets a 404 and nothing about whether the market exists.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const me = await currentUser();
  if (!me || !z.string().uuid().safeParse(id).success) return new NextResponse(null, { status: 404 });
  const d = await marketById(id);
  if (!d || !(await isMember(d.groupId, me.id))) return new NextResponse(null, { status: 404 });
  const p = await pulseFor(id);
  if (!p) return new NextResponse(null, { status: 404 });
  return NextResponse.json(p, { headers: { "cache-control": "no-store" } });
}
