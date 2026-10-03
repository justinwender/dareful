/**
 * What's on's data, behind an adapter (docs/decisions.md, public markets): a game as a schedule source lists it,
 * a final score as a source reports it, the first drive as the play-by-play reports it, and the source
 * interfaces. Nothing in the rest of the app knows a source's shape; a licensed provider replaces `espn.ts` by
 * changing that one file.
 */
export const SPORTS = ["nfl", "mlb", "nba", "nhl"] as const;
export type Sport = (typeof SPORTS)[number];

/** How each sport's game starts, as the word a row and a caption use ("Everything closes at first pitch."): never "kickoff" for a sport that has none (the field round, 1.2). */
export const START_WORD: Record<Sport, string> = { nfl: "kickoff", mlb: "first pitch", nba: "tip-off", nhl: "puck drop" };
export function startWord(sport: string): string {
  return isSport(sport) ? START_WORD[sport] : "the start";
}
export const isSport = (s: unknown): s is Sport => typeof s === "string" && (SPORTS as readonly string[]).includes(s);

/** A team as the feed names it, with its colour as six hex digits (for its stamp and nowhere else, docs/design.md 1.7), or null when the feed gave none. */
export type Team = { id: string; abbr: string; name: string; short: string; color: string | null };
export type GameStatus = "scheduled" | "in_progress" | "final" | "postponed" | "canceled" | "unknown";

/** A game as the schedule source lists it. Scores are numbers, parsed from whatever the source sent, and null until they parse. */
export type FeedGame = {
  source: "espn";
  sourceId: string;
  sport: Sport;
  startsAt: Date;
  timeValid: boolean;
  venue: string | null;
  home: Team;
  away: Team;
  status: GameStatus;
  /** The source's own word that the game is over. Nothing is read as a result until this is true. */
  completed: boolean;
  /** Whether the source reports play-by-play for it. False on every upcoming game, so nothing is gated on it. */
  playByPlay: boolean;
  /** The feed's season type: 1 preseason, 2 regular season, 3 postseason; null when it gave none. */
  seasonType: number | null;
  homeScore: number | null;
  awayScore: number | null;
};

export type FinalScore = { home: number; away: number };

/** The first drive's five answers (docs/design.md 3.33), exactly as the template lists them. */
export const DRIVE_ANSWERS = ["Touchdown", "Field goal", "Punt", "Turnover", "Something else"] as const;
export type DriveAnswer = (typeof DRIVE_ANSWERS)[number];

/** The first drive as the play-by-play reports it: the source's own word, and the answer it maps to, or null for a word the adapter does not know. */
export type FirstDriveRead = { raw: string; answer: DriveAnswer | null; team: string | null };

/** The schedule and the results: one call lists a sport's games for one day (YYYYMMDD, in the source's own day). */
export type ScheduleSource = { name: string; listGames(sport: Sport, day: string): Promise<FeedGame[]> };

/** The second source, asked once before the backstop settles: a final for this game, or null where it has none. */
export type CheckSource = { name: string; finalOf(game: { sport: Sport; startsAt: Date; homeAbbr: string; awayAbbr: string }): Promise<FinalScore | null> };

/** The play-by-play, for the first drive: null while the game has none yet, or where the source has no play-by-play at all. */
export type PlaySource = { name: string; firstDriveOf(sport: Sport, sourceId: string): Promise<FirstDriveRead | null> };

export class FeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedError";
  }
}

/**
 * A day as the sources key it: the calendar day in the leagues' own zone (US Eastern), YYYYMMDD. Both sources
 * list a day's games by the day it is in New York, and an evening game there (8pm, which is midnight in UTC) is
 * on the UTC calendar's next day. Keyed by the UTC day, every such game was asked for under a day it was not on
 * and never found: "Red Sox at Yankees" at 8pm stayed "scheduled" for good (the field round, 2026-10-02).
 */
export function dayOf(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: SOURCE_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const n = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${n("year")}${n("month")}${n("day")}`;
}

/** The zone the sources' days are counted in. */
export const SOURCE_ZONE = "America/New_York";

/** The same day as the second source writes it, YYYY-MM-DD, moved by whole days. */
export function isoDayOf(at: Date, offsetDays = 0): string {
  const d = dayOf(new Date(at.getTime() + offsetDays * 86_400_000));
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

/** A whole number from whatever a source sent: a string of digits ("14", never 14 above 9 by string order), or a number. Anything else is nothing. */
export function parseScore(v: unknown): number | null {
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 ? v : null;
  if (typeof v === "string" && /^\d{1,4}$/.test(v.trim())) return Number(v.trim());
  return null;
}

/** A team's colour as the feed sends it, six hex digits with or without a hash; anything else is no colour, and the stamp falls back to the ground. */
export function parseColor(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const hex = v.trim().replace(/^#/, "").toLowerCase();
  return /^[0-9a-f]{6}$/.test(hex) ? hex : null;
}
