/**
 * The live score while a game is on (the games-and-the-reveal round, 2026-10-07, section 3; docs/design.md 3.24 and
 * 3.33's words by sport). A game question's screen shows it beside who said what, read from the same scoreboard the
 * schedule comes from, through one route that reads the feed for a game at most once per interval however many are
 * watching (`LIVE_EVERY_MS`, claimed on the game's row), and only while someone has a live game's screen open. The
 * feed's own words for where a game is are never shown: they are mapped to the sport's words here, and a state the
 * table has no words for shows the score alone. When the feed cannot be read, nothing is shown rather than a stale
 * score (`liveIsFresh`).
 */
import { z } from "zod";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { scoreboardUrl } from "./espn";
import { dayOf, FeedError, parseScore, type Sport } from "./types";
import { LIVE_EVERY_MS, Status, storedLive, whereWords, type LiveScore } from "./live-words";
export { LIVE_EVERY_MS, LIVE_FRESH_MS, liveIsFresh, liveLine, storedLive, whereWords, type LiveScore } from "./live-words";

/** One event's live state from a scoreboard body, by the source's id: null when it is not there, not under way or over, or a score will not parse. Pure. */
export function liveOf(sport: Sport, body: unknown, sourceId: string): LiveScore | null {
  const events = z.object({ events: z.array(z.unknown()) }).safeParse(body);
  if (!events.success) throw new FeedError("the scoreboard did not have the shape of one");
  for (const raw of events.data.events) {
    const e = z.object({ id: z.union([z.string(), z.number()]), status: Status.optional(), competitions: z.array(z.object({ competitors: z.array(z.object({ homeAway: z.enum(["home", "away"]), score: z.unknown().optional() })).optional() })).optional() }).safeParse(raw);
    if (!e.success || String(e.data.id) !== sourceId) continue;
    const state = e.data.status?.type?.state;
    const final = e.data.status?.type?.completed === true;
    if (state !== "in" && !final) return null;
    const comp = e.data.competitions?.[0]?.competitors ?? [];
    const home = parseScore(comp.find((c) => c.homeAway === "home")?.score);
    const away = parseScore(comp.find((c) => c.homeAway === "away")?.score);
    if (home === null || away === null) return null;
    return { away, home, where: whereWords(sport, e.data.status ?? {}), final };
  }
  return null;
}

type Fetch = (url: string) => Promise<unknown>;
const fetchScoreboard: Fetch = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const r = await fetch(url, { signal: controller.signal, cache: "no-store", headers: { accept: "application/json" } });
    if (!r.ok) throw new FeedError(`live scoreboard: HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
};

/**
 * The live score for one game, reading the feed only when this request claims the game's next read (`live_tried_at`
 * older than the interval): every other request in the interval gets what the last read stored. A game not started,
 * or over and read, is not read again. Answers what may be shown, or null.
 */
export async function liveScoreFor(gameId: string, now: Date = new Date(), deps: { fetch?: Fetch } = {}): Promise<LiveScore | null> {
  const [game] = await db.select().from(schema.sportsGames).where(eq(schema.sportsGames.id, gameId)).limit(1);
  if (!game || game.startsAt.getTime() > now.getTime()) return null;
  const stored = storedLive(game, now);
  if (stored?.final) return stored;
  const claimed = await db
    .update(schema.sportsGames)
    .set({ liveTriedAt: now })
    .where(and(eq(schema.sportsGames.id, gameId), or(isNull(schema.sportsGames.liveTriedAt), lt(schema.sportsGames.liveTriedAt, new Date(now.getTime() - LIVE_EVERY_MS)))))
    .returning({ id: schema.sportsGames.id });
  if (claimed.length === 0) return stored;
  try {
    const live = liveOf(game.sport as Sport, await (deps.fetch ?? fetchScoreboard)(scoreboardUrl(game.sport as Sport, dayOf(game.startsAt))), game.sourceId);
    if (!live) return null;
    await db.update(schema.sportsGames).set({ live, liveReadAt: now }).where(eq(schema.sportsGames.id, gameId));
    return live;
  } catch (err) {
    // Unavailable: nothing is shown once the last read is no longer fresh, never a stale score.
    console.warn("the live score could not be read", { gameId, err: err instanceof Error ? err.message : err });
    return stored;
  }
}

