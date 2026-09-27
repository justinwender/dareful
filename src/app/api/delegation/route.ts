import { NextResponse } from "next/server";
import { receiveDelegationEvent } from "@/lib/chain/delegated-signer";

export const dynamic = "force-dynamic";

/**
 * Dynamic's delegated-access webhook (docs/decisions.md 2026-09-27): `wallet.delegation.created` with the
 * share and the per-wallet key in encrypted envelopes, and `wallet.delegation.revoked`. The body is read as
 * bytes and the signature checked over those bytes; everything after that is `receiveDelegationEvent`. A
 * non-2xx answer makes Dynamic retry, so a bad signature says 401 (the console shows it), an event about
 * nobody we know says 422, and anything handled, duplicated, refused or ignored says 200. Nothing here logs
 * the body.
 */
export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();
  const r = await receiveDelegationEvent(raw, req.headers.get("x-dynamic-signature-256"));
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: r.status });
  return NextResponse.json({ ok: true, kind: r.kind });
}

/** The console's reachability check may be a plain request; the door exists. */
export function GET(): Response {
  return new NextResponse(null, { status: 204 });
}
