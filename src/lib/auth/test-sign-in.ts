/**
 * Dynamic's test sign-ins (pre-submission bug fixes 1). In a sandbox environment, which is where the app runs through
 * judging, an address with `+dynamic_test` right before the @, or a US number with the 555 area code, signs in with the
 * static code from Dynamic's console in place of one sent to it (Dynamic's docs, "Test Accounts"). The README gives
 * judges that code, so a judge's account is one of these, and a judge often makes two.
 *
 * Such an account is left out of every count from the moment it is made, so judging never moves the numbers the README
 * shows, and it is never emailed: its address has no inbox (example.com refuses mail and dareful.app has no MX record),
 * Resend pauses sending above a 4% bounce rate, and every send counts against the day's hundred. Pure.
 */

/** An address Dynamic treats as a test sign-in: `+dynamic_test` right before the @. */
export function isTestEmail(address: string | null | undefined): boolean {
  return typeof address === "string" && /\+dynamic_test@/i.test(address.trim());
}

/** A number Dynamic treats as a test sign-in: country code 1 and the 555 area code, as E.164 or any spelling of it. */
export function isTestPhone(e164: string | null | undefined): boolean {
  return typeof e164 === "string" && /^\+1555\d{7}$/.test(e164.replace(/[^\d+]/g, ""));
}

type Credential = { format?: string; email?: string; oauth_emails?: string[] } & Record<string, unknown>;

/**
 * Whether a login token is a test sign-in: its email, any email credential's, or the phone it vouches for (read by
 * `phoneOf`, which joins Dynamic's country code and national number).
 */
export function isTestSignIn(claims: { email?: string; verified_credentials: readonly Credential[] }, phone?: string | null): boolean {
  if (isTestEmail(claims.email)) return true;
  if (claims.verified_credentials.some((c) => c.format === "email" && isTestEmail(c.email))) return true;
  return isTestPhone(phone);
}
