/**
 * Where this server runs, from the platform's own word: production, a preview, or anywhere else (a laptop, a test run).
 * A laptop's health run reads its own indexer and its own pages and has no tick, so production never stands on it
 * (the ops round); a laptop has email off on purpose, so a notice it sends that goes by no email is no failure of
 * email (pre-submission bug fixes 1). Pure.
 */
export function hereEnv(env: Record<string, string | undefined> = process.env): string {
  return env.VERCEL_ENV === "production" ? "production" : env.VERCEL_ENV === "preview" ? "preview" : "local";
}
