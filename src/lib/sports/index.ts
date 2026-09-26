/**
 * What's on's data, driven from the tick and never while a person waits (docs/decisions.md, public markets): the
 * schedule a few days ahead, the questions written for each game, a final read after each game's expected end
 * until it is complete and once more to catch a correction, the proposal the final score puts on every locked
 * question it answers, and the backstop with its three endings once nobody has voted. Every job here is
 * idempotent, scoped in tests to the markets they made, and reachable again next minute if it fails.
 */
import { and, asc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { keccak256, stringToHex, type Hex } from "viem";
import { db, schema } from "@/db";
import { contracts } from "@/lib/chain/contracts";
import { gasFor } from "@/lib/chain/gas";
import { submit } from "@/lib/chain/relayer";
import { bufferToHex } from "@/lib/ledger/ids";
import { marketById, MarketError, mirrorSettlement, positionsOf, reconcileFromIndexer, settlementFromReceipt, stateOf, toChainOutcome, VOID_OUTCOME, type DareRow } from "@/lib/ledger/markets";
import { balldontlie } from "./balldontlie";
import { espn, resultOf } from "./espn";
import { AGREE_AFTER_MS, backstopDecision, CONFIRM_AFTER_MS, outcomeFor, scoreLine, type Backstop } from "./results";
import { expectedEnd, gameName, templatesFor } from "./templates";
import { dayOf, SPORTS, type CheckSource, type FeedGame, type FinalScore, type ScheduleSource, type Sport } from "./types";

export type GameRow = typeof schema.sportsGames.$inferSelect;
export type TemplateRow = typeof schema.publicQuestions.$inferSelect;

/** How far ahead the schedule is read, and how often each sport's is refreshed. */
export const SYNC_DAYS = 5;
export const SYNC_EVERY_MS = 30 * 60_000;
/** How often a game past its expected end is read for a final, until it is complete. */
export const POLL_EVERY_MS = 10 * 60_000;
/** How many backstop settlements one tick may send: each is a chain transaction of its own. */
export const BACKSTOP_PER_TICK = 2;

export type SportsReport = { synced: Sport[]; polled: string[]; proposed: string[]; settled: string[]; voided: string[]; failed: Array<{ id: string; what: string; why: string }> };

const finalOfRow = (g: Pick<GameRow, "homeScore" | "awayScore" | "finalSeenAt">): FinalScore | null => (g.finalSeenAt && g.homeScore !== null && g.awayScore !== null ? { home: g.homeScore, away: g.awayScore } : null);

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
    awayId: g.away.id,
    awayAbbr: g.away.abbr,
    awayName: g.away.name,
    awayShort: g.away.short,
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
      const values = { gameId: row.id, key: t.key, kind: t.kind, title: t.title, termsText: t.terms, outcomeLabels: t.outcomeLabels, range: t.range, typical: t.typical, shift: t.shift, decidedByScore: t.decidedByScore, outcomeWords: t.outcomeWords, sort: t.sort };
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
    .where(and(inArray(schema.publicQuestions.gameId, gameIds), isNotNull(schema.dares.creatorSignature), onlyIds ? inArray(schema.dares.id, onlyIds.length ? onlyIds : ["00000000-0000-4000-8000-000000000000"]) : undefined));
  return rows.map((r) => ({ ...r.dare, template: r.template }));
}

/** The games worth a read: past their expected end and not complete, or complete once and due their confirmation re-read; only games a question rides on. */
export async function gamesToPoll(now: Date, onlyIds?: string[]): Promise<GameRow[]> {
  const ridden = await db
    .selectDistinct({ gameId: schema.publicQuestions.gameId })
    .from(schema.dares)
    .innerJoin(schema.publicQuestions, eq(schema.publicQuestions.id, schema.dares.templateId))
    .where(and(isNotNull(schema.dares.creatorSignature), isNull(schema.dares.resolvedAt), onlyIds ? inArray(schema.dares.id, onlyIds.length ? onlyIds : ["00000000-0000-4000-8000-000000000000"]) : undefined));
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

/** The score's proposal on every locked, undecided question the final answers (3.35): follows the feed until the quorum is reached. */
export async function proposeFor(game: GameRow, now: Date, onlyIds?: string[]): Promise<string[]> {
  const final = finalOfRow(game);
  if (!final) return [];
  const out: string[] = [];
  for (const d of await marketsOnGames([game.id], onlyIds)) {
    if (stateOf(d) !== "locked" || !d.template.decidedByScore) continue;
    const scored = outcomeFor(d.template, final);
    if (!scored) continue;
    if (d.feedOutcome === scored.outcome) continue;
    await db.update(schema.dares).set({ feedOutcome: scored.outcome, feedOutcomeAt: now }).where(and(eq(schema.dares.id, d.id), isNull(schema.dares.resolvedAt)));
    out.push(d.id);
  }
  return out;
}

/** The ruling the chain carries for a feed settlement: the same words on every screen. */
export const FEED_RULING = "Decided by the final score, as the terms said.";
export function feedRulingText(final: FinalScore, home: string, away: string, how: "settle" | "tie" | "conflict"): string {
  if (how === "conflict") return `The two scoreboards reported different finals, so the final score could not settle it and nothing changes hands.`;
  if (how === "tie") return `A tie: ${scoreLine(final, home, away)}. The final score could not settle a tie, so nothing changes hands.`;
  return `${FEED_RULING} ${scoreLine(final, home, away)}.`;
}

/**
 * The final score settling a market nobody voted on, the way everyone agreed at entry: recorded on the chain
 * through `arbitrate` with the ruling's hash, as an arbitration is, and mirrored as `feed`, which is counted
 * clean and never a void against anyone. A tie the contract cannot score, or two finals that disagree, voids the
 * same way, with the ruling saying which.
 */
export async function settleByFeed(d: DareRow, template: TemplateRow, game: GameRow, decision: Backstop, now: Date): Promise<{ txHash: Hex; voided: boolean }> {
  if (decision.act === "wait") throw new MarketError("not yet", "wrong_state");
  if (stateOf(d) !== "locked" || !d.onchainId) throw new MarketError("It isn't waiting on the final score.", "wrong_state");
  if (d.stalemate !== "arbitrate") throw new MarketError("The final score can only settle a question whose tiebreaker it is.", "wrong_state");
  const final = decision.act === "settle" ? decision.final : finalOfRow(game);
  if (!final) throw new MarketError("no final to settle on", "wrong_state");
  const scored = decision.act === "settle" ? outcomeFor(template, final) : null;
  const voided = decision.act === "void" || scored === null || scored.tie;
  const outcome = voided ? VOID_OUTCOME : (scored as NonNullable<typeof scored>).outcome;
  const text = feedRulingText(final, game.homeShort, game.awayShort, decision.act === "void" ? "conflict" : voided ? "tie" : "settle");
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
    throw new MarketError(`The final score is in, but recording it didn't go through. Nothing changed. (${err instanceof Error ? (err.message.split("\n")[0] ?? "") : "unknown"})`, "chain");
  }
  await mirrorSettlement(d, settlementFromReceipt(result, outcome), { by: "feed", rulingText: text, rulingHash: hash });
  void now;
  return { txHash: result.hash, voided };
}

/**
 * The backstop, once a final has stood a day: asks the second source once, then settles, voids or waits by the
 * pure decision, at most a couple of markets a tick. The second source is asked again at the three-day mark
 * for a game it had nothing on, in case it was only late.
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
    .where(and(isNotNull(schema.dares.lockedAt), isNull(schema.dares.resolvedAt), eq(schema.dares.stalemate, "arbitrate"), eq(schema.publicQuestions.decidedByScore, true), isNotNull(schema.sportsGames.finalSeenAt), lt(schema.sportsGames.finalSeenAt, dueBy), opts.onlyIds ? inArray(schema.dares.id, opts.onlyIds.length ? opts.onlyIds : ["00000000-0000-4000-8000-000000000000"]) : undefined))
    .orderBy(asc(schema.sportsGames.finalSeenAt))
    .limit(opts.limit ?? BACKSTOP_PER_TICK);
  const checked = new Map<string, FinalScore | null>();
  for (const { dare, template, game } of rows) {
    try {
      const final = finalOfRow(game);
      if (!final) continue;
      // The second source, once per game per tick, kept on the row; asked again past three days if it had nothing.
      let second: FinalScore | null = game.checkHomeScore !== null && game.checkAwayScore !== null ? { home: game.checkHomeScore, away: game.checkAwayScore } : null;
      const askAgain = second === null && (game.checkedAt === null || now.getTime() - game.finalSeenAt!.getTime() >= 72 * 3_600_000) && !checked.has(game.id);
      if (askAgain) {
        second = await check.finalOf({ sport: game.sport as Sport, startsAt: game.startsAt, homeAbbr: game.homeAbbr, awayAbbr: game.awayAbbr }).catch((err: unknown) => {
          console.error("the second source could not be read", { gameId: game.id, err: err instanceof Error ? err.message : err });
          return null;
        });
        checked.set(game.id, second);
        await db.update(schema.sportsGames).set({ checkHomeScore: second?.home ?? null, checkAwayScore: second?.away ?? null, checkedAt: now }).where(eq(schema.sportsGames.id, game.id));
      } else if (checked.has(game.id)) second = checked.get(game.id) ?? null;
      const decision = backstopDecision({ finalSeenAt: game.finalSeenAt!, confirmedAt: game.finalConfirmedAt, final, check: second, now });
      if (decision.act === "wait") continue;
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

/** Everything the tick does for What's on, in order: one sport's schedule when due, the finals, the proposals, the backstop. */
export async function sportsTick(now: Date, opts: { schedule?: ScheduleSource; check?: CheckSource; onlyIds?: string[]; sync?: boolean } = {}): Promise<SportsReport> {
  const report: SportsReport = { synced: [], polled: [], proposed: [], settled: [], voided: [], failed: [] };
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
