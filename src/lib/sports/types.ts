/**
 * What's on's data, behind an adapter (docs/decisions.md, public markets): a game as a schedule source lists it,
 * a final score as a source reports it, and the two source interfaces. Nothing in the rest of the app knows a
 * source's shape; a licensed provider replaces `espn.ts` by changing that one file.
 */
export const SPORTS = ["nfl", "mlb", "nba", "nhl"] as const;
export type Sport = (typeof SPORTS)[number];
export const isSport = (s: unknown): s is Sport => typeof s === "string" && (SPORTS as readonly string[]).includes(s);

export type Team = { id: string; abbr: string; name: string; short: string };
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
  playByPlay: boolean;
  homeScore: number | null;
  awayScore: number | null;
};

export type FinalScore = { home: number; away: number };

/** The schedule and the results: one call lists a sport's games for one day (YYYYMMDD, in the source's own day). */
export type ScheduleSource = { name: string; listGames(sport: Sport, day: string): Promise<FeedGame[]> };

/** The second source, asked once before the backstop settles: a final for this game, or null where it has none. */
export type CheckSource = { name: string; finalOf(game: { sport: Sport; startsAt: Date; homeAbbr: string; awayAbbr: string }): Promise<FinalScore | null> };

export class FeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedError";
  }
}

/** A day as the sources key it: the UTC calendar day, YYYYMMDD. */
export function dayOf(at: Date): string {
  return at.toISOString().slice(0, 10).replace(/-/g, "");
}

/** A whole number from whatever a source sent: a string of digits ("14", never 14 above 9 by string order), or a number. Anything else is nothing. */
export function parseScore(v: unknown): number | null {
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 ? v : null;
  if (typeof v === "string" && /^\d{1,4}$/.test(v.trim())) return Number(v.trim());
  return null;
}
