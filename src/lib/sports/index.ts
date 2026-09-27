/**
 * What's on's data, driven from the tick and never while a person waits (docs/decisions.md, public markets and
 * the game page): the schedule a few days ahead, the questions written for each game, a final read after each
 * game's expected end until it is complete and once more to catch a correction, the first drive read from the
 * play-by-play once the game has it, the proposal the feed puts on every locked question it answers, and the
 * backstop with an ending on every path once nobody has voted. Every job here is idempotent, scoped in tests to
 * the markets they made, and reachable again next minute if it fails. Underneath, what the tab and the game page
 * read: the games listed by day, how many groups are on each, and a group's questions on a game.
 */
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { keccak256, stringToHex, type Hex } from "viem";
import { db, schema } from "@/db";
import { contracts } from "@/lib/chain/contracts";
import { gasFor } from "@/lib/chain/gas";
import { submit } from "@/lib/chain/relayer";
import { bufferToHex } from "@/lib/ledger/ids";
import { draftFromTemplate, marketById, MarketError, mirrorSettlement, positionsOf, reconcileFromIndexer, settlementFromReceipt, stateOf, toChainOutcome, VOID_OUTCOME, type DareRow } from "@/lib/ledger/markets";
import { membersOfGroups, setLabel } from "@/lib/ledger/groups";
import { balldontlie } from "./balldontlie";
import { espn, espnPlays, resultOf } from "./espn";
import { AGREE_AFTER_MS, ALONE_AFTER_MS, backstopDecision, CONFIRM_AFTER_MS, driveBackstopDecision, driveOutcome, outcomeFor, scoreLine, type Backstop, type FeedEnding } from "./results";
import { expectedEnd, gameName, templatesFor, type TemplateKey } from "./templates";
import { dayOf, SPORTS, type CheckSource, type DriveAnswer, type FeedGame, type FinalScore, type PlaySource, type ScheduleSource, type Sport } from "./types";

export type GameRow = typeof schema.sportsGames.$inferSelect;
export type TemplateRow = typeof schema.publicQuestions.$inferSelect;

/** How far ahead the schedule is read, and how often each sport's is refreshed. */
export const SYNC_DAYS = 5;
export const SYNC_EVERY_MS = 30 * 60_000;
/** How often a game past its expected end is read for a final, until it is complete. */
export const POLL_EVERY_MS = 10 * 60_000;
/** How long after kickoff the play-by-play is first read for the first drive: a drive takes a few minutes, and nothing is lost by waiting. */
export const SUMMARY_FROM_MS = 30 * 60_000;
/** How many backstop settlements one tick may send: each is a chain transaction of its own. */
export const BACKSTOP_PER_TICK = 2;
/** Most asked (docs/design.md 3.32): a game qualifies once this many groups have started anything on it. Below it a count is noise, and a small one can tell someone whose group it is. */
export const MOST_ASKED_FLOOR = 10;
export const MOST_ASKED_MAX = 3;

export type SportsReport = { synced: Sport[]; polled: string[]; drives: string[]; proposed: string[]; settled: string[]; voided: string[]; failed: Array<{ id: string; what: string; why: string }> };

const finalOfRow = (g: Pick<GameRow, "homeScore" | "awayScore" | "finalSeenAt">): FinalScore | null => (g.finalSeenAt && g.homeScore !== null && g.awayScore !== null ? { home: g.homeScore, away: g.awayScore } : null);
const some = (ids: string[] | undefined, column: typeof schema.dares.id) => (ids ? inArray(column, ids.length ? ids : ["00000000-0000-4000-8000-000000000000"]) : undefined);

/** One game row from a listing, with the final's clocks kept as they were unless the score itself is new or has changed. */
function rowFrom(g: FeedGame, now: Date, was: Pick<GameRow, "homeScore" | "awayScore" | "finalSeenAt" | "finalConfirmedAt"> | null): Omit<typeof schema.sportsGames.$inferInsert, "id" | "createdAt"> {
  const result = resultOf(g);
  const before = was ? finalOfRow(was) : null;
  const changed = result !== null && (before === null || before.home !== result.home || before.away !== result.away);
  const confirmed = result !== null && before !== null && !changed && was?.finalConfirmedAt === null && was.finalSeenAt !== null && now.getTime() - was.finalSeenAt.getTime() >= CONFIRM_AFTER_MS;
  return {
    source: g.source,
    sourceId: g.sourceId,
    sport: g.sport,
    name: gameName(g),
    startsAt: g.startsAt,
    timeValid: g.timeValid,
    venue: g.venue,
    homeId: g.home.id,
    homeAbbr: g.home.abbr,
    homeName: g.home.name,
    homeShort: g.home.short,
    homeColor: g.home.color,
    awayId: g.away.id,
    awayAbbr: g.away.abbr,
    awayName: g.away.name,
    awayShort: g.away.short,
    awayColor: g.away.color,
    seasonType: g.seasonType,
    playByPlay: g.playByPlay,
    status: g.status,
    completed: g.completed,
    // A score is written only from a complete game; a game still running keeps whatever final it never had.
    homeScore: result ? result.home : (was?.homeScore ?? null),
    awayScore: result ? result.away : (was?.awayScore ?? null),
    finalSeenAt: result ? (changed ? now : (was?.finalSeenAt ?? now)) : (was?.finalSeenAt ?? null),
    finalConfirmedAt: result ? (changed ? null : confirmed ? now : (was?.finalConfirmedAt ?? null)) : (was?.finalConfirmedAt ?? null),
    expectedEndAt: expectedEnd(g.sport, g.startsAt),
    polledAt: now,
    fetchedAt: now,
  };
}

/** Writes a listing's games and their questions. Returns the rows, by source id. */
export async function upsertGames(games: FeedGame[], now: Date): Promise<GameRow[]> {
  if (games.length === 0) return [];
  const existing = await db.select().from(schema.sportsGames).where(and(eq(schema.sportsGames.source, "espn"), inArray(schema.sportsGames.sourceId, games.map((g) => g.sourceId))));
  const was = new Map(existing.map((r) => [r.sourceId, r]));
  const rows: GameRow[] = [];
  for (const g of games) {
    const values = rowFrom(g, now, was.get(g.sourceId) ?? null);
    const [row] = await db
      .insert(schema.sportsGames)
      .values(values)
      .onConflictDoUpdate({ target: [schema.sportsGames.source, schema.sportsGames.sourceId], set: values })
      .returning();
    if (!row) continue;
    rows.push(row);
    for (const t of templatesFor(g)) {
      const values = { gameId: row.id, key: t.key, kind: t.kind, title: t.title, termsText: t.terms, outcomeLabels: t.outcomeLabels, range: t.range, typical: t.typical, shift: t.shift, decidedByScore: t.decidedByScore, decidedByFeed: t.decidedByFeed, outcomeWords: t.outcomeWords, sort: t.sort };
      await db.insert(schema.publicQuestions).values(values).onConflictDoUpdate({ target: [schema.publicQuestions.gameId, schema.publicQuestions.key], set: values });
    }
  }
  return rows;
}

async function noteRead(sport: Sport, source: string, now: Date, error: string | null): Promise<void> {
  const set = error ? { lastErrorAt: now, lastError: error.slice(0, 200) } : { lastOkAt: now };
  await db.insert(schema.sportsFeedReads).values({ source, sport, ...set }).onConflictDoUpdate({ target: [schema.sportsFeedReads.source, schema.sportsFeedReads.sport], set });
}

/** The schedule for one sport, the next few days, one call a day. What the tab lists and what "Try again" re-reads. */
export async function syncSchedule(sport: Sport, now: Date, source: ScheduleSource = espn): Promise<{ games: number }> {
  let count = 0;
  try {
    for (let i = 0; i < SYNC_DAYS; i++) {
      const games = await source.listGames(sport, dayOf(new Date(now.getTime() + i * 86_400_000)));
      count += (await upsertGames(games, now)).length;
    }
    await noteRead(sport, source.name, now, null);
  } catch (err) {
    await noteRead(sport, source.name, now, err instanceof Error ? err.message : "unknown");
    throw err;
  }
  return { games: count };
}

/** Which sport's schedule is stalest and due: one a tick, so a slow source never holds the tick past its minute. */
export async function sportDueForSync(now: Date): Promise<Sport | null> {
  const reads = await db.select().from(schema.sportsFeedReads).where(eq(schema.sportsFeedReads.source, "espn"));
  const last = (s: Sport) => {
    const r = reads.find((x) => x.sport === s);
    return Math.max(r?.lastOkAt?.getTime() ?? 0, r?.lastErrorAt?.getTime() ?? 0);
  };
  const due = SPORTS.filter((s) => now.getTime() - last(s) >= SYNC_EVERY_MS).sort((a, b) => last(a) - last(b));
  return due[0] ?? null;
}

/** The markets that ride on a game: every question started from one of its templates, or only those named. */
async function marketsOnGames(gameIds: string[], onlyIds?: string[]): Promise<Array<DareRow & { template: TemplateRow }>> {
  if (gameIds.length === 0) return [];
  const rows = await db
    .select({ dare: schema.dares, template: schema.publicQuestions })
    .from(schema.dares)
    .innerJoin(schema.publicQuestions, eq(schema.publicQuestions.id, schema.dares.templateId))
    .where(and(inArray(schema.publicQuestions.gameId, gameIds), isNotNull(schema.dares.creatorSignature), some(onlyIds, schema.dares.id)));
  return rows.map((r) => ({ ...r.dare, template: r.template }));
}

/** The games worth a read: past their expected end and not complete, or complete once and due their confirmation re-read; only games a question rides on. */
export async function gamesToPoll(now: Date, onlyIds?: string[]): Promise<GameRow[]> {
  const ridden = await db
    .selectDistinct({ gameId: schema.publicQuestions.gameId })
    .from(schema.dares)
    .innerJoin(schema.publicQuestions, eq(schema.publicQuestions.id, schema.dares.templateId))
    .where(and(isNotNull(schema.dares.creatorSignature), isNull(schema.dares.resolvedAt), some(onlyIds, schema.dares.id)));
  if (ridden.length === 0) return [];
  const stale = new Date(now.getTime() - POLL_EVERY_MS);
  const confirmDue = new Date(now.getTime() - CONFIRM_AFTER_MS);
  return db
    .select()
    .from(schema.sportsGames)
    .where(
      and(
        inArray(schema.sportsGames.id, ridden.map((r) => r.gameId)),
        lt(schema.sportsGames.expectedEndAt, now),
        or(and(eq(schema.sportsGames.completed, false), or(isNull(schema.sportsGames.polledAt), lt(schema.sportsGames.polledAt, stale))), and(isNotNull(schema.sportsGames.finalSeenAt), isNull(schema.sportsGames.finalConfirmedAt), lt(schema.sportsGames.finalSeenAt, confirmDue))),
      ),
    )
    .orderBy(asc(schema.sportsGames.expectedEndAt))
    .limit(12);
}

/** Reads finals for the games due one, one listing per sport and day, and puts the score's proposal on every locked question it answers. */
export async function pollFinals(now: Date, opts: { source?: ScheduleSource; onlyIds?: string[] } = {}): Promise<{ polled: string[]; proposed: string[] }> {
  const source = opts.source ?? espn;
  const due = await gamesToPoll(now, opts.onlyIds);
  const polled: string[] = [];
  const proposed: string[] = [];
  const byDay = new Map<string, GameRow[]>();
  for (const g of due) {
    const key = `${g.sport}:${dayOf(g.startsAt)}`;
    byDay.set(key, [...(byDay.get(key) ?? []), g]);
  }
  for (const [key, rows] of byDay) {
    const sport = key.split(":")[0] as Sport;
    const day = key.split(":")[1] as string;
    let listed: FeedGame[];
    try {
      listed = await source.listGames(sport, day);
      await noteRead(sport, source.name, now, null);
    } catch (err) {
      await noteRead(sport, source.name, now, err instanceof Error ? err.message : "unknown");
      // A listing that failed leaves every game as it was; it is read again next time.
      continue;
    }
    const seen = new Set(listed.map((g) => g.sourceId));
    const written = await upsertGames(listed.filter((g) => rows.some((r) => r.sourceId === g.sourceId)), now);
    // A game the listing no longer carries is marked polled, so a vanished game does not pin the tick to it.
    for (const r of rows) if (!seen.has(r.sourceId)) await db.update(schema.sportsGames).set({ polledAt: now }).where(eq(schema.sportsGames.id, r.id));
    for (const row of written) {
      polled.push(row.id);
      proposed.push(...(await proposeFor(row, now, opts.onlyIds)));
    }
  }
  return { polled, proposed };
}

/**
 * The games whose play-by-play is worth a read for the first drive: a first-drive question rides on them, kickoff
 * was half an hour ago or more, and the drive has not yet been read twice unchanged; once the game is complete
 * and the summary has been read since, it is not read again, recognised result or not.
 */
export async function summariesToPoll(now: Date, onlyIds?: string[]): Promise<GameRow[]> {
  const ridden = await db
    .selectDistinct({ gameId: schema.publicQuestions.gameId })
    .from(schema.dares)
    .innerJoin(schema.publicQuestions, eq(schema.publicQuestions.id, schema.dares.templateId))
    .where(and(eq(schema.publicQuestions.key, "first_drive"), isNotNull(schema.dares.creatorSignature), isNull(schema.dares.resolvedAt), some(onlyIds, schema.dares.id)));
  if (ridden.length === 0) return [];
  const stale = new Date(now.getTime() - POLL_EVERY_MS);
  const from = new Date(now.getTime() - SUMMARY_FROM_MS);
  return db
    .select()
    .from(schema.sportsGames)
    .where(
      and(
        inArray(schema.sportsGames.id, ridden.map((r) => r.gameId)),
        lt(schema.sportsGames.startsAt, from),
        isNull(schema.sportsGames.firstDriveConfirmedAt),
        or(isNull(schema.sportsGames.summaryPolledAt), lt(schema.sportsGames.summaryPolledAt, stale)),
        // Complete and read since completion: nothing more will come of it.
        or(isNull(schema.sportsGames.finalSeenAt), isNull(schema.sportsGames.summaryPolledAt), sql`${schema.sportsGames.summaryPolledAt} < ${schema.sportsGames.finalSeenAt}`),
      ),
    )
    .orderBy(asc(schema.sportsGames.startsAt))
    .limit(8);
}

/** Reads the first drive for the games due one, from the play-by-play, and puts its proposal on every locked first-drive question. */
export async function pollSummaries(now: Date, opts: { play?: PlaySource; onlyIds?: string[] } = {}): Promise<{ read: string[]; proposed: string[] }> {
  const play = opts.play ?? espnPlays;
  const read: string[] = [];
  const proposed: string[] = [];
  for (const game of await summariesToPoll(now, opts.onlyIds)) {
    let drive;
    try {
      drive = await play.firstDriveOf(game.sport as Sport, game.sourceId);
      await noteRead(game.sport as Sport, `${play.name}:summary`, now, null);
    } catch (err) {
      await noteRead(game.sport as Sport, `${play.name}:summary`, now, err instanceof Error ? err.message : "unknown");
      continue;
    }
    const changed = drive !== null && drive.raw !== game.firstDriveRaw;
    const confirmed = drive !== null && !changed && game.firstDriveSeenAt !== null && game.firstDriveConfirmedAt === null && now.getTime() - game.firstDriveSeenAt.getTime() >= CONFIRM_AFTER_MS;
    const [row] = await db
      .update(schema.sportsGames)
      .set({
        summaryPolledAt: now,
        firstDriveRaw: drive ? drive.raw : game.firstDriveRaw,
        firstDriveResult: drive ? drive.answer : game.firstDriveResult,
        firstDriveSeenAt: drive ? (changed ? now : (game.firstDriveSeenAt ?? now)) : game.firstDriveSeenAt,
        firstDriveConfirmedAt: drive ? (changed ? null : confirmed ? now : game.firstDriveConfirmedAt) : game.firstDriveConfirmedAt,
      })
      .where(eq(schema.sportsGames.id, game.id))
      .returning();
    if (!row) continue;
    read.push(row.id);
    proposed.push(...(await proposeFor(row, now, opts.onlyIds)));
  }
  return { read, proposed };
}

/** The feed's proposal on every locked, undecided question it answers (3.35): the score's, and the play-by-play's; it follows the feed until the quorum is reached. */
export async function proposeFor(game: GameRow, now: Date, onlyIds?: string[]): Promise<string[]> {
  const final = finalOfRow(game);
  const out: string[] = [];
  for (const d of await marketsOnGames([game.id], onlyIds)) {
    if (stateOf(d) !== "locked" || !d.template.decidedByFeed) continue;
    let outcome: bigint | null = null;
    if (d.template.key === "first_drive") outcome = driveOutcome(d.template.outcomeLabels, game.firstDriveResult as DriveAnswer | null);
    else if (final) outcome = outcomeFor(d.template, final)?.outcome ?? null;
    if (outcome === null || d.feedOutcome === outcome) continue;
    await db.update(schema.dares).set({ feedOutcome: outcome, feedOutcomeAt: now }).where(and(eq(schema.dares.id, d.id), isNull(schema.dares.resolvedAt)));
    out.push(d.id);
  }
  return out;
}

/** The ruling the chain carries for a feed settlement: the same words on every screen. */
export const FEED_RULING = "Decided by the final score, as the terms said.";
export const DRIVE_RULING = "Decided by the play-by-play, as the terms said.";
export function feedRulingText(final: FinalScore | null, home: string, away: string, ending: FeedEnding, drive?: string | null): string {
  if (ending === "conflict") return "The two scoreboards reported different finals, so the final score could not settle it and nothing changes hands.";
  if (ending === "tie") return `A tie: ${final ? scoreLine(final, home, away) : "level"}. The final score could not settle a tie, so nothing changes hands.`;
  if (ending === "drive_unknown") return "The play-by-play could not say how the first drive ended, so nothing changes hands.";
  if (ending === "drive") return `${DRIVE_RULING} ${drive ?? "Something else"}. The play-by-play held for three days.`;
  if (ending === "alone") return `${FEED_RULING} ${final ? scoreLine(final, home, away) : ""} The score held for three days.`.replace(/\s+/g, " ").trim();
  return `${FEED_RULING} ${final ? scoreLine(final, home, away) : ""}`.trim() + (final ? "." : "");
}

/**
 * The feed settling a market nobody voted on, the way everyone agreed at entry: recorded on the chain through
 * `arbitrate` with the ruling's hash, as an arbitration is, and mirrored as `feed`, which is counted clean and
 * never a void against anyone. A tie the contract cannot score, two finals that disagree, or a first drive the
 * play-by-play could not say voids the same way, with the ruling saying which, and the ending kept on the row.
 */
export async function settleByFeed(d: DareRow, template: TemplateRow, game: GameRow, decision: { outcome: bigint | null; ending: FeedEnding }, now: Date): Promise<{ txHash: Hex; voided: boolean }> {
  if (stateOf(d) !== "locked" || !d.onchainId) throw new MarketError("It isn't waiting on the feed.", "wrong_state");
  if (d.stalemate !== "arbitrate") throw new MarketError("The feed can only settle a question whose tiebreaker it is.", "wrong_state");
  const final = finalOfRow(game);
  const voided = decision.outcome === null || decision.outcome === VOID_OUTCOME;
  const outcome = voided ? VOID_OUTCOME : (decision.outcome as bigint);
  const drive = template.key === "first_drive" && !voided ? (template.outcomeLabels[Number(outcome)] ?? null) : null;
  const text = feedRulingText(final, game.homeShort, game.awayShort, decision.ending, drive);
  const hash = keccak256(stringToHex(text));
  const positions = await positionsOf(d.id);
  const { dares } = contracts();
  let result;
  try {
    result = await submit({
      label: `feed settles market ${d.id}`,
      address: dares.address,
      abi: dares.abi,
      functionName: "arbitrate",
      args: [bufferToHex(d.onchainId), voided ? 0n : toChainOutcome(outcome), voided, hash],
      gas: voided ? gasFor.arbitrateVoid() : gasFor.arbitrate(positions.length),
    });
  } catch (err) {
    if (await reconcileFromIndexer(d.id)) throw new MarketError("It was decided meanwhile.", "wrong_state");
    throw new MarketError(`The feed's answer is in, but recording it didn't go through. Nothing changed. (${err instanceof Error ? (err.message.split("\n")[0] ?? "") : "unknown"})`, "chain");
  }
  await mirrorSettlement(d, settlementFromReceipt(result, outcome), { by: "feed", rulingText: text, rulingHash: hash });
  await db.update(schema.dares).set({ feedEnding: decision.ending }).where(eq(schema.dares.id, d.id));
  void now;
  return { txHash: result.hash, voided };
}

/** A score backstop's decision as the row's ending. */
function endingOf(decision: Backstop, scored: { outcome: bigint; tie: boolean } | null): { outcome: bigint | null; ending: FeedEnding } | null {
  if (decision.act === "wait") return null;
  if (decision.act === "void") return { outcome: null, ending: "conflict" };
  if (!scored || scored.tie) return { outcome: null, ending: "tie" };
  return { outcome: scored.outcome, ending: decision.alone ? "alone" : "agreed" };
}

/**
 * The backstop, once a final has stood a day: asks the second source once, then settles, voids or waits by the
 * pure decision, at most a couple of markets a tick. The second source is asked again at the three-day mark
 * for a game it had nothing on, in case it was only late. The first drive has one source and its own clocks.
 */
export async function feedBackstop(now: Date, opts: { check?: CheckSource; onlyIds?: string[]; limit?: number } = {}): Promise<{ settled: string[]; voided: string[]; failed: Array<{ id: string; what: string; why: string }> }> {
  const check = opts.check ?? balldontlie;
  const settled: string[] = [];
  const voided: string[] = [];
  const failed: Array<{ id: string; what: string; why: string }> = [];
  const dueBy = new Date(now.getTime() - AGREE_AFTER_MS);
  const rows = await db
    .select({ dare: schema.dares, template: schema.publicQuestions, game: schema.sportsGames })
    .from(schema.dares)
    .innerJoin(schema.publicQuestions, eq(schema.publicQuestions.id, schema.dares.templateId))
    .innerJoin(schema.sportsGames, eq(schema.sportsGames.id, schema.publicQuestions.gameId))
    .where(and(isNotNull(schema.dares.lockedAt), isNull(schema.dares.resolvedAt), eq(schema.dares.stalemate, "arbitrate"), eq(schema.publicQuestions.decidedByFeed, true), isNotNull(schema.sportsGames.finalSeenAt), lt(schema.sportsGames.finalSeenAt, dueBy), some(opts.onlyIds, schema.dares.id)))
    .orderBy(asc(schema.sportsGames.finalSeenAt))
    .limit(opts.limit ?? BACKSTOP_PER_TICK);
  const checked = new Map<string, FinalScore | null>();
  for (const { dare, template, game } of rows) {
    try {
      let decision: { outcome: bigint | null; ending: FeedEnding } | null = null;
      if (template.key === "first_drive") {
        // One source only: the play-by-play read twice unchanged settles three days on; nothing recognised three days after the game was complete voids.
        const d = driveBackstopDecision({ outcome: driveOutcome(template.outcomeLabels, game.firstDriveResult as DriveAnswer | null), seenAt: game.firstDriveSeenAt, confirmedAt: game.firstDriveConfirmedAt, completeAt: game.finalSeenAt, now });
        decision = d.act === "wait" ? null : d.act === "settle" ? { outcome: d.outcome, ending: "drive" } : { outcome: null, ending: "drive_unknown" };
      } else {
        const final = finalOfRow(game);
        if (!final) continue;
        // The second source, once per game per tick, kept on the row; asked again past three days if it had nothing.
        let second: FinalScore | null = game.checkHomeScore !== null && game.checkAwayScore !== null ? { home: game.checkHomeScore, away: game.checkAwayScore } : null;
        const askAgain = second === null && (game.checkedAt === null || now.getTime() - game.finalSeenAt!.getTime() >= ALONE_AFTER_MS) && !checked.has(game.id);
        if (askAgain) {
          second = await check.finalOf({ sport: game.sport as Sport, startsAt: game.startsAt, homeAbbr: game.homeAbbr, awayAbbr: game.awayAbbr }).catch((err: unknown) => {
            console.error("the second source could not be read", { gameId: game.id, err: err instanceof Error ? err.message : err });
            return null;
          });
          checked.set(game.id, second);
          await db.update(schema.sportsGames).set({ checkHomeScore: second?.home ?? null, checkAwayScore: second?.away ?? null, checkedAt: now }).where(eq(schema.sportsGames.id, game.id));
        } else if (checked.has(game.id)) second = checked.get(game.id) ?? null;
        decision = endingOf(backstopDecision({ finalSeenAt: game.finalSeenAt!, confirmedAt: game.finalConfirmedAt, final, check: second, now }), outcomeFor(template, final));
      }
      if (!decision) continue;
      // Still worth a vote if the votes already there would decide it: never overrule a quorum that exists.
      const fresh = await marketById(dare.id);
      if (!fresh || fresh.resolvedAt) continue;
      const r = await settleByFeed(fresh, template, game, decision, now);
      (r.voided ? voided : settled).push(dare.id);
    } catch (err) {
      failed.push({ id: dare.id, what: "feed backstop", why: err instanceof Error ? (err.message.split("\n")[0] ?? "") : "unknown" });
    }
  }
  return { settled, voided, failed };
}

/** Everything the tick does for What's on, in order: one sport's schedule when due, the finals, the first drives, the proposals, the backstop. */
export async function sportsTick(now: Date, opts: { schedule?: ScheduleSource; check?: CheckSource; play?: PlaySource; onlyIds?: string[]; sync?: boolean } = {}): Promise<SportsReport> {
  const report: SportsReport = { synced: [], polled: [], drives: [], proposed: [], settled: [], voided: [], failed: [] };
  if (opts.sync !== false && !opts.onlyIds) {
    const sport = await sportDueForSync(now);
    if (sport) {
      try {
        await syncSchedule(sport, now, opts.schedule);
        report.synced.push(sport);
      } catch (err) {
        report.failed.push({ id: sport, what: "schedule", why: err instanceof Error ? (err.message.split("\n")[0] ?? "") : "unknown" });
      }
    }
  }
  try {
    const p = await pollFinals(now, { source: opts.schedule, onlyIds: opts.onlyIds });
    report.polled = p.polled;
    report.proposed = p.proposed;
  } catch (err) {
    report.failed.push({ id: "-", what: "finals", why: err instanceof Error ? (err.message.split("\n")[0] ?? "") : "unknown" });
  }
  try {
    const s = await pollSummaries(now, { play: opts.play, onlyIds: opts.onlyIds });
    report.drives = s.read;
    report.proposed.push(...s.proposed);
  } catch (err) {
    report.failed.push({ id: "-", what: "first drives", why: err instanceof Error ? (err.message.split("\n")[0] ?? "") : "unknown" });
  }
  const b = await feedBackstop(now, { check: opts.check, onlyIds: opts.onlyIds });
  report.settled = b.settled;
  report.voided = b.voided;
  report.failed.push(...b.failed);
  return report;
}

/** A template with its game, for drafting and for the screen. */
export async function templateById(id: string): Promise<{ template: TemplateRow; game: GameRow } | null> {
  const [row] = await db.select({ template: schema.publicQuestions, game: schema.sportsGames }).from(schema.publicQuestions).innerJoin(schema.sportsGames, eq(schema.sportsGames.id, schema.publicQuestions.gameId)).where(eq(schema.publicQuestions.id, id)).limit(1);
  return row ?? null;
}

/** The game and template behind a market, or null for an ordinary one. */
export async function templateOfMarket(d: Pick<DareRow, "templateId">): Promise<{ template: TemplateRow; game: GameRow } | null> {
  return d.templateId ? templateById(d.templateId) : null;
}

/**
 * How many sets of people have started a question from each template (docs/design.md 3.32): a market counts once
 * it has a second person in, and a set counts once. Never who they are, never what anyone picked.
 */
export async function useCounts(templateIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>(templateIds.map((id) => [id, 0]));
  if (templateIds.length === 0) return out;
  const rows = await db
    .select({ templateId: schema.dares.templateId, groups: sql<number>`count(distinct ${schema.dares.groupId})::int` })
    .from(schema.dares)
    .where(and(inArray(schema.dares.templateId, templateIds), isNotNull(schema.dares.creatorSignature), sql`(select count(*) from ${schema.darePositions} p where p.dare_id = ${schema.dares.id}) >= 2`))
    .groupBy(schema.dares.templateId);
  for (const r of rows) if (r.templateId) out.set(r.templateId, r.groups);
  return out;
}

/**
 * How many friend groups have started anything on each game (docs/design.md 3.32, as games): a group counts once
 * one of its markets on the game has a second person in, and once per game however many questions it runs. Never
 * who, never what anyone picked.
 */
export async function gameUseCounts(gameIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>(gameIds.map((id) => [id, 0]));
  if (gameIds.length === 0) return out;
  const rows = await db
    .select({ gameId: schema.publicQuestions.gameId, groups: sql<number>`count(distinct ${schema.dares.groupId})::int` })
    .from(schema.dares)
    .innerJoin(schema.publicQuestions, eq(schema.publicQuestions.id, schema.dares.templateId))
    .where(and(inArray(schema.publicQuestions.gameId, gameIds), isNotNull(schema.dares.creatorSignature), sql`(select count(*) from ${schema.darePositions} p where p.dare_id = ${schema.dares.id}) >= 2`))
    .groupBy(schema.publicQuestions.gameId);
  for (const r of rows) out.set(r.gameId, r.groups);
  return out;
}

// ------------------------------------------------------------------------------------------- the tab's data

export type ListedGame = { game: GameRow; templates: TemplateRow[]; /** The count once ten groups are on it; null below the floor (3.32). */ asked: number | null; /** The sets of people this viewer is in that have started anything on it, most recent first, with a label for the row. */ yours: Array<{ groupId: string; label: string; lastAt: Date }> };
export type WhatsOn = {
  mostAsked: ListedGame[];
  /** The schedule by day in the viewer's zone, soonest first, each day's games in start order. */
  days: Array<{ label: string; games: ListedGame[] }>;
  /** The feed's state: when it last read cleanly, and whether its last read failed (3.32, C and D). */
  feed: { lastOkAt: Date | null; failing: boolean };
};

/** The games ahead: a confirmed start time, not yet started, and not off. Each leaves the list at its start. */
async function upcomingGames(now: Date): Promise<GameRow[]> {
  return db
    .select()
    .from(schema.sportsGames)
    .where(and(eq(schema.sportsGames.timeValid, true), gt(schema.sportsGames.startsAt, now), ne(schema.sportsGames.status, "postponed"), ne(schema.sportsGames.status, "canceled")))
    .orderBy(asc(schema.sportsGames.startsAt), asc(schema.sportsGames.name))
    .limit(120);
}

/** The games this viewer is on, by game: the sets of people among theirs with anything started on it, most recent first. */
async function yoursOnGames(gameIds: string[], viewerId: string, viewerName: string): Promise<Map<string, ListedGame["yours"]>> {
  const out = new Map<string, ListedGame["yours"]>();
  if (gameIds.length === 0) return out;
  const mine = await db.select({ groupId: schema.groupMembers.groupId }).from(schema.groupMembers).where(and(eq(schema.groupMembers.userId, viewerId), isNull(schema.groupMembers.leftAt)));
  if (mine.length === 0) return out;
  const rows = await db
    .select({ gameId: schema.publicQuestions.gameId, groupId: schema.dares.groupId, lastAt: sql<Date>`max(${schema.dares.createdAt})` })
    .from(schema.dares)
    .innerJoin(schema.publicQuestions, eq(schema.publicQuestions.id, schema.dares.templateId))
    .where(and(inArray(schema.publicQuestions.gameId, gameIds), inArray(schema.dares.groupId, mine.map((m) => m.groupId)), isNotNull(schema.dares.creatorSignature)))
    .groupBy(schema.publicQuestions.gameId, schema.dares.groupId);
  const groupIds = Array.from(new Set(rows.map((r) => r.groupId)));
  const [groups, members] = await Promise.all([groupIds.length ? db.select().from(schema.groups).where(inArray(schema.groups.id, groupIds)) : Promise.resolve([]), membersOfGroups(groupIds)]);
  const labelOf = new Map(groups.map((g) => [g.id, setLabel({ name: g.name, isDyad: g.isDyad, memberNames: (members.get(g.id) ?? []).filter((m) => m.userId).map((m) => m.displayName), viewerName })]));
  for (const r of rows) {
    const at = r.lastAt instanceof Date ? r.lastAt : new Date(String(r.lastAt));
    out.set(r.gameId, [...(out.get(r.gameId) ?? []), { groupId: r.groupId, label: labelOf.get(r.groupId) ?? "your friends", lastAt: at }]);
  }
  for (const list of out.values()) list.sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
  return out;
}

/** What the tab lists (docs/design.md 3.32): most asked over the schedule by day, with this viewer's own use on each row and the feed's state. */
export async function whatsOn(viewer: { id: string; displayName: string }, now: Date, zone: string): Promise<WhatsOn> {
  const [games, reads] = await Promise.all([upcomingGames(now), db.select().from(schema.sportsFeedReads).where(eq(schema.sportsFeedReads.source, "espn"))]);
  const gameIds = games.map((g) => g.id);
  const [templates, counts, yours] = await Promise.all([
    gameIds.length ? db.select().from(schema.publicQuestions).where(inArray(schema.publicQuestions.gameId, gameIds)).orderBy(asc(schema.publicQuestions.sort)) : Promise.resolve([]),
    gameUseCounts(gameIds),
    yoursOnGames(gameIds, viewer.id, viewer.displayName),
  ]);
  const listed: ListedGame[] = games.map((game) => {
    const n = counts.get(game.id) ?? 0;
    return { game, templates: templates.filter((t) => t.gameId === game.id), asked: n >= MOST_ASKED_FLOOR ? n : null, yours: yours.get(game.id) ?? [] };
  });
  const mostAsked = listed.filter((g) => g.asked !== null).sort((a, b) => (b.asked ?? 0) - (a.asked ?? 0) || a.game.startsAt.getTime() - b.game.startsAt.getTime()).slice(0, MOST_ASKED_MAX);
  const days: WhatsOn["days"] = [];
  for (const g of listed) {
    const label = g.game.startsAt.toLocaleDateString("en-US", { timeZone: zone, weekday: "long", month: "short", day: "numeric" });
    const day = days.find((d) => d.label === label);
    if (day) day.games.push(g);
    else days.push({ label, games: [g] });
  }
  const lastOkAt = reads.reduce<Date | null>((m, r) => (r.lastOkAt && (m === null || r.lastOkAt > m) ? r.lastOkAt : m), null);
  const failing = reads.length > 0 && reads.every((r) => r.lastErrorAt !== null && (r.lastOkAt === null || r.lastErrorAt > r.lastOkAt));
  return { mostAsked, days, feed: { lastOkAt, failing } };
}

/** The starters on an empty Now (docs/design.md 3.14): the most asked, or the next to close while there is too little to rank on. Three, or none. */
export async function starterGames(now: Date): Promise<GameRow[]> {
  const games = await upcomingGames(now);
  if (games.length === 0) return [];
  const counts = await gameUseCounts(games.map((g) => g.id));
  const ranked = games.filter((g) => (counts.get(g.id) ?? 0) >= MOST_ASKED_FLOOR).sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
  return (ranked.length >= 3 ? ranked : games).slice(0, 3);
}

// -------------------------------------------------------------------------------------- the game page's data

export async function gameById(id: string): Promise<{ game: GameRow; templates: TemplateRow[] } | null> {
  const [game] = await db.select().from(schema.sportsGames).where(eq(schema.sportsGames.id, id)).limit(1);
  if (!game) return null;
  const templates = await db.select().from(schema.publicQuestions).where(eq(schema.publicQuestions.gameId, id)).orderBy(asc(schema.publicQuestions.sort));
  return { game, templates };
}

/** The sets of people this viewer is in with anything started on a game, most recent first: whose page it is (3.33). */
export async function gameGroupsFor(gameId: string, viewer: { id: string; displayName: string }): Promise<Array<{ groupId: string; label: string; unnamed: boolean; lastAt: Date }>> {
  const yours = (await yoursOnGames([gameId], viewer.id, viewer.displayName)).get(gameId) ?? [];
  if (yours.length === 0) return [];
  const groups = await db.select({ id: schema.groups.id, name: schema.groups.name, isDyad: schema.groups.isDyad }).from(schema.groups).where(inArray(schema.groups.id, yours.map((y) => y.groupId)));
  return yours.map((y) => ({ ...y, unnamed: ((g) => g !== undefined && g.name === null && !g.isDyad)(groups.find((g) => g.id === y.groupId)) }));
}

/** The questions one set of people is running on a game, in the menu's order, with their templates. */
export async function gameMarkets(gameId: string, groupId: string): Promise<Array<{ dare: DareRow; template: TemplateRow }>> {
  const rows = await db
    .select({ dare: schema.dares, template: schema.publicQuestions })
    .from(schema.dares)
    .innerJoin(schema.publicQuestions, eq(schema.publicQuestions.id, schema.dares.templateId))
    .where(and(eq(schema.publicQuestions.gameId, gameId), eq(schema.dares.groupId, groupId)))
    .orderBy(asc(schema.publicQuestions.sort), desc(schema.dares.createdAt));
  // One per question: the latest opened one, and a draft only beside nothing opened for that key.
  const out: Array<{ dare: DareRow; template: TemplateRow }> = [];
  for (const r of rows) {
    const have = out.find((x) => x.template.key === r.template.key);
    if (!have) out.push(r);
    else if (!have.dare.creatorSignature && r.dare.creatorSignature) out[out.indexOf(have)] = r;
  }
  return out;
}

/**
 * Starting a game (docs/design.md 3.33): one ordinary market per chosen question, all with the same people, all
 * closing at kickoff, drafted in the menu's order. The asker signs each `Create` next; until then each is a draft
 * only they can see. Refuses a question already running for these people, so "Add another" never doubles one.
 */
export async function startGame(input: { gameId: string; keys: TemplateKey[]; creatorId: string; groupId: string; denomId: string; zone: string | null; blind?: boolean }): Promise<DareRow[]> {
  const found = await gameById(input.gameId);
  if (!found) throw new MarketError("That game isn't on any more.", "not_found");
  const wanted = found.templates.filter((t) => input.keys.includes(t.key as TemplateKey));
  if (wanted.length === 0) throw new MarketError("Pick at least one question.", "bad_input");
  const running = await gameMarkets(input.gameId, input.groupId);
  const out: DareRow[] = [];
  for (const t of wanted) {
    const already = running.find((r) => r.template.key === t.key && r.dare.creatorSignature);
    if (already) throw new MarketError(`${templatesFor({ sport: found.game.sport as Sport, home: { short: found.game.homeShort }, away: { short: found.game.awayShort }, seasonType: found.game.seasonType }).find((x) => x.key === t.key)?.name ?? "That one"} is already running with these people.`, "wrong_state");
    const d = await draftFromTemplate({ templateId: t.id, creatorId: input.creatorId, groupId: input.groupId, denomId: input.denomId, zone: input.zone });
    if (input.blind) await db.update(schema.dares).set({ revealMode: "blind" }).where(eq(schema.dares.id, d.id));
    out.push(input.blind ? { ...d, revealMode: "blind" } : d);
  }
  return out;
}

/** Which game and set of people each of these markets belongs to, for the one row a game gets on Now and the one story in a timeline (4.7, 3.4). */
export async function gamesOfMarkets(dareIds: string[]): Promise<Map<string, { game: GameRow; template: TemplateRow }>> {
  const out = new Map<string, { game: GameRow; template: TemplateRow }>();
  if (dareIds.length === 0) return out;
  const rows = await db
    .select({ dareId: schema.dares.id, template: schema.publicQuestions, game: schema.sportsGames })
    .from(schema.dares)
    .innerJoin(schema.publicQuestions, eq(schema.publicQuestions.id, schema.dares.templateId))
    .innerJoin(schema.sportsGames, eq(schema.sportsGames.id, schema.publicQuestions.gameId))
    .where(inArray(schema.dares.id, dareIds));
  for (const r of rows) out.set(r.dareId, { game: r.game, template: r.template });
  return out;
}
