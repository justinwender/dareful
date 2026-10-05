import { z } from "zod";

/**
 * What a sign-in started from a link's join flow carries across it (the first-contact round, 2026-10-04; docs/design.md
 * 3.17 as amended): the market to stay on, the name typed at "Who's joining?", and either the entry picked before
 * "Sign in" (sent under the account once it exists) or the guest entry to keep (signed once the device's claim has
 * folded it into the account). Kept in this tab's session storage only, as an unsent draft is: it lives no longer
 * than half an hour, it is never read by the server, and the page works without it.
 */
export const HANDOFF_KEY = "dareful_join";
export const HANDOFF_MS = 30 * 60_000;

const Entry = z.object({ stake: z.string().regex(/^\d{1,12}$/), percent: z.number().int().min(0).max(100).optional(), number: z.string().regex(/^-?\d{1,12}$/).optional(), pick: z.number().int().min(0).max(5).optional() });
const Handoff = z.object({ dareId: z.string().uuid(), at: z.number().int(), name: z.string().trim().min(1).max(40).optional(), entry: Entry.optional(), keep: z.boolean().optional() });
export type JoinHandoff = z.infer<typeof Handoff>;

/** The handoff as stored, or nothing: unreadable, malformed and stale (past `HANDOFF_MS`, or from the future) all read as nothing. */
export function parseHandoff(raw: string | null, now: number): JoinHandoff | null {
  if (!raw) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const h = Handoff.safeParse(json);
  if (!h.success) return null;
  if (h.data.at > now || now - h.data.at > HANDOFF_MS) return null;
  return h.data;
}

export function writeJoinHandoff(h: JoinHandoff): void {
  try {
    window.sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(h));
  } catch {
    // A private window that refuses storage: the sign-in still works, and the person picks their number again.
  }
}

export function readJoinHandoff(now: number): JoinHandoff | null {
  try {
    return parseHandoff(window.sessionStorage.getItem(HANDOFF_KEY), now);
  } catch {
    return null;
  }
}

export function clearJoinHandoff(): void {
  try {
    window.sessionStorage.removeItem(HANDOFF_KEY);
  } catch {
    // Nothing to clear.
  }
}

/**
 * What a signed-in screen does with a handoff for its market: send the entry picked before "Sign in" when this
 * person is not in yet, sign the guest entry the device's claim folded into the account (it arrives unsigned), or
 * nothing, since an entry already theirs and signed means the handoff is spent.
 */
export function resumeFrom(h: JoinHandoff, mine: { unsigned?: boolean } | null): "enter" | "keep" | "done" | "nothing" {
  if (mine === null) return h.entry ? "enter" : "nothing";
  // An entry folded in from this device arrives unsigned: the numbers just picked are the ones signed, else the kept guest entry as it stands.
  if (mine.unsigned) return h.entry ? "enter" : h.keep ? "keep" : "nothing";
  return "done";
}

/** A sign-up from the guest line on a screen that is not a market's: the screen to come back to, so the login stays there (3.46: "Signing up from it comes back to the screen it was tapped on"). */
export const STAY_KEY = "dareful_stay";

export function writeStay(path: string, now: number): void {
  try {
    window.sessionStorage.setItem(STAY_KEY, JSON.stringify({ path, at: now }));
  } catch {
    // Without storage the sign-up still works; it may land on the welcome screen instead.
  }
}

/** The screen to stay on, while fresh. */
export function readStay(now: number): string | null {
  try {
    const raw = window.sessionStorage.getItem(STAY_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { path?: unknown; at?: unknown };
    if (typeof v.path !== "string" || typeof v.at !== "number" || v.at > now || now - v.at > HANDOFF_MS) return null;
    return v.path;
  } catch {
    return null;
  }
}
