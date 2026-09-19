/**
 * Which pooler the app may use. Loud rather than silent: on the session pooler everything works until the
 * fourth serverless instance warms up, and then requests fail with a 500 (docs/decisions.md 2026-09-18).
 */
export function appDatabaseUrl(url: string | undefined): string {
  if (!url) throw new Error("DATABASE_URL is not set");
  if (/pooler\.supabase\.com:5432\//.test(url)) {
    throw new Error("DATABASE_URL points at the session pooler (port 5432); the app uses the transaction pooler (port 6543). The session string belongs in DATABASE_URL_SESSION.");
  }
  return url;
}
