/**
 * The app's ruling on an argument, after it is shown (the touch-ups round, section 2; docs/design.md 3.24 as amended
 * 2026-10-08). Agreeing is the default: a tap, by anyone in it, a guest included, with no signature, since everyone in
 * agreed at entry, in the terms they signed, that the app's ruling settles it unless someone in it sees it differently.
 * Everyone in agreeing settles it at once; a day of silence after it is shown settles it too. Seeing it differently
 * takes what the ruling got wrong, required, and sends it with the ruling to the tiebreaker, whose ruling settles it,
 * with the burden on whoever disputes. Silence agrees for the app's rulings only: a person's claim of what happened
 * still needs the people in, since silence would let whoever claims first win.
 */
import { and, asc, eq, isNotNull, isNull, lte, sql, type SQL } from "drizzle-orm";
import type { Hex } from "viem";
import { db, schema } from "@/db";
import { contracts } from "@/lib/chain/contracts";
import { gasFor } from "@/lib/chain/gas";
import { SendPending, submit } from "@/lib/chain/relayer";
import { bufferToHex } from "./ids";
import { answersOf, marketById, MarketError, mirrorSettlement, positionsOf, reconcileFromIndexer, settlementFromReceipt, stateOf, toChainOutcome, VOID_OUTCOME, type DareRow } from "./markets";
import { pidOf } from "./participants";
import { isProvisional, settleProvisional } from "./provisional";
import { sealedText } from "./seal";
import type { Sayer } from "./calls";
import { rulingHash } from "./settle";

/** How long a shown ruling waits before silence agrees with it. */
export const SILENCE_MS = 24 * 3_600_000;

/** What someone in it says the ruling got wrong: required, and the length the table keeps. */
export const DISPUTE_MIN = 2;
export const DISPUTE_MAX = 400;

const whoIs = (who: Sayer) => ("userId" in who ? { userId: who.userId } : { claimId: who.claimId });
const sameAs = (row: { userId: string | null; claimId: string | null }, who: Sayer) => ("userId" in who ? row.userId === who.userId : row.claimId === who.claimId);

/** The ruling's text exactly as it is recorded and hashed when it stands: the verdict on its line, then the reasons, as a sealed one was sealed. Pure. */
export function rulingTextOf(d: Pick<DareRow, "aiOutcome" | "aiRationale" | "kind" | "outcomeLabels">): string {
  return sealedText(d.aiOutcome ?? VOID_OUTCOME, d.aiRationale ?? "", d.kind === "categorical" ? d.outcomeLabels : null);
}

/** Whether every one of the people in agreed with the ruling as it stands now; an agreement with an earlier ruling counts for nothing. Pure. */
export function everyoneAgreed(inIt: readonly string[], agreements: ReadonlyArray<{ pid: string; outcome: bigint }>, outcome: bigint): boolean {
  if (inIt.length === 0) return false;
  const agreed = new Set(agreements.filter((a) => a.outcome === outcome).map((a) => a.pid));
  return inIt.every((p) => agreed.has(p));
}

/** Whether silence settles a shown ruling now: a day since it was shown, nobody seeing it differently, and nothing decided. Pure. */
export function silenceSettles(input: { revealedAt: Date | null; disputes: number; resolved: boolean; now: Date }): boolean {
  return !input.resolved && input.disputes === 0 && input.revealedAt !== null && input.now.getTime() - input.revealedAt.getTime() >= SILENCE_MS;
}

/** Where an argument stands after its close, for its header and its sheet: never "It's happened", since nothing happens. */
export type RulingStage = "asking" | "weighing" | "ruled" | "tiebreaker";
/** Pure. `said` is how many have said what happened; `weighing` is the ruling being written now. */
export function rulingStage(input: { ruled: boolean; disputes: number; settledBy: string | null; said: number; weighing: boolean }): RulingStage {
  if (input.disputes > 0) return "tiebreaker";
  if (input.ruled) return "ruled";
  if (input.weighing || input.settledBy !== "evidence" || input.said > 0) return "weighing";
  return "asking";
}
/** The header's words for each stage (3.24 as amended 2026-10-08). */
export const STAGE_WORDS: Record<RulingStage, string> = { asking: "Say what happened", weighing: "Being weighed", ruled: "The app has ruled", tiebreaker: "With the tiebreaker" };

/** The agreements and disputes on a question, by participant. */
export async function agreementsOf(dareId: string): Promise<Array<{ pid: string; outcome: bigint; agreedAt: Date }>> {
  const rows = await db.select().from(schema.dareAgreements).where(eq(schema.dareAgreements.dareId, dareId)).orderBy(asc(schema.dareAgreements.agreedAt));
  return rows.map((r) => ({ pid: (r.userId ?? r.claimId) as string, outcome: r.outcome, agreedAt: r.agreedAt }));
}
export async function disputesOf(dareId: string): Promise<Array<{ pid: string; userId: string | null; text: string; disputedAt: Date }>> {
  const rows = await db.select().from(schema.dareDisputes).where(eq(schema.dareDisputes.dareId, dareId)).orderBy(asc(schema.dareDisputes.disputedAt));
  return rows.map((r) => ({ pid: (r.userId ?? r.claimId) as string, userId: r.userId, text: r.text, disputedAt: r.disputedAt }));
}

/** A ruling someone may answer: an argument, closed, its ruling shown, nothing decided, and the person in it. */
async function answerable(dareId: string, who: Sayer): Promise<DareRow> {
  const d = await marketById(dareId);
  if (!d) throw new MarketError("That one doesn't exist.", "not_found");
  if (d.pace !== "argument" || d.stalemate !== "arbitrate") throw new MarketError("There’s no ruling to agree with on this one.", "wrong_state");
  if (stateOf(d) !== "locked") throw new MarketError(d.resolvedAt ? "It's already decided." : "It isn’t closed yet.", "wrong_state");
  if (d.aiOutcome === null || !d.aiProposedAt) throw new MarketError("The app is still weighing it up.", "wrong_state");
  if (!(await positionsOf(d.id)).some((p) => sameAs(p, who))) throw new MarketError("Only the people in it can say that.", "not_member");
  return d;
}

/** Agree with the app's ruling: a tap, and the last one of everyone in it settles it at once. Answered as done when said again. */
export async function agreeWithRuling(dareId: string, who: Sayer, now: Date = new Date()): Promise<{ settled: boolean }> {
  const d = await answerable(dareId, who);
  if ((await disputesOf(d.id)).length > 0) throw new MarketError("Someone sees it differently, so the tiebreaker is deciding it.", "wrong_state");
  const outcome = d.aiOutcome as bigint;
  // One per person, and an agreement with an earlier ruling is replaced by this one.
  await db.delete(schema.dareAgreements).where(and(eq(schema.dareAgreements.dareId, d.id), "userId" in who ? eq(schema.dareAgreements.userId, who.userId) : eq(schema.dareAgreements.claimId, who.claimId)));
  await db.insert(schema.dareAgreements).values({ dareId: d.id, ...whoIs(who), outcome, agreedAt: now });
  const inIt = (await positionsOf(d.id)).map((p) => pidOf(p));
  if (!everyoneAgreed(inIt, await agreementsOf(d.id), outcome)) return { settled: false };
  await standRuling(d, "agreed");
  return { settled: true };
}

/** See it differently: what the ruling got wrong, required. The caller sends it to the tiebreaker once it is kept. */
export async function disputeRuling(dareId: string, who: Sayer, text: string, now: Date = new Date()): Promise<DareRow> {
  const d = await answerable(dareId, who);
  const said = text.trim().replace(/\s+/g, " ");
  if (said.length < DISPUTE_MIN) throw new MarketError("Say what it got wrong.", "bad_input");
  await db
    .insert(schema.dareDisputes)
    .values({ dareId: d.id, ...whoIs(who), text: said.slice(0, DISPUTE_MAX), disputedAt: now })
    .onConflictDoUpdate({ target: "userId" in who ? [schema.dareDisputes.dareId, schema.dareDisputes.userId] : [schema.dareDisputes.dareId, schema.dareDisputes.claimId], targetWhere: "userId" in who ? sql`${schema.dareDisputes.userId} is not null` : sql`${schema.dareDisputes.claimId} is not null`, set: { text: said.slice(0, DISPUTE_MAX), disputedAt: now } });
  // Disputing withdraws this person's agreement, if they had given one.
  await db.delete(schema.dareAgreements).where(and(eq(schema.dareAgreements.dareId, d.id), "userId" in who ? eq(schema.dareAgreements.userId, who.userId) : eq(schema.dareAgreements.claimId, who.claimId)));
  return d;
}

/**
 * The app's ruling stands, as everyone agreed at entry it would: everyone in agreed, or a day passed and nobody saw it
 * differently. On the chain it is recorded through `arbitrate` with the ruling's hash, as the tiebreaker's is, and
 * mirrored as `ruling`; on a question decided here it settles as proposals. Idempotent.
 */
export async function standRuling(d: DareRow, how: "agreed" | "silence"): Promise<void> {
  if (d.resolvedAt || d.aiOutcome === null) return;
  const outcome = d.aiOutcome;
  const voided = outcome === VOID_OUTCOME;
  const text = rulingTextOf(d);
  const hash = rulingHash(text);
  const positions = await positionsOf(d.id);
  if (isProvisional(d)) {
    await settleProvisional(d, positions, outcome, { by: "ruling", rulingText: text, rulingHash: hash });
    return;
  }
  if (!d.onchainId) throw new MarketError("It isn't on the chain yet.", "wrong_state");
  const { dares } = contracts();
  let result;
  try {
    result = await submit({
      label: `the app's ruling stands on ${d.id}`,
      address: dares.address,
      abi: dares.abi,
      functionName: "arbitrate",
      args: [bufferToHex(d.onchainId), voided ? 0n : toChainOutcome(outcome), voided, hash as Hex],
      gas: voided ? gasFor.arbitrateVoid() : gasFor.arbitrate(positions.length),
      write: { kind: "arbitrate", subject: { dareId: d.id, rulingText: text, rulingHash: hash, by: "ruling" } },
    });
  } catch (err) {
    if (err instanceof SendPending) throw err;
    if (await reconcileFromIndexer(d.id, { by: "ruling", rulingText: text, rulingHash: hash })) return;
    console.error("the app's ruling could not be recorded", { dareId: d.id, how, err: err instanceof Error ? err.message : err });
    throw new MarketError("The ruling stands, but recording it didn’t go through. Nothing changed.", "chain");
  }
  await mirrorSettlement(d, settlementFromReceipt(result, outcome), { by: "ruling", rulingText: text, rulingHash: hash });
}

/**
 * The tick's queue (the field round, 1.2's pattern: what cannot be acted on is left out in SQL): arguments whose shown
 * ruling a day of silence settles, oldest first, never one on its way to the chain, and never one someone disputed.
 */
export async function rulingsToStand(now: Date, mine: SQL | undefined, limit: number): Promise<Array<{ id: string }>> {
  const D = schema.dares;
  const disputed = sql`exists (select 1 from ${schema.dareDisputes} x where x.dare_id = ${D.id})`;
  return db
    .select({ id: D.id })
    .from(D)
    .where(and(mine, eq(D.pace, "argument"), eq(D.stalemate, "arbitrate"), isNotNull(D.lockedAt), isNull(D.resolvedAt), isNull(D.chainPendingAt), isNotNull(D.aiOutcome), lte(D.rulingRevealedAt, new Date(now.getTime() - SILENCE_MS)), sql`not ${disputed}`))
    .orderBy(asc(D.rulingRevealedAt))
    .limit(limit);
}

/**
 * An argument ruled before the round has no moment its ruling was shown: the round's first tick gives it one, once, so
 * a day of silence counts from when its people first could see the new rule, never from before it.
 */
export async function stampOldRulings(now: Date, mine: SQL | undefined): Promise<number> {
  const D = schema.dares;
  const rows = await db
    .update(D)
    .set({ rulingRevealedAt: now })
    .where(and(mine, eq(D.pace, "argument"), isNotNull(D.lockedAt), isNull(D.resolvedAt), isNotNull(D.aiProposedAt), isNotNull(D.aiOutcome), isNull(D.rulingRevealedAt)))
    .returning({ id: D.id });
  return rows.length;
}

/** The ruling's verdict in the question's own words, for the tiebreaker's prompt and the screen. */
export function verdictWords(d: Pick<DareRow, "kind" | "outcomeLabels" | "answerPeople" | "aiOutcome">): string {
  if (d.aiOutcome === null || d.aiOutcome === VOID_OUTCOME) return "the facts cannot settle it";
  const answers = answersOf(d);
  if (answers) return answers[Number(d.aiOutcome)]?.text ?? "one of the answers";
  return d.aiOutcome === 1n ? "yes" : "no";
}

/** How long a dispute waits for its tiebreaker before the tick asks again: the request that sent it may still be hearing it. */
export const HEAR_AGAIN_MS = 5 * 60_000;

/** Disputed arguments whose tiebreaker never answered, oldest first. */
export async function disputesToHear(now: Date, mine: SQL | undefined, limit: number): Promise<Array<{ id: string }>> {
  const D = schema.dares;
  const waiting = sql`exists (select 1 from ${schema.dareDisputes} x where x.dare_id = ${D.id} and x.disputed_at <= ${new Date(now.getTime() - HEAR_AGAIN_MS).toISOString()}::timestamptz)`;
  return db
    .select({ id: D.id })
    .from(D)
    .where(and(mine, eq(D.pace, "argument"), eq(D.stalemate, "arbitrate"), isNotNull(D.lockedAt), isNull(D.resolvedAt), isNull(D.chainPendingAt), waiting))
    .orderBy(asc(D.lockedAt))
    .limit(limit);
}
