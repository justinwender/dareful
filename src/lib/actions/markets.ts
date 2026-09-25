"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyAfterVote, notifyJoined, notifyOpened, notifyRuling, sendNudge, voteCounts, type NudgeResult, type VoteCounts } from "@/lib/notify";
import { carefulQuestions, declined, triage } from "@/lib/ai/settler";
import { afterEntry, arbitrateMarket, proposeForArgument, stateCase } from "@/lib/ledger/settle";
import { isHex, type Hex } from "viem";
import { z } from "zod";
import { isInkName } from "@/lib/ui/ink";
import { plainScope, proposeOutcome, scopeMarket } from "@/lib/ai/markets";
import { viewerZone } from "@/lib/ui/zone";
import { requireUser } from "@/lib/auth/session";
import { db, schema } from "@/db";
import { and, asc, eq } from "drizzle-orm";
import { denominationById, ensureUnitInGroup, ensureUsd } from "@/lib/ledger/denominations";
import { createOccasionGroup, isMember, setForPeople } from "@/lib/ledger/groups";
import { castVote, draftMarket, enterMarket, lockMarket, MarketError, marketById, openMarket, sayWhatHappened, stateOf, VOID_OUTCOME, pickInk } from "@/lib/ledger/markets";

const uuid = z.string().uuid();
const say = (err: unknown, fallback: string) => (err instanceof MarketError ? err.message : fallback);

export type ScopeResult = { title: string; terms: string; ambiguous: boolean; criteria: string[]; resolvesInHours: number; plain: boolean };

/**
 * Quick mode: one line in, terms out. The model drafts; if it is slow, down, or answers in the wrong shape, the
 * line is used as typed and the screen says so, because a market must never wait on a model.
 */
export async function scopeMarketAction(rawLine: string, rawCriterion?: string, rawAnswers?: Array<{ question: string; yes: boolean }>): Promise<ScopeResult | { error: string }> {
  await requireUser();
  const line = z.string().trim().min(3).max(280).safeParse(rawLine);
  if (!line.success) return { error: "Ask it in a line." };
  const criterion = rawCriterion ? z.string().trim().min(3).max(120).safeParse(rawCriterion) : null;
  try {
    const answers = z.array(z.object({ question: z.string().trim().min(3).max(160), yes: z.boolean() })).max(3).safeParse(rawAnswers ?? []);
    const s = await scopeMarket({ line: line.data, criterion: criterion?.success ? criterion.data : undefined, answers: answers.success ? answers.data : undefined, now: new Date() });
    return { title: s.title, terms: s.terms, ambiguous: s.ambiguous && s.criteria.length > 0, criteria: s.criteria, resolvesInHours: s.resolvesInHours, plain: false };
  } catch (err) {
    console.error("scoping failed; using the line as typed", err);
    const p = plainScope(line.data);
    return { ...p, ambiguous: false, criteria: [], resolvesInHours: 24, plain: true };
  }
}

const Unit = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("usd") }),
  z.object({ kind: z.literal("existing"), id: uuid }),
  z.object({ kind: z.literal("new"), template: z.enum(["beer", "coffee", "round", "next_time"]).nullable(), label: z.string().trim().min(1).max(40), markEmoji: z.string().trim().max(16).optional() }),
]);
const Who = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("set"), groupId: uuid }),
  z.object({ kind: z.literal("people"), userIds: z.array(uuid).min(1).max(11) }),
  /** Whoever the asker sends it to: a set of one that grows as people join. */
  z.object({ kind: z.literal("link") }),
]);
const Draft = z.object({
  who: Who,
  blind: z.boolean().default(false),
  /** What happens if nobody can agree. Shown before anyone is in, and consented to in every entry. */
  stalemate: z.enum(["arbitrate", "void"]).default("arbitrate"),
  mode: z.enum(["quick", "careful"]).default("quick"),
  /** Present for an argument: what the triage made of it, and the criterion a contestable claim is ruled against. */
  argument: z.object({ tier: z.enum(["checkable", "contestable"]), criterion: z.string().trim().min(3).max(110).nullable() }).optional(),
  unit: Unit,
  title: z.string().trim().min(3).max(140),
  terms: z.string().trim().min(3).max(800),
  resolvesBy: z.string().datetime().nullable(),
  markEmoji: z.string().trim().max(16).optional(),
});

/** Saves the draft and sends the creator to it; they read the terms there and sign to open it. */
export async function draftMarketAction(input: z.infer<typeof Draft>): Promise<{ id: string } | { error: string }> {
  const user = await requireUser();
  const parsed = Draft.safeParse(input);
  if (!parsed.success) return { error: "Something in that is off." };
  const d = parsed.data;
  try {
    if (d.argument?.tier === "contestable" && !d.argument.criterion) return { error: "Pick how it's being decided first." };
    if (d.who.kind === "set" && !(await isMember(d.who.groupId, user.id))) return { error: "You're not one of those people." };
    if (d.who.kind !== "set" && d.unit.kind === "existing") return { error: "That unit isn't around any more. Pick another." };
    const groupId = d.who.kind === "set" ? d.who.groupId : d.who.kind === "people" ? (await setForPeople(user.id, d.who.userIds)).id : (await createOccasionGroup(user.id)).id;
    const denom = d.unit.kind === "usd" ? await ensureUsd(groupId, user.id) : d.unit.kind === "existing" ? await denominationById(d.unit.id) : await ensureUnitInGroup(groupId, user.id, d.unit);
    if (!denom) return { error: "That unit isn't around any more. Pick another." };
    const row = await draftMarket({
      creatorId: user.id,
      groupId,
      denomId: denom.id,
      title: d.title,
      termsText: d.terms,
      resolvesBy: d.argument ? null : d.resolvesBy ? new Date(d.resolvesBy) : null,
      pace: d.argument ? "argument" : "dare",
      tier: d.argument?.tier ?? null,
      criterion: d.argument?.criterion ?? null,
      mode: d.mode,
      stalemate: d.stalemate,
      markEmoji: d.markEmoji,
      revealMode: d.blind ? "blind" : "open",
      zone: await viewerZone(),
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
  revalidatePath("/");
  // "Priya asked something": the rest of the group hears, after Priya has her answer.
  after(() => notifyOpened(id.data, user.id));
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
  // An argument has no waiting in it: the moment the second person is in it locks, it is due, and the app proposes.
  let lockedNow = false;
  try {
    lockedNow = (await afterEntry(id.data)).locked;
  } catch (err) {
    console.error("an argument did not lock when its second person got in", { dareId: id.data, err });
    return { error: say(err, "You're in, but it didn't lock. Open it again to retry.") };
  }
  revalidatePath(`/m/${id.data}`);
  revalidatePath("/");
  after(() => notifyJoined(id.data, user.id));
  // A model is never on the critical path: the ballot is open already, and the proposal arrives when it arrives.
  if (lockedNow) after(() => proposeForArgument(id.data).catch((err: unknown) => console.error("the ruling on an argument did not come through", err)));
  return { ok: true };
}

/**
 * "We're waiting on you", sent by a person, on demand. Says back how many it was for and how many a channel
 * actually reached, so the screen never claims a nudge landed when it only reached the in-app strip.
 */
export async function nudgeAction(rawId: string): Promise<({ ok: true } & NudgeResult) | { error: string }> {
  const user = await requireUser();
  const id = uuid.safeParse(rawId);
  if (!id.success) return { error: "That one doesn't exist." };
  try {
    return { ok: true, ...(await sendNudge(id.data, user.id, new Date())) };
  } catch (err) {
    console.error("nudge failed", err);
    return { error: "That didn't go through. Try again." };
  }
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


// ------------------------------------------------------------------------------------------------ the settler

export type TriageResult = { kind: "declined"; reason: string; dareInstead: string | null } | { kind: "ok"; tier: "checkable" | "contestable"; claim: string; criteria: string[] } | { kind: "unavailable" };

/**
 * What kind of disagreement this is. The refusal is not a soft guideline: no claim about the world, no ruling,
 * ever, and the offer is to make it a dare. And with no triage there is no settler: if the model is down the app
 * says so and rules on nothing, because a failed triage is not permission to rule.
 */
export async function triageAction(rawLine: string): Promise<TriageResult | { error: string }> {
  await requireUser();
  const line = z.string().trim().min(3).max(280).safeParse(rawLine);
  if (!line.success) return { error: "Say what you two disagree about, in a line." };
  try {
    const t = await triage({ line: line.data });
    const no = declined(t);
    if (no) return { kind: "declined", reason: no.reason, dareInstead: no.dareInstead };
    return { kind: "ok", tier: t.tier === "contestable" ? "contestable" : "checkable", claim: t.claim, criteria: t.tier === "contestable" ? t.criteria : [] };
  } catch (err) {
    console.error("triage failed; the settler is not available", err);
    return { kind: "unavailable" };
  }
}

/** Careful mode: the three yes-or-no questions whose answers most change how it would be decided. */
export async function carefulQuestionsAction(rawLine: string): Promise<{ questions: string[] } | { error: string }> {
  await requireUser();
  const line = z.string().trim().min(3).max(280).safeParse(rawLine);
  if (!line.success) return { error: "Ask it in a line." };
  try {
    return { questions: await carefulQuestions({ line: line.data }) };
  } catch (err) {
    console.error("careful questions failed", err);
    return { error: "The questions didn’t come through. You can write the terms yourself on the next screen." };
  }
}

/** One line of someone's case, for the arbitrator. Kept apart from "what happened". */
export async function stateCaseAction(rawId: string, rawText: string): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const id = uuid.safeParse(rawId);
  if (!id.success) return { error: "That one doesn't exist." };
  try {
    await stateCase(id.data, user.id, rawText);
  } catch (err) {
    return { error: say(err, "That didn't save. Try again.") };
  }
  revalidatePath(`/m/${id.data}`);
  return { ok: true };
}

/** "Let the app call it": someone who is in it asks for the arbitration everyone agreed to going in. */
export async function arbitrateAction(rawId: string): Promise<{ ok: true; outcome: "yes" | "no" | "void" } | { error: string }> {
  const user = await requireUser();
  const id = uuid.safeParse(rawId);
  if (!id.success) return { error: "That one doesn't exist." };
  try {
    const r = await arbitrateMarket(id.data, user.id);
    revalidatePath(`/m/${id.data}`);
    revalidatePath("/");
    after(() => notifyRuling(id.data, user.id));
    return { ok: true, outcome: r.outcome };
  } catch (err) {
    return { error: say(err, "That didn't go through. Nothing changed.") };
  }
}

/** The creator's ink pick (docs/design.md 1.8, rule 1): one tap from the market's screen, honoured as picked. */
export async function pickInkAction(rawId: string, rawInk: string): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const id = uuid.safeParse(rawId);
  if (!id.success || !isInkName(rawInk)) return { error: "Something in that is off." };
  try {
    await pickInk(id.data, user.id, rawInk);
    return { ok: true };
  } catch (err) {
    return { error: say(err, "Couldn’t change that.") };
  }
}
