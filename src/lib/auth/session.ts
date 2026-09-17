/**
 * The application session. After a Dynamic login token is verified once, the server issues its own signed,
 * httpOnly cookie carrying the user id. Pages and route handlers read the user through `currentUser()`; nothing
 * client-side can forge it, and a Dynamic token is never stored.
 */
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { db, schema } from "@/db";

export const SESSION_COOKIE = "dareful_session";
const SESSION_DAYS = 30;

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET is not set or too short");
  return new TextEncoder().encode(s);
}

export async function issueSessionCookie(userId: string): Promise<void> {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export type SessionUser = typeof schema.users.$inferSelect;

/** The signed-in user, or null. Never throws on a bad cookie; a bad cookie is just signed out. */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  let userId: string | undefined;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    userId = payload.sub;
  } catch {
    return null;
  }
  if (!userId) return null;
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  return user ?? null;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new NotSignedIn();
  return user;
}

export class NotSignedIn extends Error {
  constructor() {
    super("not signed in");
    this.name = "NotSignedIn";
  }
}
