import { NextResponse } from "next/server";
import { liveScoreFor } from "@/lib/sports/live";

export const dynamic = "force-dynamic";

/**
 * One game's live score (the games-and-the-reveal round, section 3): the feed is read at most once per interval for a
 * game however many are watching (`liveScoreFor` claims the read on the game's row), and the answer is nothing when
 * it cannot be read, never a stale score. A public game's score is the same for everyone, so it asks for no session,
 * and the edge may hold it for a few seconds.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ live: null }, { status: 404 });
  const live = await liveScoreFor(id).catch(() => null);
  return NextResponse.json({ live }, { headers: { "cache-control": "public, max-age=0, s-maxage=10" } });
}
