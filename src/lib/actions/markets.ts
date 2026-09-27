"use server";

import { pendingCopy, SendPending } from "@/lib/chain/relayer";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyAfterVote, notifyJoined, notifyOpened, notifyRuling, sendNudge, voteCounts, type NudgeResult, type VoteCounts } from "@/lib/notify";
import { carefulQuestions, declined, SUBJECT_KINDS, triage } from "@/lib/ai/settler";
import { afterEntry, arbitrateMarket, proposeForArgument, stateCase } from "@/lib/ledger/settle";
import { isHex, type Hex } from "viem";
import { z } from "zod";
import { isInkName } from "@/lib/ui/ink";
import { outcomeWordsFrom } from "@/lib/ui/outcome-words";
import { plainNumberScope, plainPickOneScope, plainScope, proposeAnswer, proposeNumber, proposeOutcome, scopeMarket, scopeNumber, scopePickOne } from "@/lib/ai/markets";
import { addMarketPhoto, MediaError } from "@/lib/media";
import { evidenceFor } from "@/lib/media/evidence";
import { MAX_UPLOAD_BYTES } from "@/lib/media/pipeline";
import { StorageUnavailable } from "@/lib/media/storage";
import { createHmac, timingSafeEqual } from "node:crypto";
import { checkScale, parseAskerScale } from "@/lib/ledger/scale";
import { MAX_NUMBER } from "@/lib/ledger/scoring";
import { viewerZone } from "@/lib/ui/zone";
import { currentUser, requireUser } from "@/lib/auth/session";
import { headers } from "next/headers";
import { regionFromHeaders, tryHashPhone } from "@/lib/auth/phone";
import { addClaimToken, readClaimTokens } from "@/lib/auth/claim-cookie";
import { enterAsGhost, removeGhostEntry } from "@/lib/ledger/ghost-entry";
import { db, schema } from "@/db";
import { and, asc, eq } from "drizzle-orm";
import { denominationById, ensureUnitInGroup, ensureUsd } from "@/lib/ledger/denominations";
import { createOccasionGroup, isMember, setForPeople } from "@/lib/ledger/groups";
import { answersOf, callToOutcome, castVote, draftFromTemplate, draftMarket, enterMarket, lockMarket, MarketError, marketById, openMarket, sayWhatHappened, stateOf, unitOf, VOID_OUTCOME, pickInk } from "@/lib/ledger/markets";
import { MAX_ANSWER_LENGTH, MAX_ANSWERS, MIN_ANSWERS } from "@/lib/ledger/pick-one";

const uuid = z.string().uuid();
const say = (err: unknown, fallback: string) => (err instanceof SendPending ? pendingCopy(err) : err instanceof MarketError ? err.message : fallback);

export type ScopeResult = { title: string; terms: string; ambiguous: boolean; criteria: string[]; resolvesInHours: number; plain: boolean; number: NumberScopeResult | null; /** The outcomes in the question's own words (3.25), when the write-up gave four usable phrasings. */ outcomes: [string, string, string, string] | null };
/**
 * A number question's write-up carries its unit and, when the model's scale passed the check, that scale under a
 * token only this server can mint for this person: the draft that comes back with it is stored as the model's
 * scale, which is never shown, so a scale nobody but the server chose must not be able to wear that label.
 */
export type NumberScopeResult = { unit: { singular: string; plural: string }; model: { range: string | null; typical: string; token: string } | null };

/** The token covers the model's scale (null when it failed the check) and its most likely answer together. */
function scaleToken(userId: string, range: string | null, typical: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET is not set or too short");
  return createHmac("sha256", secret).update(`dareful:ai-scale:v2:${userId}:${range ?? ""}:${typical}`).digest("base64url");
}
function scaleTokenValid(userId: string, range: string | null, typical: string, token: string): boolean {
  const want = Buffer.from(scaleToken(userId, range, typical));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}

/**
 * Quick mode: one line in, terms out. The model drafts; if it is slow, down, or answers in the wrong shape, the
 * line is used as typed and the screen says so, because a market must never wait on a model.
 */
export async function scopeMarketAction(rawLine: string, rawCriterion?: string, rawAnswers?: Array<{ question: string; yes: boolean }>, rawKind?: "binary" | "numeric" | "categorical", rawChoices?: string[]): Promise<ScopeResult | { error: string }> {
  const user = await requireUser();
  const line = z.string().trim().min(3).max(280).safeParse(rawLine);
  if (!line.success) return { error: "Ask it in a line." };
  const criterion = rawCriterion ? z.string().trim().min(3).max(120).safeParse(rawCriterion) : null;
  if (rawKind === "categorical") {
    // A pick-one question (3.29): the write-up is given the answers and leaves them exactly as the asker wrote them.
    const choices = z.array(z.string().trim().min(1).max(MAX_ANSWER_LENGTH)).min(MIN_ANSWERS).max(MAX_ANSWERS).safeParse(rawChoices ?? []);
    if (!choices.success) return { error: `Two to ${MAX_ANSWERS} answers, a few words each.` };
    try {
      const s = await scopePickOne({ line: line.data, answers: choices.data, now: new Date() });
      return { title: s.title, terms: s.terms, ambiguous: false, criteria: [], resolvesInHours: s.resolvesInHours, plain: false, number: null, outcomes: null };
    } catch (err) {
      console.error("scoping a pick-one question failed; using the line as typed", err);
      const p = plainPickOneScope(line.data);
      return { ...p, ambiguous: false, criteria: [], resolvesInHours: 24, plain: true, number: null, outcomes: null };
    }
  }
  if (rawKind === "numeric") {
    try {
      const s = await scopeNumber({ line: line.data, now: new Date() });
      const unit = { singular: s.unit.singular.toLowerCase(), plural: s.unit.plural.toLowerCase() };
      // The model's scale is used only when it passes the check; otherwise the asker sets one (src/lib/ledger/scale.ts).
      const checked = checkScale({ low: s.low, high: s.high, typical: s.typical });
      if (!checked.ok) console.warn("number scale proposal refused", { why: checked.why, low: s.low, high: s.high, typical: s.typical });
      const range = checked.ok ? checked.range.toString() : null;
      const typical = Number.isInteger(s.typical) && s.typical >= 0 ? String(s.typical) : "0";
      return { title: s.title, terms: s.terms, ambiguous: false, criteria: [], resolvesInHours: s.resolvesInHours, plain: false, number: { unit, model: { range, typical, token: scaleToken(user.id, range, typical) } }, outcomes: null };
    } catch (err) {
      console.error("scoping a number question failed; using the line as typed", err);
      const p = plainNumberScope(line.data);
      return { ...p, ambiguous: false, criteria: [], resolvesInHours: 24, plain: true, number: { unit: { singular: "", plural: "" }, model: null }, outcomes: null };
    }
  }
  try {
    const answers = z.array(z.object({ question: z.string().trim().min(3).max(160), yes: z.boolean() })).max(3).safeParse(rawAnswers ?? []);
    const s = await scopeMarket({ line: line.data, criterion: criterion?.success ? criterion.data : undefined, answers: answers.success ? answers.data : undefined, now: new Date() });
    return { title: s.title, terms: s.terms, ambiguous: s.ambiguous && s.criteria.length > 0, criteria: s.criteria, resolvesInHours: s.resolvesInHours, plain: false, number: null, outcomes: outcomeWordsFrom(s.outcomes) };
  } catch (err) {
    console.error("scoping failed; using the line as typed", err);
    const p = plainScope(line.data);
    return { ...p, ambiguous: false, criteria: [], resolvesInHours: 24, plain: true, number: null, outcomes: null };
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
  /** A yes-or-no market's outcomes in its own words (3.25), from the write-up: yes well, no well, yes line, no line. */
  outcomeWords: z.tuple([z.string().trim().min(2).max(48), z.string().trim().min(2).max(48), z.string().trim().min(2).max(48), z.string().trim().min(2).max(48)]).optional(),
  /** The mark (3.29): an emoji, or one of this person's stickers (3.28) by its id. */
  mark: z.discriminatedUnion("kind", [z.object({ kind: z.literal("emoji"), value: z.string().trim().min(1).max(16) }), z.object({ kind: z.literal("sticker"), id: uuid })]).optional(),
  /** The id the client made up front, so the ink it previewed on the question step is the ink that is stored (docs/design.md 3.29). */
  id: z.string().uuid().optional(),
  /** A pick-one question's answers (3.29): two to six, in the asker's order, a person's id where one is a person. */
  answers: z.array(z.object({ text: z.string().trim().min(1).max(MAX_ANSWER_LENGTH), userId: uuid.nullable().optional() })).min(MIN_ANSWERS).max(MAX_ANSWERS).optional(),
  /** A number question: its unit, the asker's scale as typed (blank for the model's), and what the model said under its token. */
  number: z
    .object({
      unit: z.object({ singular: z.string().trim().min(1).max(24), plural: z.string().trim().max(24) }),
      scale: z.string().trim().max(16),
      model: z.object({ range: z.string().regex(/^\d{1,9}$/).nullable(), typical: z.string().regex(/^\d{1,9}$/), token: z.string().max(200) }).nullable(),
    })
    .optional(),
});

/** Saves the draft and sends the creator to it; they read the terms there and sign to open it. */
export async function draftMarketAction(input: z.infer<typeof Draft>): Promise<{ id: string } | { error: string }> {
  const user = await requireUser();
  const parsed = Draft.safeParse(input);
  if (!parsed.success) return { error: "Something in that is off." };
  const d = parsed.data;
  try {
    if (d.argument?.tier === "contestable" && !d.argument.criterion) return { error: "Pick how it's being decided first." };
    if (d.answers && (d.argument || d.number)) return { error: "Something in that is off." };
    if (d.who.kind === "set" && !(await isMember(d.who.groupId, user.id))) return { error: "You're not one of those people." };
    if (d.who.kind !== "set" && d.unit.kind === "existing") return { error: "That unit isn't around any more. Pick another." };
    const groupId = d.who.kind === "set" ? d.who.groupId : d.who.kind === "people" ? (await setForPeople(user.id, d.who.userIds)).id : (await createOccasionGroup(user.id)).id;
    const denom = d.unit.kind === "usd" ? await ensureUsd(groupId, user.id) : d.unit.kind === "existing" ? await denominationById(d.unit.id) : await ensureUnitInGroup(groupId, user.id, d.unit);
    if (!denom) return { error: "That unit isn't around any more. Pick another." };
    // The scale (docs/design.md 3.26): the asker's when they typed one, else the model's, checked and signed by this server.
    // The model's most likely answer, under the same token, is kept as the far-off check's reference and never shown.
    let scale: { range: bigint; source: "asker" | "ai" } | null = null;
    let typical: bigint | null = null;
    if (d.number) {
      const model = d.number.model && scaleTokenValid(user.id, d.number.model.range, d.number.model.typical, d.number.model.token) ? d.number.model : null;
      if (model) typical = BigInt(model.typical);
      if (d.number.scale) {
        const typed = parseAskerScale(d.number.scale);
        if (!typed) return { error: "The scale is a whole number of at least one, like 20." };
        scale = { range: typed, source: "asker" };
      } else if (model?.range && BigInt(model.range) >= 1n && BigInt(model.range) <= MAX_NUMBER) {
        scale = { range: BigInt(model.range), source: "ai" };
      } else {
        return { error: "Say how far off scores nothing, like 20." };
      }
    }
    const row = await draftMarket({
      id: d.id,
      creatorId: user.id,
      groupId,
      denomId: denom.id,
      title: d.title,
      termsText: d.terms,
      kind: d.answers ? "categorical" : d.number ? "numeric" : "binary",
      answers: d.answers?.map((a) => ({ text: a.text, userId: a.userId ?? null })) ?? null,
      unit: d.number?.unit ?? null,
      scale,
      typical,
      resolvesBy: d.argument ? null : d.resolvesBy ? new Date(d.resolvesBy) : null,
      pace: d.argument ? "argument" : "dare",
      tier: d.argument?.tier ?? null,
      criterion: d.argument?.criterion ?? null,
      mode: d.mode,
      stalemate: d.stalemate,
      mark: d.mark ?? null,
      outcomeWords: d.number || d.argument || d.answers ? null : (d.outcomeWords ?? null),
      revealMode: d.blind ? "blind" : "open",
      zone: await viewerZone(),
    });
    return { id: row.id };
  } catch (err) {
    return { error: say(err, "Couldn't save that.") };
  }
}

/**
 * A market from a public question (docs/design.md 3.33): who's in, what's riding on it and whether it is blind are
 * the asker's; the question, its terms, its kind, its scale, its close and its tiebreaker are the template's,
 * copied on the server and never taken from the client.
 */
export async function draftFromTemplateAction(input: { templateId: string; who: z.infer<typeof Who>; unit: z.infer<typeof Unit>; blind?: boolean; id?: string }): Promise<{ id: string } | { error: string }> {
  const user = await requireUser();
  const parsed = z.object({ templateId: uuid, who: Who, unit: Unit, blind: z.boolean().default(false), id: z.string().uuid().optional() }).safeParse(input);
  if (!parsed.success) return { error: "Something in that is off." };
  const d = parsed.data;
  try {
    if (d.who.kind === "set" && !(await isMember(d.who.groupId, user.id))) return { error: "You're not one of those people." };
    if (d.who.kind !== "set" && d.unit.kind === "existing") return { error: "That unit isn't around any more. Pick another." };
    const groupId = d.who.kind === "set" ? d.who.groupId : d.who.kind === "people" ? (await setForPeople(user.id, d.who.userIds)).id : (await createOccasionGroup(user.id)).id;
    const denom = d.unit.kind === "usd" ? await ensureUsd(groupId, user.id) : d.unit.kind === "existing" ? await denominationById(d.unit.id) : await ensureUnitInGroup(groupId, user.id, d.unit);
    if (!denom) return { error: "That unit isn't around any more. Pick another." };
    const row = await draftFromTemplate({ templateId: d.templateId, creatorId: user.id, groupId, denomId: denom.id, zone: await viewerZone(), id: d.id });
    if (d.blind) await db.update(schema.dares).set({ revealMode: "blind" }).where(and(eq(schema.dares.id, row.id), eq(schema.dares.creatorId, user.id)));
    return { id: row.id };
  } catch (err) {
    return { error: say(err, "Couldn't save that.") };
  }
}

/** A position's number: a probability in whole percent on a yes-or-no question, the whole number on a number question, or the answer's index on a pick-one question. */
const Position = z
  .object({ stake: z.string().regex(/^\d{1,15}$/), valueBps: z.number().int().min(0).max(10_000).optional(), number: z.string().regex(/^\d{1,9}$/).optional(), answer: z.number().int().min(0).max(MAX_ANSWERS - 1).optional() })
  .refine((p) => [p.valueBps, p.number, p.answer].filter((x) => x !== undefined).length === 1, "one number");
const valueOf = (p: z.infer<typeof Position>): bigint => (p.number !== undefined ? BigInt(p.number) : p.answer !== undefined ? BigInt(p.answer) : BigInt(p.valueBps ?? 0));

/** The creator's two signatures: one opens the market, one is their own position. Either failing leaves it a draft or open with nobody in. */
export async function openMarketAction(rawId: string, createSignature: string, rawPosition: z.infer<typeof Position>, enterSignature: string): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const id = uuid.safeParse(rawId);
  const position = Position.safeParse(rawPosition);
  if (!id.success || !position.success || !isHex(createSignature) || !isHex(enterSignature)) return { error: "That didn't come through. Try again." };
  try {
    await openMarket(id.data, user.id, createSignature as Hex);
    await enterMarket({ dareId: id.data, userId: user.id, stake: BigInt(position.data.stake), value: valueOf(position.data), signature: enterSignature as Hex });
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
    await enterMarket({ dareId: id.data, userId: user.id, stake: BigInt(position.data.stake), value: valueOf(position.data), signature: signature as Hex });
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

/** Who a ghost says they are: a name, their own number (hashed here and never kept), or one of the group's ghosts. */
const GhostWho = z.object({ name: z.string().trim().max(40).default(""), phone: z.string().trim().max(40).optional(), memberClaimId: z.string().uuid().optional() });

/**
 * Entering without an account (PLANNING.md section 4; docs/design.md 3.17): no session, no signature. The
 * position is a ghost's, the browser keeps a token for it, and the ghost binds at a login here or with that
 * number. Someone who is signed in enters as themselves; this door is shut to them.
 */
export async function enterAsGhostAction(rawId: string, rawPosition: z.infer<typeof Position>, rawWho: z.infer<typeof GhostWho>): Promise<{ ok: true; name: string } | { error: string }> {
  if (await currentUser()) return { error: "You’re signed in, so put your number on it as yourself." };
  const id = uuid.safeParse(rawId);
  const position = Position.safeParse(rawPosition);
  const who = GhostWho.safeParse(rawWho);
  if (!id.success || !position.success || !who.success) return { error: "That didn't come through. Try again." };
  const phoneHash = who.data.phone ? tryHashPhone(who.data.phone, regionFromHeaders(await headers())) : null;
  if (who.data.phone && !phoneHash) return { error: "That didn’t read as a phone number. Check it, or leave it out." };
  let name = who.data.name;
  try {
    const r = await enterAsGhost({ dareId: id.data, who: { name: who.data.name, phoneHash, memberClaimId: who.data.memberClaimId ?? null }, tokens: await readClaimTokens(), stake: BigInt(position.data.stake), value: valueOf(position.data) });
    if (r.browserToken) await addClaimToken(r.browserToken);
    const [claim] = await db.select({ displayName: schema.participantClaims.displayName }).from(schema.participantClaims).where(eq(schema.participantClaims.id, r.claimId)).limit(1);
    name = claim?.displayName ?? name;
  } catch (err) {
    return { error: say(err, "That didn't go through. Try again.") };
  }
  let lockedNow = false;
  try {
    lockedNow = (await afterEntry(id.data)).locked;
  } catch (err) {
    console.error("an argument did not lock when its second person got in", { dareId: id.data, err });
  }
  revalidatePath(`/m/${id.data}`);
  if (lockedNow) after(() => proposeForArgument(id.data).catch((err: unknown) => console.error("the ruling on an argument did not come through", err)));
  return { ok: true, name };
}

/** The asker removes an entry from someone without an account, while the question is open. */
export async function removeGhostEntryAction(rawId: string, rawClaimId: string): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const id = uuid.safeParse(rawId);
  const claimId = uuid.safeParse(rawClaimId);
  if (!id.success || !claimId.success) return { error: "That didn't come through. Try again." };
  try {
    await removeGhostEntry({ dareId: id.data, claimId: claimId.data, byUserId: user.id });
  } catch (err) {
    return { error: say(err, "That didn't go through. Try again.") };
  }
  revalidatePath(`/m/${id.data}`);
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
 * Someone says what happened, in a line, with up to three photos or screenshots (docs/design.md 3.24; PLANNING.md
 * open question 14). That is what the outcome proposal reads: the model was not there, so with nothing said it
 * proposes nothing, and the ballot opens with nothing picked. What is attached is evidence: everyone voting sees
 * it, the model reads it as this person's claim, and once the market ends the claimant's attachments lead the
 * frame (3.8). One proposal is written after everything has landed.
 */
export async function sayWhatHappenedAction(form: FormData): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const id = uuid.safeParse(form.get("dareId"));
  const raw = form.get("text");
  const text = z.string().trim().max(280).safeParse(typeof raw === "string" ? raw : "");
  const attachments = form.getAll("attachment").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 3);
  if (!id.success || !text.success) return { error: "Say what happened in a line." };
  if (text.data.length < 2 && attachments.length === 0) return { error: "Say what happened in a line." };
  if (attachments.some((f) => f.size > MAX_UPLOAD_BYTES)) return { error: "One of those is too big to send." };
  try {
    if (text.data.length >= 2) await sayWhatHappened(id.data, user.id, text.data);
    const zone = await viewerZone();
    for (const file of attachments) await addMarketPhoto({ dareId: id.data, authorId: user.id, bytes: Buffer.from(await file.arrayBuffer()), viewerZone: zone, role: "evidence" });
    await refreshProposal(id.data);
  } catch (err) {
    if (err instanceof MediaError) return { error: err.message };
    if (err instanceof StorageUnavailable) return { error: "Screenshots are off right now." };
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
    const unit = unitOf(d);
    const answers = answersOf(d);
    const evidence = await evidenceFor(dareId).catch(() => []);
    const p = answers
      ? // A pick-one question: which of the asker's answers happened, by its index (3.30).
        await proposeAnswer({ title: d.title, terms: d.termsText, answers: answers.map((a) => a.text), statements: said, now: new Date(), evidence }).then((r) => ({ outcome: r.outcome === "answer" && r.answer !== null && r.answer < answers.length ? BigInt(r.answer) : r.outcome === "cannot_be_decided" ? VOID_OUTCOME : null, confidencePercent: r.confidencePercent, rationale: r.rationale }))
      : unit
      ? await proposeNumber({ title: d.title, terms: d.termsText, unit, statements: said, now: new Date(), evidence }).then((r) => ({ outcome: r.outcome === "number" && r.number !== null ? BigInt(r.number) : r.outcome === "cannot_be_decided" ? VOID_OUTCOME : null, confidencePercent: r.confidencePercent, rationale: r.rationale }))
      : await proposeOutcome({ title: d.title, terms: d.termsText, statements: said, now: new Date(), evidence }).then((r) => ({ outcome: r.outcome === "yes" ? 1n : r.outcome === "no" ? 0n : r.outcome === "cannot_be_decided" ? VOID_OUTCOME : null, confidencePercent: r.confidencePercent, rationale: r.rationale }));
    const outcome = p.outcome;
    await db
      .update(schema.dares)
      .set({ aiOutcome: outcome, aiConfidenceBps: outcome === null ? null : p.confidencePercent * 100, aiRationale: p.rationale, aiProposedAt: new Date() })
      .where(eq(schema.dares.id, dareId));
  } catch (err) {
    console.error("outcome proposal failed; the ballot opens with nothing picked", err);
  }
}

/** A vote is a signature from the voter's governance wallet. This relays it; nothing here can make one. */
export async function castVoteAction(rawId: string, rawOutcome: string, signature: string): Promise<{ ok: true; resolved: boolean; counts: VoteCounts | null } | { error: string }> {
  const user = await requireUser();
  const id = uuid.safeParse(rawId);
  const outcome = typeof rawOutcome === "string" ? callToOutcome(rawOutcome) : null;
  if (!id.success || outcome === null || !isHex(signature)) return { error: "That didn't come through. Try again." };
  try {
    const r = await castVote({ dareId: id.data, userId: user.id, outcome, signature: signature as Hex });
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
const SubjectAnswer = z.object({ name: z.string().trim().min(1).max(40), kind: z.enum(SUBJECT_KINDS) });

/** Careful mode's three questions, or first the one tap-to-answer question about what a named subject is (docs/decisions.md 2026-09-27). */
export async function carefulQuestionsAction(rawLine: string, rawSubject?: z.infer<typeof SubjectAnswer>): Promise<{ questions: string[] } | { ask: { subject: string } } | { error: string }> {
  await requireUser();
  const line = z.string().trim().min(3).max(280).safeParse(rawLine);
  if (!line.success) return { error: "Ask it in a line." };
  const subject = rawSubject ? SubjectAnswer.safeParse(rawSubject) : null;
  if (subject && !subject.success) return { error: "That didn't come through. Try again." };
  try {
    const r = await carefulQuestions({ line: line.data, subject: subject?.data });
    if ("ask" in r) return r;
    if (r.questions.length !== 3) return { error: "The questions didn’t come through. You can write the terms yourself on the next screen." };
    return { questions: r.questions };
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
export async function arbitrateAction(rawId: string): Promise<{ ok: true; outcome: "yes" | "no" | "void" | "number" | "answer" } | { error: string }> {
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
