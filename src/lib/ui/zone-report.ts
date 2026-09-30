/**
 * The viewer's zone reaches the server in one cookie (`dareful_tz`, read by `viewerZone`). It used to be
 * written only by `When`, so a browser that had never drawn a relative time (a new account, or a friend
 * opening a link) had every server-drawn clock in UTC: "Decided tomorrow" for a question that closed on
 * Thursday where the person was (the QA round, 2026-09-29). Now the root reports it on every screen, and the
 * one screen drawn before the report is drawn again in the right zone.
 */
export const ZONE_COOKIE = "dareful_tz";

/** The zone stored in the cookie string, or null. */
export function storedZone(cookie: string): string | null {
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === ZONE_COOKIE) {
      try {
        return decodeURIComponent(rest.join("=")) || null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** The zone to write, when the browser's own differs from what the server was told; null when nothing needs saying. */
export function zoneToReport(cookie: string, mine: string | undefined): string | null {
  if (!mine) return null;
  return storedZone(cookie) === mine ? null : mine;
}

/** The cookie line that stores a zone: a year, the whole site, never sent cross-site. */
export function zoneCookie(zone: string): string {
  return `${ZONE_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`;
}
