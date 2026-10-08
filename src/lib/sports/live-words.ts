/**
 * The live score's words and rules, with nothing that reads a database or the network, so a screen can import them
 * (the games-and-the-reveal round, 2026-10-07, section 3; docs/design.md 3.24 and 3.33's words by sport).
 */
import { z } from "zod";
import type { Sport } from "./types";

/** A game's live state as the app says it: the two scores and where the game is in the sport's words, or null when the table has none. */
export type LiveScore = { away: number; home: number; where: string | null; final: boolean };

/** How often the feed is read for one game while someone is watching it: once a minute or so (3.24), here every thirty seconds. */
export const LIVE_EVERY_MS = 30_000;
/** How old a read may be and still be shown: past this the feed is taken as unavailable and nothing is shown (section 3). */
export const LIVE_FRESH_MS = 90_000;

const ordinal = (n: number): string => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
};

export const Status = z.object({
  period: z.number().optional(),
  displayClock: z.string().optional(),
  type: z.object({ name: z.string().optional(), state: z.string().optional(), completed: z.boolean().optional(), shortDetail: z.string().optional(), detail: z.string().optional() }).optional(),
});

/**
 * Where the game is, in its sport's words (docs/design.md 3.33, "Words by sport"): football and basketball "Q3 · 8:41",
 * "Halftime", "OT"; baseball "Top 7th", "Bottom 7th" (and the middle and end of an inning); hockey "2nd period · 12:03",
 * "2nd intermission", "OT", "Shootout"; and each sport's finals. Null where the table has no words (a delay, an
 * unknown state). Pure.
 */
export function whereWords(sport: Sport, status: z.infer<typeof Status>): string | null {
  const name = status.type?.name ?? "";
  const period = status.period ?? 0;
  const clock = status.displayClock?.trim() || null;
  const short = status.type?.shortDetail?.trim() ?? "";
  const detail = status.type?.detail?.trim() ?? "";
  // A shootout is the feed saying so, or a fifth period it doesn't call overtime (a playoff game's fifth is a second overtime).
  const said = `${short} ${detail}`;
  const shootout = /\bSO\b/.test(said) || /shootout/i.test(said) || (period >= 5 && !/OT/.test(said));
  if (status.type?.completed === true) {
    if (sport === "mlb") return period > 9 ? `Final, ${period} innings` : "Final";
    if (sport === "nhl") return shootout ? "Final, shootout" : period >= 4 ? "Final, OT" : "Final";
    return period > 4 ? "Final, OT" : "Final";
  }
  if (status.type?.state !== "in") return null;
  if (sport === "mlb") {
    const half = /^(Top|Bot|Mid|End)\b/.exec(short)?.[1];
    if (!half || period < 1) return null;
    return `${{ Top: "Top", Bot: "Bottom", Mid: "Middle", End: "End" }[half]} ${ordinal(period)}`;
  }
  if (sport === "nhl") {
    if (period >= 5 && shootout) return "Shootout";
    if (period >= 4) return "OT";
    if (period < 1) return null;
    if (/END_PERIOD/.test(name)) return `${ordinal(period)} intermission`;
    return clock ? `${ordinal(period)} period · ${clock}` : `${ordinal(period)} period`;
  }
  // Football and basketball. Between quarters the table has no words (the feed says "End of 3rd" over a clock of
  // 0.0, or for football over a running status), so the score stands alone until the next one starts.
  if (/HALFTIME/.test(name)) return "Halftime";
  if (/END_PERIOD/.test(name) || /^End\b/.test(short)) return null;
  if (period > 4) return "OT";
  if (period < 1) return null;
  return clock ? `Q${period} · ${clock}` : `Q${period}`;
}

/** Whether a stored read may be shown: a read at all, and recent. Pure. */
export function liveIsFresh(readAt: Date | null, now: Date): boolean {
  return readAt !== null && now.getTime() - readAt.getTime() <= LIVE_FRESH_MS;
}

const Stored = z.object({ away: z.number().int(), home: z.number().int(), where: z.string().nullable(), final: z.boolean() });

/** What a game's row holds for its live score, when it may be shown; null otherwise. Pure. */
export function storedLive(row: { live: unknown; liveReadAt: Date | null }, now: Date): LiveScore | null {
  if (!liveIsFresh(row.liveReadAt, now)) return null;
  const p = Stored.safeParse(row.live);
  return p.success ? p.data : null;
}

/** "Red Sox 5, Yankees 2": the score as a line, away first as the game's name reads. Pure. */
export function liveLine(live: Pick<LiveScore, "away" | "home">, away: string, home: string): string {
  return `${away} ${live.away}, ${home} ${live.home}`;
}
