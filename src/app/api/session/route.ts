import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { evmAddressesOf, InvalidLoginToken, phoneOf, suggestedNameOf, verifyDynamicToken } from "@/lib/auth/jwt";
import { clearClaimTokens, readClaimTokens } from "@/lib/auth/claim-cookie";
import { decideLogin, loginMethod } from "@/lib/auth/login";
import { hashPhone } from "@/lib/auth/phone";
import { clearSessionCookie, currentUser, issueSessionCookie, sessionDueForReissue, sessionIssuedAt } from "@/lib/auth/session";
import { bindByBrowserTokens, bindByPhone } from "@/lib/ledger/claims";
import { record } from "@/lib/usage";
import { validZone } from "@/lib/ui/copy";
import { ZONE_COOKIE } from "@/lib/ui/zone-report";

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
 * or `need: "name"` (a new person, or one whose stored name is the placeholder or an identifier, who has not said
 * what to call them; `refused: true` when what they typed this time was an identifier, so the step stays up with
 * the refusal at the field and nothing is stored under it).
 * First login fixes the pairing (ledger, governance) for life; later logins must still vouch for that pair.
 */
export async function POST(req: Request): Promise<Response> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  // What a person could see is a sentence (5.4); the reason a token was refused goes to the log.
  if (!parsed.success) return NextResponse.json({ error: "Your sign-in didn’t come through. Try again." }, { status: 400 });
  const { token, displayName } = parsed.data;

  let claims;
  try {
    claims = await verifyDynamicToken(token);
  } catch (err) {
    console.error("login token refused", { reason: err instanceof InvalidLoginToken ? err.message : err instanceof Error ? err.message : err });
    return NextResponse.json({ error: "Your sign-in didn’t come through. Try again." }, { status: 401 });
  }

  const phone = phoneOf(claims);
  const phoneHash = phone ? hashPhone(phone) : undefined;
  const vouched = evmAddressesOf(claims);

  const [existing] = await db.select().from(schema.users).where(eq(schema.users.dynamicUserId, claims.sub)).limit(1);
  const decision = decideLogin({ existing: existing ?? null, vouched, displayName });
  if (decision.kind === "refuse") {
    console.error("login refused", { sub: claims.sub, reason: decision.reason });
    return NextResponse.json({ error: "This sign-in doesn’t match the account it was made with. Sign in the way you did the first time." }, { status: 409 });
  }
  if (decision.kind === "need-wallets") return NextResponse.json({ need: "wallets", have: decision.have });
  if (decision.kind === "need-name") return NextResponse.json({ need: "name", suggested: suggestedNameOf(claims) ?? "", ...(decision.refused ? { refused: true } : {}) });

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
  if (!user) return NextResponse.json({ error: "Setting up your account didn’t finish. Try signing in again." }, { status: 500 });

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
  await rememberZone(user);
  await record(decision.kind === "create" ? "signed_up" : "signed_in", { method: loginMethod(claims) }, { userId: user.id });
  return NextResponse.json({
    user: { id: user.id, displayName: user.displayName, ledgerWallet: user.ledgerWallet, governanceWallet: user.governanceWallet },
    bound,
    // A new account: the client marks its governance wallet denied for delegation at Dynamic's end, once, now.
    created: decision.kind === "create",
  });
}

/**
 * The session slides (the field round, 1.7): a cookie a day old or more is issued again for thirty days from now,
 * so an account that opens the app now and then is never signed out by the calendar. Nothing is issued for a bad
 * or missing cookie, or for one younger than a day; the answer is 204 either way and says nothing else.
 */
export async function PATCH(): Promise<Response> {
  const issued = await sessionIssuedAt();
  const user = await currentUser();
  if (user && sessionDueForReissue(issued, new Date())) await issueSessionCookie(user.id);
  if (user) await rememberZone(user);
  return new NextResponse(null, { status: 204 });
}

/**
 * The zone this browser reported (the `dareful_tz` cookie), kept on the account when it changed (the field round,
 * 1.8 as amended): a notice held for the night is held in the recipient's own night, and a server that sends a
 * reminder has no browser to ask. A zone that is not an IANA name is ignored.
 */
async function rememberZone(user: { id: string; zone: string | null }): Promise<void> {
  const raw = (await cookies()).get(ZONE_COOKIE)?.value;
  let zone: string | null = null;
  try {
    zone = validZone(raw ? decodeURIComponent(raw) : null);
  } catch {
    zone = null;
  }
  if (zone && zone !== user.zone) await db.update(schema.users).set({ zone }).where(eq(schema.users.id, user.id));
}

export async function DELETE(): Promise<Response> {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
