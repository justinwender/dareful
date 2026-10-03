/**
 * The second source (docs/decisions.md, public markets): asked once, from the tick and never while a person
 * waits, before the backstop settles a market nobody voted on. Its free tier returns games with final scores for
 * NFL, MLB and NBA (checked with the real key; tests/fixtures/sports) and refuses hockey with a 401, so a hockey
 * game never has a second source and settles on the scoreboard alone after 72 hours. It allows five requests a
 * minute per sport and has been reported slow; one call reads a whole day and the result is kept on the game row.
 * A team is matched by its abbreviation, through a short alias table where the two sources spell one differently;
 * a game that cannot be matched reads as no result, which is the safe side.
 */
import { z } from "zod";
import { FeedError, isoDayOf, parseScore, type CheckSource, type FinalScore, type Sport } from "./types";

export const BDL_BASE = "https://api.balldontlie.io";
/** Where each sport lives, or null where the free tier has nothing. */
export const BDL_PATHS: Record<Sport, string | null> = { nfl: "nfl/v1", mlb: "mlb/v1", nba: "v1", nhl: null };
const TIMEOUT_MS = 10_000;

/** The scoreboard's abbreviation on the left, the second source's on the right, only where they are known to differ. */
const ALIASES: Record<Sport, Record<string, string>> = {
  nfl: { WSH: "WAS", JAX: "JAC", LAR: "LA" },
  mlb: { ATH: "OAK", CHW: "CWS", WSH: "WAS", AZ: "ARI" },
  nba: { GS: "GSW", NO: "NOP", NY: "NYK", SA: "SAS", UTAH: "UTA", WSH: "WAS", PHX: "PHO" },
  nhl: {},
};
export function sameTeam(sport: Sport, scoreboardAbbr: string, checkAbbr: string): boolean {
  const a = scoreboardAbbr.toUpperCase();
  const b = checkAbbr.toUpperCase();
  return a === b || ALIASES[sport][a] === b;
}

export type CheckGame = { home: string; away: string; final: boolean; homeScore: number | null; awayScore: number | null; date: string };

const Team = z.object({ abbreviation: z.string().optional() });
const Game = z.object({
  date: z.string().optional(),
  status_state: z.string().optional(),
  status: z.string().optional(),
  home_team: Team.optional(),
  visitor_team: Team.optional(),
  away_team: Team.optional(),
  home_team_score: z.unknown().optional(),
  visitor_team_score: z.unknown().optional(),
  home_team_data: z.object({ runs: z.unknown().optional() }).optional(),
  away_team_data: z.object({ runs: z.unknown().optional() }).optional(),
});
const Page = z.object({ data: z.array(z.unknown()) });

/** A page of games as the check reads them. A body that is not a page is a feed error; a broken game inside one is left out. */
export function parseGames(body: unknown): CheckGame[] {
  const p = Page.safeParse(body);
  if (!p.success) throw new FeedError("the second source's answer did not have the shape of one");
  const out: CheckGame[] = [];
  for (const raw of p.data.data) {
    const g = Game.safeParse(raw);
    if (!g.success) continue;
    const home = g.data.home_team?.abbreviation?.trim();
    const away = (g.data.visitor_team ?? g.data.away_team)?.abbreviation?.trim();
    if (!home || !away) continue;
    const final = g.data.status_state === "final";
    const homeScore = parseScore(g.data.home_team_score ?? g.data.home_team_data?.runs);
    const awayScore = parseScore(g.data.visitor_team_score ?? g.data.away_team_data?.runs);
    out.push({ home, away, final, homeScore, awayScore, date: g.data.date ?? "" });
  }
  return out;
}

/** The one game in a day's page that is this one, and its final; null when it is not there, not final, or its scores do not parse. */
export function finalFrom(sport: Sport, games: CheckGame[], game: { homeAbbr: string; awayAbbr: string }): FinalScore | null {
  const g = games.find((x) => sameTeam(sport, game.homeAbbr, x.home) && sameTeam(sport, game.awayAbbr, x.away));
  if (!g || !g.final || g.homeScore === null || g.awayScore === null) return null;
  return { home: g.homeScore, away: g.awayScore };
}

export function gamesUrl(sport: Sport, dayIso: string): string | null {
  const path = BDL_PATHS[sport];
  if (!path || !/^\d{4}-\d{2}-\d{2}$/.test(dayIso)) return null;
  return `${BDL_BASE}/${path}/games?dates[]=${dayIso}&per_page=25`;
}


/** The live check. The key is read here and sent as the authorization header, never logged and never in a URL. */
export const balldontlie: CheckSource = {
  name: "balldontlie",
  async finalOf(game) {
    const key = process.env.BALLDONTLIE_API_KEY;
    if (!key || BDL_PATHS[game.sport] === null) return null;
    // The source keys a game by its UTC day; a late game can sit on the day before or after the scoreboard's start.
    for (const offset of [0, -1, 1]) {
      const url = gamesUrl(game.sport, isoDayOf(game.startsAt, offset));
      if (!url) return null;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let body: unknown;
      try {
        const r = await fetch(url, { signal: controller.signal, cache: "no-store", headers: { authorization: key, accept: "application/json" } });
        if (r.status === 401 || r.status === 403) return null;
        if (!r.ok) throw new FeedError(`second source ${game.sport}: HTTP ${r.status}`);
        body = await r.json();
      } catch (err) {
        throw err instanceof FeedError ? err : new FeedError(`second source ${game.sport}: ${err instanceof Error ? err.message : "unreadable"}`);
      } finally {
        clearTimeout(timer);
      }
      const found = finalFrom(game.sport, parseGames(body), game);
      if (found) return found;
    }
    return null;
  },
};
