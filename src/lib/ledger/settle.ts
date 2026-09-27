/**
 * The settler (PLANNING.md 8b, 8d): arguments, arbitration, expiry, and the one tick that drives everything a
 * timer has to drive. Two paces, one object: an argument is the same market, the same contract and the same
 * resolution path, with no waiting in it.
 *
 * Arbitration is honest for the reason an arbitration clause is: everyone agreed to the tiebreaker before knowing
 * which way it would cut. That consent is in every participant's entry signature (`stalemate` is a field of
 * `Enter`), which the contract checked at lock. This module never arbitrates a market whose rule is `void`, and
 * the contract would refuse it if it tried.
 */
import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { warningSendTime, type WarningFlavour } from "@/lib/notify/messages";
import { agree, AGREE_AFTER_MS, ALONE_AFTER_MS } from "@/lib/sports/results";
import type { CheckSource, FinalScore, Sport } from "@/lib/sports/types";
import { keccak256, stringToHex, type Hex } from "viem";
import { db, schema } from "@/db";
import { arbitrate as askArbitrator, arbitrateAnswer, arbitrateNumber, ruleClaim } from "@/lib/ai/settler";
import { contracts } from "@/lib/chain/contracts";
import { gasFor } from "@/lib/chain/gas";
import { SendPending, submit, writeInFlight } from "@/lib/chain/relayer";
import { evidenceFor } from "@/lib/media/evidence";
import { bufferToHex } from "./ids";
import { pidOf, participantsOf } from "./participants";
import { isProvisional, settleProvisional } from "./provisional";
import { isMember } from "./groups";
import { answersOf, lockMarket, marketById, MarketError, mirrorSettlement, positionsOf, reconcileFromIndexer, resolveFromVotes, settlementFromReceipt, stateOf, tally, toChainOutcome, unitOf, VOID_OUTCOME, votesOf, type DareRow } from "./markets";

/** If nobody presses, the scheduler hears a deadlock this long after the question was due (or locked, if later). */
export const ARBITRATION_BACKSTOP_MS = 24 * 3_600_000;
/** The one warning before a backstop acts goes this long before it (docs/decisions.md, public markets): never a second. */
export const BACKSTOP_WARNING_MS = 6 * 3_600_000;

/** Whether a market's tiebreaker is the feed rather than the model: a What's on question the final score or the play-by-play answers. */
export async function decidedByScore(d: Pick<DareRow, "templateId">): Promise<boolean> {
  if (!d.templateId) return false;
  const [t] = await db.select({ decidedByFeed: schema.publicQuestions.decidedByFeed }).from(schema.publicQuestions).where(eq(schema.publicQuestions.id, d.templateId)).limit(1);
  return t?.decidedByFeed === true;
}

// ------------------------------------------------------------------------------------------------ arguments

/** The side someone takes in an argument, as the number they sign. Full confidence by default, so the loser loses the whole stake. */
export const SIDE_BPS = { yes: 10_000n, no: 0n } as const;

/**
 * An argument skips open and locked: the moment its second person is in, it locks (the one chain write), it is
 * due. The caller then asks for the app's proposal without making anyone wait for it. Called after every entry; a no-op for a dare, for a first entry, and once locked.
 */
export async function afterEntry(dareId: string): Promise<{ locked: boolean }> {
  const d = await marketById(dareId);
  if (!d || d.pace !== "argument" || stateOf(d) !== "open") return { locked: false };
  const positions = await positionsOf(d.id);
  if (positions.length < 2) return { locked: false };
  await lockMarket(d.id, null);
  await db.update(schema.dares).set({ resolvesBy: new Date() }).where(and(eq(schema.dares.id, d.id), isNull(schema.dares.resolvesBy)));
  return { locked: true };
}

/** The immediate proposal. A model is never on the critical path: with no ruling the ballot simply opens with nothing picked. */
export async function proposeForArgument(dareId: string): Promise<void> {
  const d = await marketById(dareId);
  if (!d || d.pace !== "argument" || d.aiProposedAt || d.resolvedAt) return;
  const r = await ruleClaim({ title: d.title, terms: d.termsText, criterion: d.criterion });
  await db
    .update(schema.dares)
    .set({ aiOutcome: r.outcome === "yes" ? 1n : r.outcome === "no" ? 0n : VOID_OUTCOME, aiConfidenceBps: r.confidencePercent * 100, aiRationale: r.rationale, aiProposedAt: new Date() })
    .where(and(eq(schema.dares.id, d.id), isNull(schema.dares.aiProposedAt)));
}

// ---------------------------------------------------------------------------------------------- arbitration

/** One line of someone's case. A different kind from "what happened": the arbitrator is handed both, labelled. */
export async function stateCase(dareId: string, userId: string, text: string): Promise<void> {
  const d = await marketById(dareId);
  if (!d) throw new MarketError("That one doesn't exist.", "not_found");
  if (stateOf(d) !== "locked") throw new MarketError("It isn't waiting on an answer.", "wrong_state");
  if (d.stalemate !== "arbitrate") throw new MarketError("This one was set to go unsettled if nobody agrees, so there's no case to make.", "wrong_state");
  const positions = await positionsOf(d.id);
  // "Every participant may state their case": someone who is in it, not everyone who can see it.
  if (!positions.some((p) => p.userId === userId)) throw new MarketError("Only someone who's in it can make a case.", "not_member");
  const line = text.trim().slice(0, 280);
  if (line.length < 2) throw new MarketError("Say your case in a line.", "bad_input");
  await db
    .insert(schema.dareStatements)
    .values({ dareId, userId, kind: "statement", statement: line })
    .onConflictDoUpdate({ target: [schema.dareStatements.dareId, schema.dareStatements.userId, schema.dareStatements.kind], set: { statement: line, statedAt: new Date() } });
}

/** When the arbitrator may be asked: locked, under the arbitrate rule, and due. The contract checks the same three. */
export function arbitrationOpen(d: DareRow, now: Date): boolean {
  if (stateOf(d) !== "locked" || d.stalemate !== "arbitrate") return false;
  if (d.pace === "argument") return true;
  return d.resolvesBy !== null && d.resolvesBy.getTime() < now.getTime();
}

/** The exact bytes that are hashed onchain: the ruling and nothing else, so anyone can check it against `rulingHashOf`. */
export function rulingHash(rulingText: string): Hex {
  return keccak256(stringToHex(rulingText));
}

/**
 * Hears a deadlock. `byUserId` is whoever pressed (they must be in it), or null for the scheduler's backstop.
 * One transaction, which is this market's resolution and nobody else's. The written ruling is stored exactly as
 * hashed; a finding that the terms cannot decide it voids, and that void carries the toll.
 */
export async function arbitrateMarket(dareId: string, byUserId: string | null, now: Date = new Date()): Promise<{ outcome: "yes" | "no" | "void" | "number" | "answer"; number?: bigint; txHash: Hex }> {
  const d = await marketById(dareId);
  if (!d) throw new MarketError("That one doesn't exist.", "not_found");
  if (d.resolvedAt) throw new MarketError("It's already decided.", "wrong_state");
  if (!arbitrationOpen(d, now)) throw new MarketError(d.stalemate !== "arbitrate" ? "This one was set to go unsettled if nobody agrees." : "It isn't time for that yet. The group gets to call it first.", "wrong_state");
  // A What's on question the score answers has the final score as its tiebreaker, never the model (3.35).
  if (await decidedByScore(d)) throw new MarketError("The final score settles this one, the way everyone agreed at entry.", "wrong_state");
  const positions = await positionsOf(d.id);
  if (byUserId !== null && !positions.some((p) => p.userId === byUserId)) throw new MarketError("Only someone who's in it can ask.", "not_member");

  const [said, people] = await Promise.all([
    db.select().from(schema.dareStatements).where(eq(schema.dareStatements.dareId, d.id)).orderBy(asc(schema.dareStatements.statedAt)),
    participantsOf([...positions.map((p) => pidOf(p)), ...(await db.select({ userId: schema.dareStatements.userId }).from(schema.dareStatements).where(eq(schema.dareStatements.dareId, d.id))).map((s) => s.userId)]),
  ]);
  const nameOf = (id: string) => people.get(id)?.displayName.split(/\s+/)[0] ?? "Someone";
  const updates = said.filter((s) => s.kind === "update").map((s) => ({ name: nameOf(s.userId), said: s.statement }));
  const statements = said.filter((s) => s.kind === "statement").map((s) => ({ name: nameOf(s.userId), said: s.statement }));
  const unit = unitOf(d);
  const answers = answersOf(d);
  // Screenshots attached to what happened, each labelled with who supplied it: a claim by that person, weighed as one.
  const evidence = await evidenceFor(d.id).catch(() => []);
  const heard = await (answers
    ? // A pick-one question (3.30): the answer that happened, from the list the asker wrote, or that the terms do not decide it.
      arbitrateAnswer({ title: d.title, terms: d.termsText, answers: answers.map((a) => a.text), positions: positions.map((p) => ({ name: nameOf(pidOf(p)), answer: answers[Number(p.value)]?.text ?? "?" })), updates, statements, evidence }).then((r) => ({ voided: r.outcome === "cannot_decide" || r.answer === null || r.answer >= answers.length, outcome: r.outcome === "answer" && r.answer !== null && r.answer < answers.length ? BigInt(r.answer) : VOID_OUTCOME, ruling: r.ruling, word: "answer" as const }))
    : unit
    ? arbitrateNumber({ title: d.title, terms: d.termsText, unit, positions: positions.map((p) => ({ name: nameOf(pidOf(p)), number: p.value.toString() })), updates, statements, evidence }).then((r) => ({ voided: r.outcome === "cannot_decide" || r.number === null, outcome: r.outcome === "number" && r.number !== null ? BigInt(r.number) : VOID_OUTCOME, ruling: r.ruling, word: "number" as const }))
    : askArbitrator({ title: d.title, terms: d.termsText, positions: positions.map((p) => ({ name: nameOf(pidOf(p)), percent: Math.round(Number(p.value) / 100) })), updates, statements, evidence }).then((r) => ({ voided: r.outcome === "cannot_decide", outcome: r.outcome === "cannot_decide" ? VOID_OUTCOME : r.outcome === "yes" ? 1n : 0n, ruling: r.ruling, word: r.outcome === "yes" ? ("yes" as const) : ("no" as const) }))
  ).catch((err: unknown) => {
    console.error("the arbitrator did not answer", { dareId, err });
    throw new MarketError("The app couldn't hear it just now. Nothing changed. Try again in a minute.", "chain");
  });
  const ruling = { ruling: heard.ruling };
  const voided = heard.voided;
  const outcome = heard.outcome;
  const hash = rulingHash(ruling.ruling);
  if (isProvisional(d)) {
    // A provisional market: the ruling is recorded here and the transfers become proposals (PLANNING.md section 4).
    await settleProvisional(d, positions, voided ? VOID_OUTCOME : outcome, { by: "arbitration", rulingText: ruling.ruling, rulingHash: hash });
    return { outcome: voided ? "void" : heard.word, number: voided || (heard.word !== "number" && heard.word !== "answer") ? undefined : outcome, txHash: "0x" as Hex };
  }
  if (!d.onchainId) throw new MarketError("It isn't locked yet.", "wrong_state");
  const { dares } = contracts();
  let result;
  try {
    result = await submit({
      label: `arbitrate market ${d.id}`,
      address: dares.address,
      abi: dares.abi,
      functionName: "arbitrate",
      // The contract ignores `outcome` when voided; zero is sent so the call never carries the sentinel by accident.
      args: [bufferToHex(d.onchainId), voided ? 0n : toChainOutcome(outcome), voided, hash],
      gas: voided ? gasFor.arbitrateVoid() : gasFor.arbitrate(positions.length),
      write: { kind: "arbitrate", subject: { dareId: d.id, rulingText: ruling.ruling, rulingHash: hash }, actor: byUserId },
    });
  } catch (err) {
    if (err instanceof SendPending) throw err;
    if (await reconcileFromIndexer(d.id)) throw new MarketError("It was decided while you were asking.", "wrong_state");
    throw new MarketError(`The ruling is written, but recording it didn't go through. Nothing changed. (${err instanceof Error ? (err.message.split("\n")[0] ?? "") : "unknown"})`, "chain");
  }
  await mirrorSettlement(d, settlementFromReceipt(result, outcome), { by: "arbitration", rulingText: ruling.ruling, rulingHash: hash });
  return { outcome: voided ? "void" : heard.word, number: voided || (heard.word !== "number" && heard.word !== "answer") ? undefined : outcome, txHash: result.hash };
}

// --------------------------------------------------------------------------------------------------- expiry

/**
 * The void rule's end: `expire()`, silently. No outcome, nothing minted, no toll for anyone, and the question
 * stays in the timeline as unsettled. Anyone may call it onchain; here it is the scheduler, or whoever opens it.
 */
export async function expireMarket(dareId: string, now: Date = new Date()): Promise<boolean> {
  const d = await marketById(dareId);
  if (!d || stateOf(d) !== "locked" || d.stalemate !== "void" || !d.resolvesBy || d.resolvesBy.getTime() >= now.getTime()) return false;
  // A provisional market expires here alone: nothing of it is on the chain.
  if (isProvisional(d)) return completeExpire(d.id, now);
  if (!d.onchainId) return false;
  const { dares } = contracts();
  await submit({ label: `expire market ${d.id}`, address: dares.address, abi: dares.abi, functionName: "expire", args: [bufferToHex(d.onchainId)], gas: gasFor.expire(), write: { kind: "expire", subject: { dareId: d.id } } });
  await completeExpire(d.id, now);
  return true;
}

/** The mirror of an expiry once the chain has it, idempotent: no outcome, nothing minted, the question unsettled. */
export async function completeExpire(dareId: string, now: Date = new Date()): Promise<boolean> {
  await db.update(schema.dares).set({ resolvedBy: "expired", resolvedAt: now, resolvedOutcome: null }).where(and(eq(schema.dares.id, dareId), isNull(schema.dares.resolvedAt)));
  return true;
}

// ------------------------------------------------------------------------------------------------- the toll

/**
 * The clean-resolution rate (PLANNING.md 8e): of the questions someone asked that ended, how many ended with an
 * answer. A quorum's vote to void and an arbitrator's finding that the terms could not decide it both count
 * against whoever wrote the terms. Expiry counts against nobody and is not in either number.
 */
export async function cleanResolution(creatorId: string): Promise<{ ended: number; clean: number }> {
  const rows = await db
    .select({ outcome: schema.dares.resolvedOutcome, by: schema.dares.resolvedBy })
    .from(schema.dares)
    .where(and(eq(schema.dares.creatorId, creatorId), isNotNull(schema.dares.resolvedAt), inArray(schema.dares.resolvedBy, ["quorum", "arbitration", "feed"])));
  return cleanResolutionOf(rows);
}

/**
 * Pure: of the questions that ended by a quorum, by the tiebreaker or by the final score, how many ended with an
 * answer. A tie is a fine question with no loser (docs/decisions.md 2026-09-16; a pick-one question everyone
 * called, or nobody did, moves nothing and is still clean): only a void counts against whoever wrote the terms.
 * The final score settling one counts clean; the final score failing to (a tie the contract cannot score, or two
 * scoreboards that disagree) counts against nobody and is in neither number (docs/decisions.md, public markets).
 */
export function cleanResolutionOf(rows: ReadonlyArray<{ outcome: bigint | null; by?: string | null }>): { ended: number; clean: number } {
  const counted = rows.filter((r) => !(r.by === "feed" && r.outcome === VOID_OUTCOME));
  return { ended: counted.length, clean: counted.filter((r) => r.outcome !== VOID_OUTCOME).length };
}

// -------------------------------------------------------------------------------------------------- the tick

export type TickReport = { locked: string[]; /** Questions whose votes had already decided them and whose resolution the tick landed. */ resolved: string[]; notified: string[]; expired: string[]; arbitrated: string[]; warned: Array<{ id: string; flavour: WarningFlavour }>; failed: Array<{ id: string; what: string; why: string }> };
/** Which backstop a warning is about (docs/design.md 4.10): the final score, the two results disagreeing, the play-by-play, the tiebreaker everyone agreed to, or closing for good. */
export type BackstopFlavour = WarningFlavour;

/**
 * When a backstop will act on a question nobody has decided, and which one (docs/design.md 4.10): the tiebreaker
 * a day after it was due or locked, whichever is later (an argument, a day after it locked); the void rule at its
 * deadline; the final score a day after the final was seen when a second result exists (agreeing or not), else
 * three days after; the play-by-play three days after the first drive was read, or three days after the game
 * was complete when it could not say. Null while nothing is on its way. Pure, so the moments have tests.
 */
export function backstopMoment(input: { stalemate: string; pace: string; lockedAt: Date | null; resolvesBy: Date | null; template: { decidedByScore: boolean; decidedByFeed: boolean; key: string } | null; game: { finalSeenAt: Date | null; check: FinalScore | null; firstDriveSeenAt: Date | null; firstDriveResult: string | null } | null; final: FinalScore | null }): { flavour: WarningFlavour; actsAt: Date } | null {
  if (!input.lockedAt) return null;
  if (input.template?.decidedByFeed && input.game) {
    if (!input.game.finalSeenAt) return null;
    if (input.template.key === "first_drive") {
      const from = input.game.firstDriveResult ? input.game.firstDriveSeenAt : input.game.finalSeenAt;
      return from ? { flavour: "drive", actsAt: new Date(from.getTime() + ALONE_AFTER_MS) } : null;
    }
    if (input.game.check && input.final) return { flavour: agree(input.game.check, input.final) ? "score" : "score_conflict", actsAt: new Date(input.game.finalSeenAt.getTime() + AGREE_AFTER_MS) };
    return { flavour: "score", actsAt: new Date(input.game.finalSeenAt.getTime() + ALONE_AFTER_MS) };
  }
  if (input.stalemate === "void") return input.resolvesBy ? { flavour: "void", actsAt: input.resolvesBy } : null;
  if (input.pace === "argument") return { flavour: "tiebreaker", actsAt: new Date(input.lockedAt.getTime() + ARBITRATION_BACKSTOP_MS) };
  if (!input.resolvesBy) return null;
  return { flavour: "tiebreaker", actsAt: new Date(Math.max(input.lockedAt.getTime(), input.resolvesBy.getTime()) + ARBITRATION_BACKSTOP_MS) };
}

/**
 * Everything a timer has to drive, once a minute, idempotently (docs/decisions.md 2026-09-21). Each job is also
 * reachable without it (the asker's lock button, the "needs you" row, "let the app call it", opening an unsettled
 * question), so a missed tick delays and never breaks. One market's failure never stops the rest, and no two
 * resolutions ever share a transaction: each is its own `submit`.
 *
 * `notifyDeadline` is passed in so this module does not depend on the notification channels; `check` is the
 * second sports source, asked once at warning time so the warning can say which ending is coming.
 */
export async function tick(now: Date, notifyDeadline: (dareId: string, creatorId: string) => Promise<void>, opts: { limit?: number; onlyIds?: string[]; notifyWarning?: (dareId: string, flavour: WarningFlavour, actsAt: Date) => Promise<void>; check?: CheckSource } = {}): Promise<TickReport> {
  const limit = opts.limit ?? 10;
  // Tests run against the real database, so a test names the questions it made and the tick touches nothing else.
  const mine = opts.onlyIds ? inArray(schema.dares.id, opts.onlyIds.length ? opts.onlyIds : ["00000000-0000-4000-8000-000000000000"]) : undefined;
  const report: TickReport = { locked: [], resolved: [], notified: [], expired: [], arbitrated: [], warned: [], failed: [] };
  const attempt = async (id: string, what: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      // A send whose receipt outlives this tick is the reconciler's to finish (docs/decisions.md 2026-09-27), not a failed job.
      if (err instanceof SendPending) return;
      report.failed.push({ id, what, why: err instanceof Error ? (err.message.split("\n")[0] ?? "") : "unknown" });
    }
  };
  const due = lt(schema.dares.resolvesBy, now);

  // 1. A question whose time has come and that nobody locked: lock it, if two are in. (With fewer there is nothing to lock.)
  const toLock = await db.select({ id: schema.dares.id }).from(schema.dares).where(and(mine, eq(schema.dares.pace, "dare"), isNotNull(schema.dares.creatorSignature), isNull(schema.dares.lockedAt), isNull(schema.dares.resolvedAt), due)).limit(limit);
  for (const { id } of toLock) {
    await attempt(id, "lock", async () => {
      if ((await positionsOf(id)).length < 2) return;
      await lockMarket(id, null);
      report.locked.push(id);
    });
  }

  // 1b. A question whose votes already reached the threshold and whose resolution never landed (the send was dropped
  // after the last voter was told it was on its way, or their request failed past the vote): resolved again from the
  // signatures already there. Never while a send for it is in flight or mined and waiting on its mirror.
  const voted = await db
    .select({ id: schema.dares.id })
    .from(schema.dares)
    .innerJoin(schema.dareVotes, eq(schema.dareVotes.dareId, schema.dares.id))
    .where(and(mine, isNotNull(schema.dares.lockedAt), isNull(schema.dares.resolvedAt), isNotNull(schema.dares.onchainId)))
    .groupBy(schema.dares.id, schema.dares.threshold)
    .having(sql`count(*) >= ${schema.dares.threshold}`)
    .limit(limit);
  for (const { id } of voted) {
    await attempt(id, "finish resolution", async () => {
      const d = await marketById(id);
      if (!d || d.resolvedAt) return;
      const leading = tally(await votesOf(id))[0];
      if (!leading || leading.votes < d.threshold) return;
      if (await writeInFlight("resolve", { dareId: id })) return;
      if (await reconcileFromIndexer(id)) return;
      if ((await resolveFromVotes(d, null)).resolved) report.resolved.push(id);
    });
  }

  // 2. The asker hears that the time they set has come. Once: the consequence of their own act, not a reminder.
  const toTell = await db.select({ id: schema.dares.id, creatorId: schema.dares.creatorId }).from(schema.dares).where(and(mine, eq(schema.dares.pace, "dare"), isNotNull(schema.dares.lockedAt), isNull(schema.dares.resolvedAt), isNull(schema.dares.deadlineNotifiedAt), due)).limit(limit);
  for (const { id, creatorId } of toTell) {
    await attempt(id, "deadline notice", async () => {
      const [claimed] = await db.update(schema.dares).set({ deadlineNotifiedAt: now }).where(and(eq(schema.dares.id, id), isNull(schema.dares.deadlineNotifiedAt))).returning({ id: schema.dares.id });
      if (!claimed) return;
      await notifyDeadline(id, creatorId);
      report.notified.push(id);
    });
  }

  // 3. The void rule: expire, silently.
  const toExpire = await db.select({ id: schema.dares.id }).from(schema.dares).where(and(mine, eq(schema.dares.stalemate, "void"), isNotNull(schema.dares.lockedAt), isNull(schema.dares.resolvedAt), due)).limit(limit);
  for (const { id } of toExpire) await attempt(id, "expire", async () => void ((await expireMarket(id, now)) && report.expired.push(id)));

  // 4. The arbitrate rule, as a backstop only: the group, and then anyone in it who presses, get a day first.
  const cutoff = new Date(now.getTime() - ARBITRATION_BACKSTOP_MS);
  const toHear = await db
    .select({ id: schema.dares.id })
    .from(schema.dares)
    .where(and(mine, eq(schema.dares.stalemate, "arbitrate"), isNotNull(schema.dares.lockedAt), isNull(schema.dares.resolvedAt), lt(schema.dares.lockedAt, cutoff), or(lt(schema.dares.resolvesBy, cutoff), eq(schema.dares.pace, "argument"))))
    .limit(Math.min(limit, 3));
  for (const { id } of toHear) {
    await attempt(id, "arbitrate", async () => {
      if (await reconcileFromIndexer(id)) return;
      // Still worth a vote if the votes already there would decide it: never overrule a quorum that exists.
      const d = await marketById(id);
      if (!d) return;
      // A What's on question the feed answers is the feed's to settle (src/lib/sports), on the feed's own clocks.
      if (await decidedByScore(d)) return;
      const votes = await votesOf(id);
      const leading = Math.max(0, ...Array.from(votes.reduce((m, v) => m.set(v.outcome.toString(), (m.get(v.outcome.toString()) ?? 0) + 1), new Map<string, number>()).values()));
      if (leading >= d.threshold) return;
      await arbitrateMarket(id, null, now);
      report.arbitrated.push(id);
    });
  }

  // 5. One warning before a backstop acts, never a second (docs/design.md 4.10): six hours before the exact moment
  // it acts, moved to eight the evening before when that would land at night, and not at all when the votes already
  // cast would decide it. The candidates are everything locked and undecided whose moment could be within reach.
  if (opts.notifyWarning) {
    // Wide enough to hold the earliest a warning could go (six hours before, moved up to fourteen more by the overnight rule).
    const reach = new Date(now.getTime() - ARBITRATION_BACKSTOP_MS + BACKSTOP_WARNING_MS + 14 * 3_600_000);
    const toWarn = await db
      .select({ dare: schema.dares, template: schema.publicQuestions, game: schema.sportsGames })
      .from(schema.dares)
      .leftJoin(schema.publicQuestions, eq(schema.publicQuestions.id, schema.dares.templateId))
      .leftJoin(schema.sportsGames, eq(schema.sportsGames.id, schema.publicQuestions.gameId))
      .where(
        and(
          mine,
          isNotNull(schema.dares.lockedAt),
          isNull(schema.dares.resolvedAt),
          isNull(schema.dares.backstopWarnedAt),
          or(
            and(eq(schema.publicQuestions.decidedByFeed, true), isNotNull(schema.sportsGames.finalSeenAt), lt(schema.sportsGames.finalSeenAt, new Date(now.getTime() - AGREE_AFTER_MS + BACKSTOP_WARNING_MS + 14 * 3_600_000))),
            and(or(isNull(schema.publicQuestions.decidedByFeed), eq(schema.publicQuestions.decidedByFeed, false)), eq(schema.dares.stalemate, "arbitrate"), lt(schema.dares.lockedAt, reach), or(lt(schema.dares.resolvesBy, reach), eq(schema.dares.pace, "argument"))),
            and(eq(schema.dares.stalemate, "void"), isNotNull(schema.dares.resolvesBy), lt(schema.dares.resolvesBy, new Date(now.getTime() + BACKSTOP_WARNING_MS + 14 * 3_600_000)), gt(schema.dares.resolvesBy, now)),
          ),
        ),
      )
      .limit(limit);
    for (const { dare, template, game } of toWarn) {
      await attempt(dare.id, "warning", async () => {
        // The second source, asked once here for a question the score answers, so the warning can say which ending is coming; kept on the row for the backstop.
        let check: FinalScore | null = game && game.checkHomeScore !== null && game.checkAwayScore !== null ? { home: game.checkHomeScore, away: game.checkAwayScore } : null;
        const final = game && game.finalSeenAt && game.homeScore !== null && game.awayScore !== null ? { home: game.homeScore, away: game.awayScore } : null;
        if (game && template?.decidedByScore && final && check === null && game.checkedAt === null && opts.check) {
          check = await opts.check.finalOf({ sport: game.sport as Sport, startsAt: game.startsAt, homeAbbr: game.homeAbbr, awayAbbr: game.awayAbbr }).catch(() => null);
          await db.update(schema.sportsGames).set({ checkHomeScore: check?.home ?? null, checkAwayScore: check?.away ?? null, checkedAt: now }).where(eq(schema.sportsGames.id, game.id));
        }
        const moment = backstopMoment({ stalemate: dare.stalemate, pace: dare.pace, lockedAt: dare.lockedAt, resolvesBy: dare.resolvesBy, template: template ? { decidedByScore: template.decidedByScore, decidedByFeed: template.decidedByFeed, key: template.key } : null, game: game ? { finalSeenAt: game.finalSeenAt, check, firstDriveSeenAt: game.firstDriveSeenAt, firstDriveResult: game.firstDriveResult } : null, final });
        if (!moment || now.getTime() < warningSendTime(moment.actsAt, dare.zone ?? "UTC").getTime()) return;
        const [claimed] = await db.update(schema.dares).set({ backstopWarnedAt: now }).where(and(eq(schema.dares.id, dare.id), isNull(schema.dares.backstopWarnedAt))).returning({ id: schema.dares.id });
        if (!claimed) return;
        // Already past, or the votes cast would decide it: the backstop won't act for them, so nothing is sent (and never later).
        if (now.getTime() >= moment.actsAt.getTime()) return;
        const votes = await votesOf(dare.id);
        const leading = Math.max(0, ...Array.from(votes.reduce((m, v) => m.set(v.outcome.toString(), (m.get(v.outcome.toString()) ?? 0) + 1), new Map<string, number>()).values()));
        if (leading >= dare.threshold) return;
        await opts.notifyWarning!(dare.id, moment.flavour, moment.actsAt);
        report.warned.push({ id: dare.id, flavour: moment.flavour });
      });
    }
  }
  return report;
}

/** Whether this person may press "let the app call it" on this market right now. For the screen. */
export async function mayAskArbitrator(d: DareRow, userId: string, now: Date): Promise<boolean> {
  if (!arbitrationOpen(d, now)) return false;
  if (!(await isMember(d.groupId, userId))) return false;
  return (await positionsOf(d.id)).some((p) => p.userId === userId);
}
