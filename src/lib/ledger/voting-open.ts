/**
 * When the vote opens on a closed market (the games-and-the-reveal round, 2026-10-07; docs/design.md 3.24, calls are
 * in). Its own module, with nothing imported, so the markets module and the sports results can both read it.
 */

/** How long past a game's expected end "Say it yourself" appears on the ballot, in case the feed is late or has nothing (3.35). */
export const SAY_YOURSELF_AFTER_MS = 2 * 3_600_000;

/**
 * Whether the vote is open on a closed market: an argument at once (it is due the moment both are in); a game's
 * question once the final is in, once anyone in has said it happened, or two hours past the game's expected end,
 * when a late feed is no reason to wait (3.35, "Say it yourself"); any other question once someone in said it
 * happened or its decided date, its close time, has come. A question that was voting before this round counts as
 * open (`voteAskedAt`). Pure.
 */
export function votingOpen(
  d: { pace: string; lockedAt: Date | null; happenedAt: Date | null; voteAskedAt: Date | null; resolvesBy: Date | null; templateId: string | null },
  game: { finalSeenAt: Date | null; expectedEndAt: Date } | null,
  now: Date,
): boolean {
  if (!d.lockedAt) return false;
  if (d.pace === "argument" || d.happenedAt || d.voteAskedAt) return true;
  if (d.templateId) return game !== null && (game.finalSeenAt !== null || game.expectedEndAt.getTime() + SAY_YOURSELF_AFTER_MS <= now.getTime());
  return d.resolvesBy !== null && d.resolvesBy.getTime() <= now.getTime();
}
