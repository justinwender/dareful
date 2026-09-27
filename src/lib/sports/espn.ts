/**
 * The schedule source: a public scoreboard, the same JSON its own site loads, read behind the adapter and never
 * trusted (docs/decisions.md, public markets). The fields are undocumented, so every read is through a loose
 * schema, and three things are read exactly as the real responses showed them (tests/fixtures/sports): the
 * status's own `completed` is the only word that a game is over (`winner` is false on both sides while a game
 * runs), the score is a string, and `playByPlayAvailable` says whether play-by-play exists yet, which on every
 * upcoming game it does not. Anything missing, malformed or unparseable is no game or no result, never a crash
 * and never a wrong settlement.
 *
 * The same source's summary carries the play-by-play once a game has it (`espn-nfl-summary-final`, the Packers
 * game): its drives in order, each with the source's own word for how it ended. The first drive is the first of
 * them, and its word is mapped to the question's five answers explicitly (`driveAnswer`); a word the table does
 * not know is no result, never guessed into "Something else".
 */
import { z } from "zod";
import { DRIVE_ANSWERS, FeedError, isSport, parseColor, parseScore, type DriveAnswer, type FeedGame, type FirstDriveRead, type GameStatus, type PlaySource, type ScheduleSource, type Sport, type Team } from "./types";

export const ESPN_LEAGUES: Record<Sport, string> = { nfl: "football/nfl", mlb: "baseball/mlb", nba: "basketball/nba", nhl: "hockey/nhl" };
export const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";
const TIMEOUT_MS = 10_000;

const Competitor = z.object({
  homeAway: z.enum(["home", "away"]),
  winner: z.boolean().optional(),
  score: z.unknown().optional(),
  team: z.object({ id: z.union([z.string(), z.number()]), abbreviation: z.string().optional(), displayName: z.string().optional(), shortDisplayName: z.string().optional(), name: z.string().optional(), color: z.unknown().optional() }),
});
const Event = z.object({
  id: z.union([z.string(), z.number()]),
  date: z.string(),
  season: z.object({ type: z.number().optional() }).optional(),
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
  return { id: String(c.team.id), abbr, name, short, color: parseColor(c.team.color) };
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
    seasonType: typeof e.season?.type === "number" && Number.isInteger(e.season.type) ? e.season.type : null,
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

async function fetchJson(url: string, what: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: controller.signal, cache: "no-store", headers: { accept: "application/json" } });
    if (!r.ok) throw new FeedError(`${what}: HTTP ${r.status}`);
    return await r.json();
  } catch (err) {
    throw err instanceof FeedError ? err : new FeedError(`${what}: ${err instanceof Error ? err.message : "unreadable"}`);
  } finally {
    clearTimeout(timer);
  }
}

/** The live adapter. Never called while a person waits: the tick reads it, and "Try again" on the failed-feed state. */
export const espn: ScheduleSource = {
  name: "espn",
  async listGames(sport, day) {
    return parseScoreboard(sport, await fetchJson(scoreboardUrl(sport, day), `scoreboard ${sport} ${day}`));
  },
};

// ------------------------------------------------------------------------------------------ the play-by-play

/**
 * The source's words for how a drive ended, mapped to the question's answers exactly as its terms say them (a
 * missed field goal, a turnover on downs, a safety or the end of the half counts as Something else). Every word
 * here was seen in a recorded summary or is named by the terms; anything else is no result.
 */
const DRIVE_WORDS: Record<string, DriveAnswer> = {
  TD: "Touchdown",
  FG: "Field goal",
  PUNT: "Punt",
  INT: "Turnover",
  "INT TD": "Turnover",
  FUMBLE: "Turnover",
  "FUMBLE TD": "Turnover",
  DOWNS: "Something else",
  "MISSED FG": "Something else",
  SAFETY: "Something else",
  "END OF HALF": "Something else",
  "END OF GAME": "Something else",
};
export function driveAnswer(raw: string | null | undefined): DriveAnswer | null {
  if (typeof raw !== "string") return null;
  const answer = DRIVE_WORDS[raw.trim().toUpperCase()];
  return answer && (DRIVE_ANSWERS as readonly string[]).includes(answer) ? answer : null;
}

const Drive = z.object({
  result: z.unknown().optional(),
  team: z.object({ abbreviation: z.string().optional() }).optional(),
  start: z.object({ period: z.object({ number: z.number().optional() }).optional() }).optional(),
});
/** A summary carries `header`; `drives` is absent until the game has play-by-play (tests/fixtures/sports/espn-nfl-summary-scheduled.json). */
const Summary = z.object({
  header: z.object({ competitions: z.array(z.object({ status: z.object({ type: z.object({ name: z.string().optional(), state: z.string().optional(), completed: z.boolean().optional() }).optional() }).optional() })).optional() }),
  drives: z.object({ previous: z.array(z.unknown()).optional() }).optional(),
});

/**
 * The first drive from a summary: the first of the drives the source lists, when it began in the first period.
 * Null while the game has no play-by-play yet (a scheduled game's summary has no `drives`), or when the first
 * drive is not yet over (it is listed only once it is). A body that is not a summary is a feed error.
 */
export function parseSummary(body: unknown): { status: GameStatus; completed: boolean; firstDrive: FirstDriveRead | null } {
  const p = Summary.safeParse(body);
  if (!p.success) throw new FeedError("the summary did not have the shape of one");
  const { status, completed } = statusOf(p.data.header.competitions?.[0]?.status?.type);
  const first = p.data.drives?.previous?.[0];
  const d = first === undefined ? null : Drive.safeParse(first);
  if (!d || !d.success) return { status, completed, firstDrive: null };
  const raw = typeof d.data.result === "string" ? d.data.result.trim() : "";
  const period = d.data.start?.period?.number;
  if (!raw || (period !== undefined && period !== 1)) return { status, completed, firstDrive: null };
  return { status, completed, firstDrive: { raw, answer: driveAnswer(raw), team: d.data.team?.abbreviation?.trim() || null } };
}

export function summaryUrl(sport: Sport, sourceId: string): string {
  if (!isSport(sport) || !/^\d{1,12}$/.test(sourceId)) throw new FeedError("not a sport and an event");
  return `${ESPN_BASE}/${ESPN_LEAGUES[sport]}/summary?event=${sourceId}`;
}

/** The live play-by-play, read from the tick for a game a first-drive question rides on, never while a person waits. */
export const espnPlays: PlaySource = {
  name: "espn",
  async firstDriveOf(sport, sourceId) {
    return parseSummary(await fetchJson(summaryUrl(sport, sourceId), `summary ${sport} ${sourceId}`)).firstDrive;
  },
};
