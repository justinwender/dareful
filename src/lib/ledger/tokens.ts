/**
 * Link tokens. A token is 32 random bytes, base64url, handed out exactly once inside a link. Only its sha256 is
 * ever stored (`group_invites.token_hash`, `claim_tokens.token_hash`, `personal_links.token_hash`), so a database
 * read never yields a working link.
 *
 * A token is never authentication. It says which row a link points at, nothing about who is holding it.
 */
import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function newToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Null for anything that is not shaped like a token, so a malformed link never reaches a query. */
export function hashToken(token: string): Buffer | null {
  if (!TOKEN_PATTERN.test(token)) return null;
  return createHash("sha256").update(token).digest();
}
