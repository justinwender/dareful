/**
 * The schedule source: a public scoreboard, the same JSON its own site loads, read behind the adapter and never
 * trusted (docs/decisions.md, public markets). The fields are undocumented, so every read is through a loose
 * schema, and three things are read exactly as the real responses showed them (tests/fixtures/sports): the
 * status's own `completed` is the only word that a game is over (`winner` is false on both sides while a game
 * runs), the score is a string, and `playByPlayAvailable` says whether play-by-play exists. Anything missing,
 * malformed or unparseable is no game or no result, never a crash and never a wrong settlement.
 */
import { z } from "zod";
import { FeedError, isSport, parseScore, type FeedGame, type GameStatus, type ScheduleSource, type Sport, type Team } from "./types";

export const ESPN_LEAGUES: Record<Sport, string> = { nfl: "football/nfl", mlb: "baseball/mlb", nba: "basketball/nba", nhl: "hockey/nhl" };
export const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";
const TIMEOUT_MS = 10_000;

const Competitor = z.object({
  homeAway: z.enum(["home", "away"]),
  winner: z.boolean().optional(),
  score: z.unknown().optional(),
  team: z.object({ id: z.union([z.string(), z.number()]), abbreviation: z.string().optional(), displayName: z.string().optional(), shortDisplayName: z.string().optional(), name: z.string().optional() }),
});
const Event = z.object({
  id: z.union([z.string(), z.number()]),
  date: z.string(),
  status: z.object({ type: z.object({ name: z.string().optional(), state: z.string().optional(), completed: z.boolean().optional() }).optional() }).optional(),
  competitions: z.array(z.object({ timeValid: z.boolean().optional(), playByPlayAvailable: z.boolean().optional(), venue: z.object({ fullName: z.string().optional() }).optional(), competitors: z.array(Competitor).optional() })).optional(),
});
/** A scoreboard always carries `events`, empty on a day with no games (tests/fixtures/sports/espn-empty.json); an answer without it is not a scoreboard. */
const Scoreboard = z.object({ events: z.array(z.unknown()) });

/** The scoreboard's status as the app's word for it. Only `completed` makes a final. */
export function statusOf(type: { name?: string; state?: string; completed?: boolean } | undefined): { status: GameStatus; completed: boolean } {
  const name = type?.name ?? "";
  const completed = type?.completed === true;
  if (/POSTPONED/.test(name)) return { status: "postponed", completed: false };
  if (/CANCEL/.test(name)) return { status: "canceled", completed: false };
  if (completed) return { status: "final", completed: true };
  if (type?.state === "pre") return { status: "scheduled", completed: false };
  if (type?.state === "in") return { status: "in_progress", completed: false };
  return { status: "unknown", completed: false };
}

const teamOf = (c: z.infer<typeof Competitor>): Team | null => {
  const abbr = c.team.abbreviation?.trim();
  const name = c.team.displayName?.trim();
  const short = c.team.shortDisplayName?.trim() || c.team.name?.trim() || name;
  if (!abbr || !name || !short) return null;
  return { id: String(c.team.id), abbr, name, short };
};

/** One event as a game, or null when anything it needs is missing: an unparseable event is skipped, never guessed at. */
export function gameOf(sport: Sport, raw: unknown): FeedGame | null {
  const p = Event.safeParse(raw);
  if (!p.success) return null;
  const e = p.data;
  const comp = e.competitions?.[0];
  if (!comp || !comp.competitors) return null;
  const home = comp.competitors.find((c) => c.homeAway === "home");
  const away = comp.competitors.find((c) => c.homeAway === "away");
  if (!home || !away) return null;
  const homeTeam = teamOf(home);
  const awayTeam = teamOf(away);
  const startsAt = new Date(e.date);
  if (!homeTeam || !awayTeam || Number.isNaN(startsAt.getTime())) return null;
  const { status, completed } = statusOf(e.status?.type);
  return {
    source: "espn",
    sourceId: String(e.id),
    sport,
    startsAt,
    timeValid: comp.timeValid !== false,
    venue: comp.venue?.fullName?.trim() || null,
    home: homeTeam,
    away: awayTeam,
    status,
    completed,
    playByPlay: comp.playByPlayAvailable === true,
    homeScore: parseScore(home.score),
    awayScore: parseScore(away.score),
  };
}

/** A whole scoreboard as games. A body that is not a scoreboard at all is a feed error; a broken event inside one is just left out. */
export function parseScoreboard(sport: Sport, body: unknown): FeedGame[] {
  const p = Scoreboard.safeParse(body);
  if (!p.success) throw new FeedError("the scoreboard did not have the shape of one");
  return p.data.events.map((raw) => gameOf(sport, raw)).filter((g): g is FeedGame => g !== null);
}

/** The result a listed game carries: only once the source says it is complete, and only when both scores parse. Ties are a result. */
export function resultOf(game: Pick<FeedGame, "completed" | "status" | "homeScore" | "awayScore">): { home: number; away: number } | null {
  if (!game.completed || game.status !== "final") return null;
  if (game.homeScore === null || game.awayScore === null) return null;
  return { home: game.homeScore, away: game.awayScore };
}

export function scoreboardUrl(sport: Sport, day: string): string {
  if (!isSport(sport) || !/^\d{8}$/.test(day)) throw new FeedError("not a sport and a day");
  return `${ESPN_BASE}/${ESPN_LEAGUES[sport]}/scoreboard?dates=${day}`;
}

/** The live adapter. Never called while a person waits: the tick reads it, and "Try again" on the failed-feed state. */
export const espn: ScheduleSource = {
  name: "espn",
  async listGames(sport, day) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let body: unknown;
    try {
      const r = await fetch(scoreboardUrl(sport, day), { signal: controller.signal, cache: "no-store", headers: { accept: "application/json" } });
      if (!r.ok) throw new FeedError(`scoreboard ${sport} ${day}: HTTP ${r.status}`);
      body = await r.json();
    } catch (err) {
      throw err instanceof FeedError ? err : new FeedError(`scoreboard ${sport} ${day}: ${err instanceof Error ? err.message : "unreadable"}`);
    } finally {
      clearTimeout(timer);
    }
    return parseScoreboard(sport, body);
  },
};
