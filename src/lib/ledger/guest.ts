/**
 * The guest line (docs/design.md 3.46; built in the first-contact round, 2026-10-04): what someone in from a link
 * without an account is told at the top of every screen they see, from their first market on. The facts come from
 * this browser's own claim tokens, the way a guest is recognised everywhere else (`claimsForBrowserTokens`).
 */
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { readClaimTokens } from "@/lib/auth/claim-cookie";
import { claimsForBrowserTokens } from "./claims";

export type GuestLine = "first" | "called" | "closest";

/**
 * Which line, or none. None before a first market, and none on a market's screen this guest is not in (the link
 * page, whose sheet already offers signing in). The stronger line where a win of theirs stands: "You called it" on a
 * yes-or-no or pick-one market, "You were closest" on a number market. Nothing else ever changes it.
 */
export function guestLineFor(input: { inAny: boolean; here: { in: boolean; won: boolean; numeric: boolean } | null }): GuestLine | null {
  if (!input.inAny) return null;
  if (input.here && !input.here.in) return null;
  if (input.here?.won) return input.here.numeric ? "closest" : "called";
  return "first";
}

/** The line for this browser on this screen (a market's id when the screen is a market's), with the guest's name and the market, or nothing. */
export async function guestLine(dareId: string | null): Promise<{ line: GuestLine; name: string; dareId: string | null } | null> {
  const claims = await claimsForBrowserTokens(await readClaimTokens());
  if (claims.length === 0) return null;
  const ids = claims.map((c) => c.id);
  const positions = await db
    .select({ dareId: schema.darePositions.dareId, claimId: schema.darePositions.claimId, net: schema.darePositions.net })
    .from(schema.darePositions)
    .where(and(inArray(schema.darePositions.claimId, ids), isNotNull(schema.darePositions.acknowledgedAt), isNull(schema.darePositions.dismissedAt)));
  if (positions.length === 0) return null;
  let here: { in: boolean; won: boolean; numeric: boolean } | null = null;
  if (dareId) {
    const mine = positions.find((p) => p.dareId === dareId) ?? null;
    const [d] = mine ? await db.select({ kind: schema.dares.kind, resolvedAt: schema.dares.resolvedAt, resolvedOutcome: schema.dares.resolvedOutcome }).from(schema.dares).where(eq(schema.dares.id, dareId)).limit(1) : [];
    here = { in: mine !== null, won: mine !== null && d?.resolvedAt != null && d.resolvedOutcome !== -1n && (mine.net ?? 0n) > 0n, numeric: d?.kind === "numeric" };
  }
  const line = guestLineFor({ inAny: true, here });
  if (!line) return null;
  const owner = claims.find((c) => positions.some((p) => p.claimId === c.id)) ?? claims[0];
  return { line, name: owner?.displayName ?? "", dareId: here?.in ? dareId : null };
}
