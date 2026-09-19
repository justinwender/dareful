"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyAfterVote, voteCounts, type VoteCounts } from "@/lib/notify";
import { isHex, type Hex } from "viem";
import { z } from "zod";
import { plainScope, proposeOutcome, scopeMarket } from "@/lib/ai/markets";
import { requireUser } from "@/lib/auth/session";
import { db, schema } from "@/db";
import { and, asc, eq } from "drizzle-orm";
import { denominationById, ensureUnitInGroup, ensureUsd } from "@/lib/ledger/denominations";
import { createOccasionGroup, isMember } from "@/lib/ledger/groups";
import { castVote, draftMarket, enterMarket, lockMarket, MarketError, marketById, openMarket, sayWhatHappened, stateOf, VOID_OUTCOME } from "@/lib/ledger/markets";

const uuid = z.string().uuid();
const say = (err: unknown, fallback: string) => (err instanceof MarketError ? err.message : fallback);

export type ScopeResult = { title: string; terms: string; ambiguous: boolean; criteria: string[]; anchorPercent: number | null; anchorRationale: string | null; resolvesInHours: number; plain: boolean };

/**
 * Quick mode: one line in, terms out. The model drafts; if it is slow, down, or answers in the wrong shape, the
 * line is used as typed and the screen says so, because a market must never wait on a model.
 */
export async function scopeMarketAction(rawLine: string, rawCriterion?: string): Promise<ScopeResult | { error: string }> {
  await requireUser();
  const line = z.string().trim().min(3).max(280).safeParse(rawLine);
  if (!line.success) return { error: "Ask it in a line." };
  const criterion = rawCriterion ? z.string().trim().min(3).max(120).safeParse(rawCriterion) : null;
  try {
    const s = await scopeMarket({ line: line.data, criterion: criterion?.success ? criterion.data : undefined, now: new Date() });
    return { title: s.title, terms: s.terms, ambiguous: s.ambiguous && s.criteria.length > 0, criteria: s.criteria, anchorPercent: s.anchorPercent, anchorRationale: s.anchorRationale, resolvesInHours: s.resolvesInHours, plain: false };
  } catch (err) {
    console.error("scoping failed; using the line as typed", err);
    const p = plainScope(line.data);
    return { ...p, ambiguous: false, criteria: [], anchorPercent: null, anchorRationale: null, resolvesInHours: 24, plain: true };
  }
}

const Unit = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("usd") }),
  z.object({ kind: z.literal("existing"), id: uuid }),
  z.object({ kind: z.literal("new"), template: z.enum(["beer", "coffee", "round", "next_time"]).nullable(), label: z.string().trim().min(1).max(40), markEmoji: z.string().trim().max(16).optional() }),
]);
const Draft = z.object({
  /** Null is the ordinary case: ask first, and the group is whoever joins. */
  groupId: uuid.nullable(),
  unit: Unit,
  title: z.string().trim().min(3).max(140),
  terms: z.string().trim().min(3).max(800),
  resolvesBy: z.string().datetime(),
  anchorPercent: z.number().int().min(0).max(100).nullable(),
  anchorRationale: z.string().trim().max(140).nullable(),
  markEmoji: z.string().trim().max(16).optional(),
});

/** Saves the draft and sends the creator to it; they read the terms there and sign to open it. */
export async function draftMarketAction(input: z.infer<typeof Draft>): Promise<{ id: string } | { error: string }> {
  const user = await requireUser();
  const parsed = Draft.safeParse(input);
  if (!parsed.success) return { error: "Something in that is off." };
  const d = parsed.data;
  try {
    if (d.groupId && !(await isMember(d.groupId, user.id))) return { error: "You're not in that group." };
    if (!d.groupId && d.unit.kind === "existing") return { error: "That unit isn't around any more. Pick another." };
    const groupId = d.groupId ?? (await createOccasionGroup(user.id)).id;
    const denom = d.unit.kind === "usd" ? await ensureUsd(groupId, user.id) : d.unit.kind === "existing" ? await denominationById(d.unit.id) : await ensureUnitInGroup(groupId, user.id, d.unit);
    if (!denom) return { error: "That unit isn't around any more. Pick another." };
    const row = await draftMarket({
      creatorId: user.id,
      groupId,
      denomId: denom.id,
      title: d.title,
      termsText: d.terms,
      resolvesBy: new Date(d.resolvesBy),
      anchorBps: d.anchorPercent === null ? null : BigInt(d.anchorPercent * 100),
      anchorRationale: d.anchorRationale,
      markEmoji: d.markEmoji,
    });
    return { id: row.id };
  } catch (err) {
    return { error: say(err, "Couldn't save that.") };
  }
}

const Position = z.object({ stake: z.string().regex(/^\d{1,15}$/), valueBps: z.number().int().min(0).max(10_000) });

/** The creator's two signatures: one opens the market, one is their own position. Either failing leaves it a draft or open with nobody in. */
export async function openMarketAction(rawId: string, createSignature: string, rawPosition: z.infer<typeof Position>, enterSignature: string): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const id = uuid.safeParse(rawId);
  const position = Position.safeParse(rawPosition);
  if (!id.success || !position.success || !isHex(createSignature) || !isHex(enterSignature)) return { error: "That didn't come through. Try again." };
  try {
    await openMarket(id.data, user.id, createSignature as Hex);
    await enterMarket({ dareId: id.data, userId: user.id, stake: BigInt(position.data.stake), valueBps: BigInt(position.data.valueBps), signature: enterSignature as Hex });
  } catch (err) {
    return { error: say(err, "That didn't go through. Try again.") };
  }
  revalidatePath(`/m/${id.data}`);
  return { ok: true };
}

export async function enterMarketAction(rawId: string, rawPosition: z.infer<typeof Position>, signature: string): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const id = uuid.safeParse(rawId);
  const position = Position.safeParse(rawPosition);
  if (!id.success || !position.success || !isHex(signature)) return { error: "That didn't come through. Try again." };
  try {
    await enterMarket({ dareId: id.data, userId: user.id, stake: BigInt(position.data.stake), valueBps: BigInt(position.data.valueBps), signature: signature as Hex });
  } catch (err) {
    return { error: say(err, "That didn't go through. Try again.") };
  }
  revalidatePath(`/m/${id.data}`);
  return { ok: true };
}

export async function lockMarketAction(rawId: string): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const id = uuid.safeParse(rawId);
  if (!id.success) return { error: "That one doesn't exist." };
  try {
    await lockMarket(id.data, user.id);
  } catch (err) {
    return { error: say(err, "Locking it didn't go through. Nothing changed.") };
  }
  revalidatePath(`/m/${id.data}`);
  return { ok: true };
}

/**
 * Someone says what happened, in a line. That is what the outcome proposal reads: the model was not there, so
 * with nothing said it proposes nothing, and the ballot opens with nothing picked.
 */
export async function sayWhatHappenedAction(rawId: string, rawText: string): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const id = uuid.safeParse(rawId);
  const text = z.string().trim().min(2).max(280).safeParse(rawText);
  if (!id.success || !text.success) return { error: "Say what happened in a line." };
  try {
    await sayWhatHappened(id.data, user.id, text.data);
    await refreshProposal(id.data);
  } catch (err) {
    return { error: say(err, "Couldn't save that.") };
  }
  revalidatePath(`/m/${id.data}`);
  return { ok: true };
}

/** Rewrites the proposal from the terms and everything said so far. A failure leaves the old proposal, or none. */
async function refreshProposal(dareId: string): Promise<void> {
  const d = await marketById(dareId);
  if (!d || stateOf(d) !== "locked") return;
  const said = await db
    .select({ name: schema.users.displayName, said: schema.dareStatements.statement })
    .from(schema.dareStatements)
    .innerJoin(schema.users, eq(schema.users.id, schema.dareStatements.userId))
    // Only "here is what happened". Somebody's case for arbitration is a different kind and never reaches this prompt.
    .where(and(eq(schema.dareStatements.dareId, dareId), eq(schema.dareStatements.kind, "update")))
    .orderBy(asc(schema.dareStatements.statedAt));
  try {
    const p = await proposeOutcome({ title: d.title, terms: d.termsText, statements: said, now: new Date() });
    const outcome = p.outcome === "yes" ? 1n : p.outcome === "no" ? 0n : p.outcome === "cannot_be_decided" ? VOID_OUTCOME : null;
    await db
      .update(schema.dares)
      .set({ aiOutcome: outcome, aiConfidenceBps: outcome === null ? null : p.confidencePercent * 100, aiRationale: p.rationale, aiProposedAt: new Date() })
      .where(eq(schema.dares.id, dareId));
  } catch (err) {
    console.error("outcome proposal failed; the ballot opens with nothing picked", err);
  }
}

/** A vote is a signature from the voter's governance wallet. This relays it; nothing here can make one. */
export async function castVoteAction(rawId: string, rawOutcome: "yes" | "no" | "void", signature: string): Promise<{ ok: true; resolved: boolean; counts: VoteCounts | null } | { error: string }> {
  const user = await requireUser();
  const id = uuid.safeParse(rawId);
  const outcome = z.enum(["yes", "no", "void"]).safeParse(rawOutcome);
  if (!id.success || !outcome.success || !isHex(signature)) return { error: "That didn't come through. Try again." };
  try {
    const r = await castVote({ dareId: id.data, userId: user.id, outcome: outcome.data === "yes" ? 1n : outcome.data === "no" ? 0n : VOID_OUTCOME, signature: signature as Hex });
    revalidatePath(`/m/${id.data}`);
    revalidatePath("/");
    // The rest of the quorum hears about it after the voter has their answer, never before and never instead.
    after(() => notifyAfterVote(id.data, user.id));
    return { ok: true, resolved: r.resolved, counts: r.resolved ? null : await voteCounts(id.data) };
  } catch (err) {
    return { error: say(err, "That didn't go through. Try again.") };
  }
}
