/**
 * A provisional market (PLANNING.md section 4): a position nobody signed never reaches the chain, so a market
 * with a ghost in it, or with a position typed for someone, locks here, is voted on here by its account-holders
 * with the same governance signatures they would give the chain, is scored here by the same rule the contract
 * runs, and leaves one obligation proposal per transfer instead of one minted edge. An edge between two
 * account-holders is confirmed by its debtor through the ordinary confirm path; an edge with a ghost on it
 * waits for the ghost to bind. Nothing here binds anyone who has not signed.
 */
import { and, eq, isNull } from "drizzle-orm";
import type { Hex } from "viem";
import { db, schema } from "@/db";
import { denominationById } from "./denominations";
import { pidOf } from "./participants";
import { PICK_ONE_CONFIDENCE } from "./pick-one";
import { record } from "@/lib/usage";
import { settledWord } from "@/lib/usage/events";
import { BPS, nets, scoreBinary, scoreCategorical, scoreNumeric, settle, type ScoredPosition } from "./scoring";

type DareRow = typeof schema.dares.$inferSelect;
type PositionRow = typeof schema.darePositions.$inferSelect;

/** Locked, and never sent to the chain: the mark of a provisional market. */
export function isProvisional(d: Pick<DareRow, "lockedAt" | "onchainId">): boolean {
  return d.lockedAt !== null && d.onchainId === null;
}

/**
 * Whose votes decide a market: the account-holders in it (the first-contact round, 2026-10-04). The asker used to
 * vote here whether or not they were in; only the people in a market call it now, everywhere.
 */
export function provisionalVoters(positions: Array<Pick<PositionRow, "userId">>): string[] {
  return Array.from(new Set(positions.map((p) => p.userId).filter((x): x is string => x !== null)));
}

/** The contract's rule for the threshold, over the provisional quorum. */
export const thresholdFor = (voters: number): number => Math.floor(voters / 2) + 1;

/**
 * Whether the chain can carry a question every position of which is signed (the second-pass round, 2026-10-06): a
 * question is decided by a majority of the people in it, and the deployed contract asks a majority of everyone ever
 * registered in its set, with the asker registered whether or not they are in. Only when that is exactly the people
 * in does the chain ask the same people for the same majority; otherwise the question is decided here, as a guest's
 * is. The set's size plays no part: the people in are the voters either way, and this only says where it is kept.
 */
export function chainCarries(input: { registered: readonly string[]; inIt: readonly string[]; asker: string }): boolean {
  const inIt = new Set(input.inIt.map((w) => w.toLowerCase()));
  const asked = new Set([...input.registered, ...input.inIt, input.asker].map((w) => w.toLowerCase()));
  return asked.size === inIt.size && [...asked].every((w) => inIt.has(w));
}

/**
 * Where a question all of whose entries are signed is kept (the games-and-the-reveal round, 2026-10-07): in its set's
 * own group when the chain would ask exactly the people in there (`chainCarries`), else in a group of its own when
 * someone in it signed `Create` over that group, else here, as proposals, which only a question whose every entry
 * predates the round comes to. Pure.
 */
export function whereItLocks(input: { setCarries: boolean; questionSigner: boolean }): "set" | "question" | "here" {
  if (input.setCarries) return "set";
  return input.questionSigner ? "question" : "here";
}

/** Who stands as the question's creator on the chain in its own group: its asker when they are in and signed over it, else whoever got in first and did. Pure. */
export function creatorFor<P extends Pick<PositionRow, "userId" | "questionSignature" | "enteredAt">>(positions: P[], askerId: string): P | null {
  const signed = positions.filter((p) => p.userId !== null && p.questionSignature !== null);
  return signed.find((p) => p.userId === askerId) ?? [...signed].sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime())[0] ?? null;
}

/**
 * Whether the voters the chain snapshotted at a lock are exactly the people in it. The lock checks the set before it
 * sends (`chainCarries`); a registration that lands between that check and the lock widens the snapshot, so the
 * completion reads it again and says so loudly when it differs. Pure.
 */
export function snapshotIsThePeopleIn(snapshot: readonly string[], inIt: readonly string[]): boolean {
  const named = new Set(snapshot.map((w) => w.toLowerCase()));
  const people = new Set(inIt.map((w) => w.toLowerCase()));
  return named.size === people.size && [...named].every((w) => people.has(w));
}

/**
 * The lock, with no chain write: the moment is recorded, the room closes with the numbers, and the threshold is
 * the contract's rule over the account-holders who can vote. Idempotent.
 */
export async function lockProvisional(d: Pick<DareRow, "id" | "creatorId">, positions: Array<Pick<PositionRow, "userId">>): Promise<{ threshold: number; voters: string[] }> {
  const voters = provisionalVoters(positions);
  const threshold = thresholdFor(voters.length);
  const now = new Date();
  await db.update(schema.dares).set({ lockedAt: now, threshold }).where(and(eq(schema.dares.id, d.id), isNull(schema.dares.lockedAt)));
  await db.update(schema.roomCodes).set({ closedAt: now }).where(and(eq(schema.roomCodes.dareId, d.id), isNull(schema.roomCodes.closedAt)));
  return { threshold, voters };
}

/** The score the contract would give, by kind, in basis points. */
export function scoreOf(d: Pick<DareRow, "kind" | "range" | "outcomeLabels">, p: Pick<PositionRow, "value" | "confidenceBps">, outcome: bigint): bigint {
  if (d.kind === "numeric") return d.range !== null && d.range > 0n ? scoreNumeric(p.value, outcome, d.range) : p.value === outcome ? BPS : 0n;
  if (d.kind === "categorical") return scoreCategorical(p.value, BigInt(p.confidenceBps ?? PICK_ONE_CONFIDENCE), BigInt(d.outcomeLabels.length), outcome);
  return scoreBinary(p.value, outcome);
}

export const VOID_OUTCOME = -1n;

/**
 * The settlement, offchain, written once: the outcome and how it was decided, each participant's score and net,
 * and one pending proposal per transfer, from the lower scorer to the higher, with a ghost on whichever side a
 * ghost is. A void leaves scores empty and proposes nothing. A market already decided is left as it is.
 */
export async function settleProvisional(d: DareRow, positions: PositionRow[], outcome: bigint, how: { by: "quorum" | "arbitration" | "feed"; rulingText?: string; rulingHash?: Hex }): Promise<{ proposals: number }> {
  const voided = outcome === VOID_OUTCOME;
  const denom = await denominationById(d.denomId);
  if (!denom) throw new Error("unknown unit");
  const scored: ScoredPosition[] = voided ? [] : positions.map((p) => ({ id: pidOf(p), stake: p.stake, score: scoreOf(d, p, outcome) }));
  const edges = voided || scored.length < 2 ? [] : settle(scored);
  const net = nets(scored, edges);
  const now = new Date();
  let made = 0;
  await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(schema.dares)
      .set({ resolvedOutcome: voided ? VOID_OUTCOME : outcome, resolvedBy: how.by === "quorum" ? "provisional" : how.by, resolvedAt: now, ...(how.rulingText && how.rulingHash ? { rulingText: how.rulingText, rulingHash: Buffer.from(how.rulingHash.slice(2), "hex") } : {}) })
      .where(and(eq(schema.dares.id, d.id), isNull(schema.dares.resolvedAt)))
      .returning({ id: schema.dares.id });
    if (!claimed) return;
    for (const p of positions) {
      const id = pidOf(p);
      const s = scored.find((x) => x.id === id);
      await tx
        .update(schema.darePositions)
        .set({ score: voided || !s ? null : Number(s.score), net: voided ? null : (net.get(id) ?? 0n) })
        .where(and(eq(schema.darePositions.dareId, d.id), p.userId ? eq(schema.darePositions.userId, p.userId) : eq(schema.darePositions.claimId, p.claimId as string)));
    }
    const kindOf = (id: string) => positions.find((p) => pidOf(p) === id);
    for (const e of edges) {
      const from = kindOf(e.debtor);
      const to = kindOf(e.creditor);
      if (!from || !to) throw new Error("a transfer names someone who is not in the market");
      await tx.insert(schema.obligationProposals).values({
        groupId: d.groupId,
        fromUser: from.userId,
        fromClaim: from.userId ? null : from.claimId,
        toUser: to.userId,
        toClaim: to.userId ? null : to.claimId,
        denomId: d.denomId,
        quantity: denom.quantifiable ? e.qty : null,
        amountCents: denom.monetary ? e.qty : null,
        origin: "dare",
        originId: d.id,
        settleExpected: denom.monetary,
        memo: null,
        status: "pending",
      });
      made += 1;
    }
  });
  await record("settled", { by: settledWord(how.by), outcome: voided ? "void" : "decided" }, {}, { dareId: d.id });
  return { proposals: made };
}
