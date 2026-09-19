import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { evmAddressesOf, InvalidLoginToken, phoneOf, suggestedNameOf, verifyDynamicToken } from "@/lib/auth/jwt";
import { clearClaimTokens, readClaimTokens } from "@/lib/auth/claim-cookie";
import { decideLogin } from "@/lib/auth/login";
import { hashPhone } from "@/lib/auth/phone";
import { clearSessionCookie, issueSessionCookie } from "@/lib/auth/session";
import { bindByBrowserTokens, bindByPhone } from "@/lib/ledger/claims";

const Body = z.object({
  token: z.string().min(20),
  /** What a new person typed when asked what their friends call them. Ignored for an existing account. */
  displayName: z.string().trim().min(1).max(40).optional(),
});

/**
 * Binds a Dynamic login to a Dareful user. The client sends the login token and nothing else it could lie
 * about: which wallets exist is read from the token Dynamic signed, never from the client's own list. That
 * list fills in slowly after a login, and a client that counted it saw "fewer than two" on every new device
 * and made two more wallets each time (docs/decisions.md 2026-09-19).
 *
 * The answer is one of: a session; `need: "wallets"` (a new person whose login vouches for fewer than two);
 * or `need: "name"` (a new person, or one still carrying the placeholder, who has not said what to call them).
 * First login fixes the pairing (ledger, governance) for life; later logins must still vouch for that pair.
 */
export async function POST(req: Request): Promise<Response> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { token, displayName } = parsed.data;

  let claims;
  try {
    claims = await verifyDynamicToken(token);
  } catch (err) {
    const reason = err instanceof InvalidLoginToken ? err.message : "invalid login token";
    return NextResponse.json({ error: reason }, { status: 401 });
  }

  const phone = phoneOf(claims);
  const phoneHash = phone ? hashPhone(phone) : undefined;
  const vouched = evmAddressesOf(claims);

  const [existing] = await db.select().from(schema.users).where(eq(schema.users.dynamicUserId, claims.sub)).limit(1);
  const decision = decideLogin({ existing: existing ?? null, vouched, displayName });
  if (decision.kind === "refuse") return NextResponse.json({ error: decision.reason }, { status: 409 });
  if (decision.kind === "need-wallets") return NextResponse.json({ need: "wallets", have: decision.have });
  if (decision.kind === "need-name") return NextResponse.json({ need: "name", suggested: suggestedNameOf(claims) ?? "" });

  let user = existing;
  if (decision.kind === "create") {
    if (vouched.length > 2) console.error("a new login vouches for more than two embedded wallets", { sub: claims.sub, count: vouched.length });
    const [created] = await db
      .insert(schema.users)
      .values({ dynamicUserId: claims.sub, ledgerWallet: decision.ledgerWallet, governanceWallet: decision.governanceWallet, displayName: decision.displayName, phoneHash })
      .onConflictDoNothing({ target: schema.users.dynamicUserId })
      .returning();
    // Two tabs finishing the same signup at once: the second finds the row the first made.
    user = created ?? (await db.select().from(schema.users).where(eq(schema.users.dynamicUserId, claims.sub)).limit(1))[0];
  } else if (existing) {
    if (decision.kind === "rename") {
      const [renamed] = await db.update(schema.users).set({ displayName: decision.displayName }).where(eq(schema.users.id, existing.id)).returning();
      user = renamed ?? existing;
    }
    if (phoneHash && !existing.phoneHash) {
      try {
        const [updated] = await db.update(schema.users).set({ phoneHash }).where(eq(schema.users.id, existing.id)).returning();
        user = updated ?? user;
      } catch (err) {
        // Another account already carries this phone. The login still stands; this account just has no hash.
        console.error("phone hash already belongs to another account", { userId: existing.id, err });
      }
    }
  }
  if (!user) return NextResponse.json({ error: "could not create user" }, { status: 500 });

  // Binding, in order of authority (PLANNING.md section 4). Phone: every ghost carrying this login's hash,
  // across every creator who picked them. Token: the ghosts someone said "that's me" to in this browser.
  // Both are silent and exact. Nothing mints here: binding only makes the rows theirs to confirm or decline.
  // A failure must not cost the person their login, and must not be quiet either.
  let bound = 0;
  try {
    if (user.phoneHash) bound += (await bindByPhone(user.id, user.phoneHash)).length;
    const tokens = await readClaimTokens();
    if (tokens.length > 0) {
      bound += (await bindByBrowserTokens(user.id, tokens)).length;
      await clearClaimTokens();
    }
  } catch (err) {
    console.error("binding at login failed", { userId: user.id, err });
  }

  await issueSessionCookie(user.id);
  return NextResponse.json({
    user: { id: user.id, displayName: user.displayName, ledgerWallet: user.ledgerWallet, governanceWallet: user.governanceWallet },
    bound,
  });
}

export async function DELETE(): Promise<Response> {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
