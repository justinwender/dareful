/**
 * The ghost's browser tokens. A token lands here only when someone taps "that's me" on a claim link without a
 * session, so holding one always means a person said so in this browser. It is httpOnly: page script never
 * sees it. It is not a session and signs nobody in. It only says which ghosts to bind at the next login here.
 *
 * A browser may hold several, because two creators' ghosts of one person are two claims until a phone login
 * brings them together.
 */
import { cookies } from "next/headers";

export const CLAIM_COOKIE = "dareful_claims";
const MAX_TOKENS = 8;
const DAYS = 180;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export async function readClaimTokens(): Promise<string[]> {
  const jar = await cookies();
  const raw = jar.get(CLAIM_COOKIE)?.value ?? "";
  return raw.split(".").filter((t) => TOKEN.test(t)).slice(0, MAX_TOKENS);
}

/** Newest first; the oldest falls off past the cap. Only callable from a server action or a route handler. */
export async function addClaimToken(token: string): Promise<void> {
  if (!TOKEN.test(token)) return;
  const existing = (await readClaimTokens()).filter((t) => t !== token);
  const jar = await cookies();
  jar.set(CLAIM_COOKIE, [token, ...existing].slice(0, MAX_TOKENS).join("."), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DAYS * 86_400,
  });
}

export async function clearClaimTokens(): Promise<void> {
  const jar = await cookies();
  jar.delete(CLAIM_COOKIE);
}
