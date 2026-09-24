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
import { and, asc, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { keccak256, stringToHex, type Hex } from "viem";
import { db, schema } from "@/db";
import { arbitrate as askArbitrator, ruleClaim } from "@/lib/ai/settler";
import { contracts } from "@/lib/chain/contracts";
import { gasFor } from "@/lib/chain/gas";
import { submit } from "@/lib/chain/relayer";
import { bufferToHex } from "./ids";
import { isMember } from "./groups";
import { lockMarket, marketById, MarketError, mirrorSettlement, positionsOf, reconcileFromIndexer, settlementFromReceipt, stateOf, toChainOutcome, VOID_OUTCOME, votesOf, type DareRow } from "./markets";

/** If nobody presses, the scheduler hears a deadlock this long after the question was due (or locked, if later). */
export const ARBITRATION_BACKSTOP_MS = 24 * 3_600_000;

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
  if (stateOf(d) !== "locked" || d.stalemate !== "arbitrate" || !d.onchainId) return false;
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
export async function arbitrateMarket(dareId: string, byUserId: string | null, now: Date = new Date()): Promise<{ outcome: "yes" | "no" | "void"; txHash: Hex }> {
  const d = await marketById(dareId);
  if (!d) throw new MarketError("That one doesn't exist.", "not_found");
  if (d.resolvedAt) throw new MarketError("It's already decided.", "wrong_state");
  if (!arbitrationOpen(d, now) || !d.onchainId) throw new MarketError(d.stalemate !== "arbitrate" ? "This one was set to go unsettled if nobody agrees." : "It isn't time for that yet. The group gets to call it first.", "wrong_state");
  const positions = await positionsOf(d.id);
  if (byUserId !== null && !positions.some((p) => p.userId === byUserId)) throw new MarketError("Only someone who's in it can ask.", "not_member");

  const [said, users] = await Promise.all([
    db.select().from(schema.dareStatements).where(eq(schema.dareStatements.dareId, d.id)).orderBy(asc(schema.dareStatements.statedAt)),
    db.select({ id: schema.users.id, displayName: schema.users.displayName }).from(schema.users).where(inArray(schema.users.id, positions.map((p) => p.userId as string))),
  ]);
  const nameOf = (id: string) => users.find((u) => u.id === id)?.displayName.split(/\s+/)[0] ?? "Someone";
  const ruling = await askArbitrator({
    title: d.title,
    terms: d.termsText,
    positions: positions.map((p) => ({ name: nameOf(p.userId as string), percent: Math.round(Number(p.value) / 100) })),
    updates: said.filter((s) => s.kind === "update").map((s) => ({ name: nameOf(s.userId), said: s.statement })),
    statements: said.filter((s) => s.kind === "statement").map((s) => ({ name: nameOf(s.userId), said: s.statement })),
  }).catch((err: unknown) => {
    console.error("the arbitrator did not answer", { dareId, err });
    throw new MarketError("The app couldn't hear it just now. Nothing changed. Try again in a minute.", "chain");
  });

  const voided = ruling.outcome === "cannot_decide";
  const outcome = voided ? VOID_OUTCOME : ruling.outcome === "yes" ? 1n : 0n;
  const hash = rulingHash(ruling.ruling);
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
    });
  } catch (err) {
    if (await reconcileFromIndexer(d.id)) throw new MarketError("It was decided while you were asking.", "wrong_state");
    throw new MarketError(`The ruling is written, but recording it didn't go through. Nothing changed. (${err instanceof Error ? (err.message.split("\n")[0] ?? "") : "unknown"})`, "chain");
  }
  await mirrorSettlement(d, settlementFromReceipt(result, outcome), { by: "arbitration", rulingText: ruling.ruling, rulingHash: hash });
  return { outcome: voided ? "void" : ruling.outcome === "yes" ? "yes" : "no", txHash: result.hash };
}

// --------------------------------------------------------------------------------------------------- expiry

/**
 * The void rule's end: `expire()`, silently. No outcome, nothing minted, no toll for anyone, and the question
 * stays in the timeline as unsettled. Anyone may call it onchain; here it is the scheduler, or whoever opens it.
 */
export async function expireMarket(dareId: string, now: Date = new Date()): Promise<boolean> {
  const d = await marketById(dareId);
  if (!d || stateOf(d) !== "locked" || d.stalemate !== "void" || !d.onchainId || !d.resolvesBy || d.resolvesBy.getTime() >= now.getTime()) return false;
  const { dares } = contracts();
  await submit({ label: `expire market ${d.id}`, address: dares.address, abi: dares.abi, functionName: "expire", args: [bufferToHex(d.onchainId)], gas: gasFor.expire() });
  await db.update(schema.dares).set({ resolvedBy: "expired", resolvedAt: now, resolvedOutcome: null }).where(and(eq(schema.dares.id, d.id), isNull(schema.dares.resolvedAt)));
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
    .where(and(eq(schema.dares.creatorId, creatorId), isNotNull(schema.dares.resolvedAt), inArray(schema.dares.resolvedBy, ["quorum", "arbitration"])));
  return { ended: rows.length, clean: rows.filter((r) => r.outcome !== VOID_OUTCOME).length };
}

// -------------------------------------------------------------------------------------------------- the tick

export type TickReport = { locked: string[]; notified: string[]; expired: string[]; arbitrated: string[]; failed: Array<{ id: string; what: string; why: string }> };

/**
 * Everything a timer has to drive, once a minute, idempotently (docs/decisions.md 2026-09-21). Each job is also
 * reachable without it (the asker's lock button, the "needs you" row, "let the app call it", opening an unsettled
 * question), so a missed tick delays and never breaks. One market's failure never stops the rest, and no two
 * resolutions ever share a transaction: each is its own `submit`.
 *
 * `notifyDeadline` is passed in so this module does not depend on the notification channels.
 */
export async function tick(now: Date, notifyDeadline: (dareId: string, creatorId: string) => Promise<void>, opts: { limit?: number; onlyIds?: string[] } = {}): Promise<TickReport> {
  const limit = opts.limit ?? 10;
  // Tests run against the real database, so a test names the questions it made and the tick touches nothing else.
  const mine = opts.onlyIds ? inArray(schema.dares.id, opts.onlyIds.length ? opts.onlyIds : ["00000000-0000-4000-8000-000000000000"]) : undefined;
  const report: TickReport = { locked: [], notified: [], expired: [], arbitrated: [], failed: [] };
  const attempt = async (id: string, what: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
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
      const votes = await votesOf(id);
      const leading = Math.max(0, ...Array.from(votes.reduce((m, v) => m.set(v.outcome.toString(), (m.get(v.outcome.toString()) ?? 0) + 1), new Map<string, number>()).values()));
      if (leading >= d.threshold) return;
      await arbitrateMarket(id, null, now);
      report.arbitrated.push(id);
    });
  }
  return report;
}

/** Whether this person may press "let the app call it" on this market right now. For the screen. */
export async function mayAskArbitrator(d: DareRow, userId: string, now: Date): Promise<boolean> {
  if (!arbitrationOpen(d, now)) return false;
  if (!(await isMember(d.groupId, userId))) return false;
  return (await positionsOf(d.id)).some((p) => p.userId === userId);
}
