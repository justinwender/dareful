import { NextResponse } from "next/server";
import { z } from "zod";
import { readClaimTokens } from "@/lib/auth/claim-cookie";
import { currentUser } from "@/lib/auth/session";
import { claimsForBrowserTokens } from "@/lib/ledger/claims";
import { EVENTS, isClientEvent, isCrawler } from "@/lib/usage/events";
import { deviceId, record } from "@/lib/usage";

const Body = z.object({ name: z.string().max(40), props: z.record(z.string(), z.unknown()).default({}), dareId: z.string().uuid().optional(), gameId: z.string().uuid().optional() });

/**
 * The browser's one door for usage events (the field round, 2026-10-02): a name from the client's allowlist, its
 * properties by that name's schema, and who from the cookies (the session, else the guest's claim, and the
 * device's own id either way). A link-preview fetcher never counts: it runs no script, and its user agent is
 * refused here as a second belt. Anything else answers 204 and leaves no row, never an error a page could show.
 */
export async function POST(req: Request): Promise<Response> {
  if (isCrawler(req.headers.get("user-agent"))) return new NextResponse(null, { status: 204 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isClientEvent(parsed.data.name)) return new NextResponse(null, { status: 204 });
  const name = parsed.data.name;
  const props = EVENTS[name].safeParse(parsed.data.props);
  if (!props.success) return new NextResponse(null, { status: 204 });
  const me = await currentUser();
  const claim = me ? null : ((await claimsForBrowserTokens(await readClaimTokens()))[0] ?? null);
  const device = await deviceId();
  await record(name, props.data, { userId: me?.id ?? null, claimId: claim?.id ?? null, deviceId: device }, { dareId: parsed.data.dareId ?? null, gameId: parsed.data.gameId ?? null });
  return new NextResponse(null, { status: 204 });
}
