/**
 * What the login's credentials say about reaching someone (the first-contact round, 2026-10-04), read on the device
 * that holds the login: the only place the credentials are, since an email is never stored. Kept apart from the
 * database's half (`src/lib/ledger/reach.ts`) so a screen can read it.
 */
/** An email of their own, or a linked Google account. */
export function reachableBy(user: { email?: string | null; verifiedCredentials?: ReadonlyArray<{ format?: string | null; oauthProvider?: string | null; email?: string | null }> | null } | null | undefined): { email: boolean; google: boolean } {
  const creds = user?.verifiedCredentials ?? [];
  const email = Boolean(user?.email) || creds.some((c) => c.format === "email" && Boolean(c.email));
  const google = creds.some((c) => c.format === "oauth" && c.oauthProvider === "google");
  return { email, google };
}
