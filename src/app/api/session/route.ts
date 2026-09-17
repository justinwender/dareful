import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { isAddress } from "viem";
import { z } from "zod";
import { db, schema } from "@/db";
import { evmAddressesOf, InvalidLoginToken, phoneOf, suggestedNameOf, verifyDynamicToken } from "@/lib/auth/jwt";
import { hashPhone } from "@/lib/auth/phone";
import { clearSessionCookie, issueSessionCookie } from "@/lib/auth/session";

const Body = z.object({
  token: z.string().min(20),
  /** The wallet Dynamic created at signup (its primary wallet). Becomes the ledger wallet on first login. */
  primary: z.string().refine(isAddress, "primary must be an address"),
  /** The second embedded wallet, created by the client. Becomes the governance wallet on first login. */
  other: z.string().refine(isAddress, "other must be an address"),
  displayName: z.string().trim().min(1).max(40).optional(),
});

/**
 * Binds a Dynamic login to a Dareful user. The client sends the login token and the two embedded wallet
 * addresses it holds; the server trusts only what the token vouches for. First login creates the user with the
 * pairing (ledger, governance) fixed for life; later logins must present the same pair.
 */
export async function POST(req: Request): Promise<Response> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { token, displayName } = parsed.data;
  const primary = parsed.data.primary.toLowerCase();
  const other = parsed.data.other.toLowerCase();
  if (primary === other) return NextResponse.json({ error: "the two wallets must differ" }, { status: 400 });

  let claims;
  try {
    claims = await verifyDynamicToken(token);
  } catch (err) {
    const reason = err instanceof InvalidLoginToken ? err.message : "invalid login token";
    return NextResponse.json({ error: reason }, { status: 401 });
  }

  const vouched = new Set(evmAddressesOf(claims));
  if (!vouched.has(primary) || !vouched.has(other)) {
    return NextResponse.json({ error: "wallets are not on this login" }, { status: 401 });
  }

  const phone = phoneOf(claims);
  const phoneHash = phone ? hashPhone(phone) : undefined;

  const [existing] = await db.select().from(schema.users).where(eq(schema.users.dynamicUserId, claims.sub)).limit(1);
  let user = existing;
  if (existing) {
    // The pairing is permanent (the ledger contract enforces the same rule). Later logins may present the
    // two wallets in either order; they must be the same two. Refuse loudly rather than rewrite.
    const pair = new Set([existing.ledgerWallet, existing.governanceWallet]);
    if (!pair.has(primary) || !pair.has(other)) {
      return NextResponse.json({ error: "wallets do not match this account" }, { status: 409 });
    }
    if (phoneHash && !existing.phoneHash) {
      const [updated] = await db
        .update(schema.users)
        .set({ phoneHash })
        .where(eq(schema.users.id, existing.id))
        .returning();
      user = updated ?? existing;
    }
  } else {
    const name = displayName ?? suggestedNameOf(claims) ?? "Friend";
    const [created] = await db
      .insert(schema.users)
      .values({ dynamicUserId: claims.sub, ledgerWallet: primary, governanceWallet: other, displayName: name, phoneHash })
      .returning();
    user = created;
  }
  if (!user) return NextResponse.json({ error: "could not create user" }, { status: 500 });

  await issueSessionCookie(user.id);
  return NextResponse.json({
    user: { id: user.id, displayName: user.displayName, ledgerWallet: user.ledgerWallet, governanceWallet: user.governanceWallet },
  });
}

export async function DELETE(): Promise<Response> {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
