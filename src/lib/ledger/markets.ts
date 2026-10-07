/**
 * Binary markets, end to end (PLANNING.md 5a, 5b, 6, 8; corrections in docs/decisions.md). A market is a
 * question with a scoring rule: no sides, no pot, no price. This file is the offchain half of its life and the
 * only place that moves it between states.
 *
 *   draft      the creator has terms and has not signed. Only they can see it.
 *   open       the creator signed `Create`; people in the group enter a stake and a number, each signing `Enter`
 *              (which carries their consent to the stalemate rule). Signatures wait here. Nothing is onchain.
 *   locked     one atomic `create` carried the market and every position with its signature. First chain write.
 *   resolved   `threshold` governance-wallet votes for one outcome went to `resolve`, in a transaction of its
 *              own. The contract scored everyone and minted one obligation per nonzero pairwise transfer.
 *   voided     the quorum voted that nobody can tell. Nothing minted; the toll is the permanent record of it.
 *
 * Three rules hold throughout. The server never casts a vote: a vote is a signature from a governance wallet the
 * server does not hold, verified here and again by the contract. Nothing goes onchain for a position nobody
 * signed: every position in `create` carries its owner's own signature. And one resolution per transaction.
 */
import { firstName } from "@/lib/ui/copy";
import { notAllowed, WORDS } from "@/lib/ui/errors";
import { randomUUID } from "node:crypto";
import { drawable, emojiInk } from "@/lib/ui/emoji-ink";
import { inkFor, inkOf, isInkName, type InkName } from "@/lib/ui/ink";
import { pictureMarkById } from "@/lib/media/marks";
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { decodeEventLog, keccak256, stringToHex, verifyTypedData, type Address, type Hex } from "viem";
import { db, schema } from "@/db";
import { contracts } from "@/lib/chain/contracts";
import { gasFor } from "@/lib/chain/gas";
import { relayer, SendPending, submit } from "@/lib/chain/relayer";
import { daresDomain, daresTypes, Kind, Pace, Stalemate, VOID } from "@/lib/chain/typed-data";
import { denominationById } from "./denominations";
import { dareByOnchainId } from "./envio";
import { isMember, peopleForUser } from "./groups";
import { groupsNumberBps } from "./weight";
import { MAX_NUMBER } from "./scoring";
import { MAX_ANSWER_LENGTH, MAX_ANSWERS, MIN_ANSWERS, PICK_ONE_CONFIDENCE, type Answer } from "./pick-one";
import { SPORT_MARK } from "@/lib/sports/templates";
import { scaleAfterward } from "./scale";
import { bufferToHex, bytes16ToUuid, dareOnchainId, denomOnchainId, groupOnchainId, hexToBuffer } from "./ids";
import { ensureDenomOnchain, ensureGroupOnchain, registeredVoters } from "./registry";
import { pidOf } from "./participants";
import { chainCarries, isProvisional, lockProvisional, provisionalVoters, settleProvisional, snapshotIsThePeopleIn } from "./provisional";
import { record } from "@/lib/usage";
import { settledWord } from "@/lib/usage/events";
import { LATEST_YEARS } from "./decide-by";

export type DareRow = typeof schema.dares.$inferSelect;
export type PositionRow = typeof schema.darePositions.$inferSelect;
export type VoteRow = typeof schema.dareVotes.$inferSelect;

/** "Nobody can tell", offchain. The chain spells it as the largest uint256; a bigint column cannot hold that. */
export const VOID_OUTCOME = -1n;
export const toChainOutcome = (o: bigint): bigint => (o === VOID_OUTCOME ? VOID : o);
export const MAX_POSITIONS = 12;

export type MarketKind = "binary" | "numeric" | "categorical";
/** A number's unit; a signed margin's unit also carries its shift and the two sides, so every number on the screen reads as "Giants by 7" (docs/decisions.md, public markets). */
export type Unit = { singular: string; plural: string; margin?: { shift: string; home: string; away: string } | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * A pick-one market's answers, in the asker's order (docs/design.md 3.29): the words in `outcome_labels`, the
 * person where one is a person. The column holds a real null where an answer is words; the driver reads that
 * element back as the string "NULL", so only an id that is one counts as a person.
 */
export function answersOf(d: Pick<DareRow, "kind" | "outcomeLabels" | "answerPeople">): Answer[] | null {
  if (d.kind !== "categorical") return null;
  return d.outcomeLabels.map((text, index) => {
    const who = d.answerPeople?.[index] ?? null;
    return { index, text, userId: who && UUID.test(who) ? who.toLowerCase() : null };
  });
}
/** The confidence a position carries: everything on the pick on a pick-one market (3.30), nothing on the other two kinds, which score a number. */
export function confidenceFor(d: Pick<DareRow, "kind">): number {
  return d.kind === "categorical" ? PICK_ONE_CONFIDENCE : 0;
}
/** A number market's unit, kept as [singular, plural] in `outcome_labels` (PLANNING.md 5b: "unit name for numeric"). */
export function unitOf(d: Pick<DareRow, "kind" | "outcomeLabels">): Unit | null {
  if (d.kind !== "numeric") return null;
  const [singular, plural] = d.outcomeLabels;
  return { singular: singular ?? "", plural: plural ?? singular ?? "" };
}
/** A value a position may carry: a probability in basis points, a whole number up to nine digits, or, on a pick-one market, the index of one of its `options` answers. */
export function valueAllowed(kind: string, value: bigint, options = 0): boolean {
  if (kind === "numeric") return value >= 0n && value <= MAX_NUMBER;
  if (kind === "categorical") return value >= 0n && value < BigInt(options);
  return value >= 0n && value <= 10_000n;
}
/** What a vote names, from the browser: yes, no, nobody can tell, "n:" and the whole number on a number question, or "a:" and the answer's index on a pick-one question. */
export type Call = "yes" | "no" | "void" | `n:${string}` | `a:${string}`;
export function callToOutcome(call: string): bigint | null {
  if (call === "yes") return 1n;
  if (call === "no") return 0n;
  if (call === "void") return VOID_OUTCOME;
  const m = /^(n|a):(\d{1,9})$/.exec(call);
  return m ? BigInt(m[2] as string) : null;
}
/** An outcome a vote may name: yes, no, or nobody can tell; on a number market, any whole number or nobody can tell; on a pick-one market, one of its answers or nobody can tell. */
export function outcomeAllowed(kind: string, outcome: bigint, options = 0): boolean {
  if (outcome === VOID_OUTCOME) return true;
  return valueAllowed(kind, outcome, options) && (kind !== "binary" || outcome === 0n || outcome === 1n);
}

export class MarketError extends Error {
  constructor(
    message: string,
    public readonly code: "not_found" | "not_yours" | "not_member" | "wrong_state" | "bad_input" | "bad_signature" | "chain" | "slow_down" | "wrong_number",
  ) {
    super(message);
    this.name = "MarketError";
  }
}

export type MarketState = "draft" | "open" | "locked" | "resolved" | "voided" | "expired";
export function stateOf(d: DareRow): MarketState {
  // Expired is the void rule's silent end: no outcome, nothing minted, no toll. It is not a void.
  if (d.resolvedAt && d.resolvedBy === "expired") return "expired";
  if (d.resolvedAt) return d.resolvedOutcome === VOID_OUTCOME ? "voided" : "resolved";
  if (d.lockedAt) return "locked";
  return d.creatorSignature ? "open" : "draft";
}

// ------------------------------------------------------------------------------------------------ reading

/**
 * Whether this id is already this person's own draft (docs/decisions.md 2026-09-29): the ask flow makes the id
 * on the question step, so a second tap on "Send it" carries the id the first one saved under. The draft it made
 * is the answer, never a second insert; an id that belongs to anything else is refused.
 */
export function draftAlreadySaved(existing: Pick<DareRow, "creatorId" | "creatorSignature"> | null, creatorId: string): "new" | "saved" | "taken" {
  if (!existing) return "new";
  return existing.creatorId === creatorId && existing.creatorSignature === null ? "saved" : "taken";
}

export async function marketById(id: string): Promise<DareRow | null> {
  const [row] = await db.select().from(schema.dares).where(eq(schema.dares.id, id)).limit(1);
  return row ?? null;
}

/** Positions that count: acknowledged and not dismissed, in the order they were entered (the order signed at lock). */
export async function positionsOf(dareId: string): Promise<PositionRow[]> {
  return db
    .select()
    .from(schema.darePositions)
    .where(and(eq(schema.darePositions.dareId, dareId), isNotNull(schema.darePositions.acknowledgedAt), isNull(schema.darePositions.dismissedAt)))
    .orderBy(asc(schema.darePositions.enteredAt), asc(schema.darePositions.userId));
}

/**
 * A vote counts only from someone in the market (the first-contact round, 2026-10-04): a live position held by the
 * voter's account. A vote anyone else ever signed is set aside wherever votes are read, never deleted.
 */
export const voterIsIn = sql`exists (select 1 from dare_positions vp where vp.dare_id = ${schema.dareVotes.dareId} and vp.user_id = ${schema.dareVotes.userId} and vp.acknowledged_at is not null and vp.dismissed_at is null)`;

/** The votes that count, oldest first. */
export async function votesOf(dareId: string): Promise<VoteRow[]> {
  return db.select().from(schema.dareVotes).where(and(eq(schema.dareVotes.dareId, dareId), voterIsIn)).orderBy(asc(schema.dareVotes.signedAt));
}

/** What a vote or a line about what happened from someone not in it is told. */
export const ONLY_THOSE_IN = "Only the people in it can call it.";

// ---------------------------------------------------------------------------------------------- typed data

export function termsHash(termsText: string): Hex {
  return keccak256(stringToHex(termsText));
}

/**
 * An argument resolves now, so what its asker signs is a deadline of zero: due at once, which is what lets the
 * contract hear an arbitration the moment both people are in. The moment the second person got in is kept
 * offchain as `resolves_by` (PLANNING.md 5b), but it cannot be what is signed, because the asker signs before
 * that moment exists (docs/decisions.md 2026-09-21).
 */
function requireResolvesBy(d: DareRow): bigint {
  if (d.pace === "argument") return 0n;
  if (!d.resolvesBy) throw new MarketError("this one has no deadline yet", "wrong_state");
  return BigInt(Math.floor(d.resolvesBy.getTime() / 1000));
}

/** What the creator signs. Every field is final before anyone is asked to sign anything. */
export function createTypedData(d: DareRow) {
  const { chainId, dares } = contracts();
  return {
    domain: daresDomain(chainId, dares.address),
    types: daresTypes,
    primaryType: "Create" as const,
    message: {
      dareId: dareOnchainId(d.id),
      groupId: groupOnchainId(d.groupId),
      kind: d.kind === "numeric" ? Kind.Numeric : d.kind === "categorical" ? Kind.Categorical : Kind.Binary,
      pace: d.pace === "argument" ? Pace.Argument : Pace.Dare,
      termsHash: termsHash(d.termsText),
      denomId: denomOnchainId(d.denomId),
      // The scoring scale of a number market, fixed here and signed by the asker; zero for yes-or-no.
      range: d.kind === "numeric" ? (d.range ?? 0n) : 0n,
      // How many answers a pick-one market has, signed by the asker; zero for the other two kinds.
      options: d.kind === "categorical" ? d.outcomeLabels.length : 0,
      stalemate: d.stalemate === "void" ? Stalemate.Void : Stalemate.Arbitrate,
      resolvesBy: requireResolvesBy(d),
    },
  };
}

/** What a participant signs: their stake, their number (basis points, the whole number on a number market, or the answer's index on a pick-one market, with everything on it), and their consent to the stalemate rule, in one signature. */
export function enterTypedData(d: DareRow, stake: bigint, value: bigint) {
  const { chainId, dares } = contracts();
  return {
    domain: daresDomain(chainId, dares.address),
    types: daresTypes,
    primaryType: "Enter" as const,
    message: { dareId: dareOnchainId(d.id), stake, value, confidenceBps: confidenceFor(d), stalemate: d.stalemate === "void" ? Stalemate.Void : Stalemate.Arbitrate },
  };
}

/** What a quorum member signs with their governance wallet. The server holds no key that can make one. */
export function voteTypedData(d: DareRow, outcome: bigint) {
  const { chainId, dares } = contracts();
  return { domain: daresDomain(chainId, dares.address), types: daresTypes, primaryType: "Vote" as const, message: { dareId: dareOnchainId(d.id), outcome: toChainOutcome(outcome) } };
}

// ------------------------------------------------------------------------------------------------ creating

export type MarkInput = { kind: "emoji"; value: string } | { kind: "sticker"; id: string };

export type DraftInput = {
  /** Made by the client on the question step, so the ink previewed there is the one stored; a fresh one otherwise. */
  id?: string;
  creatorId: string;
  groupId: string;
  denomId: string;
  title: string;
  termsText: string;
  /** Null for an argument: it is due the moment the second person is in. */
  resolvesBy: Date | null;
  pace?: "dare" | "argument";
  tier?: "checkable" | "contestable" | null;
  criterion?: string | null;
  mode?: "quick" | "careful";
  stalemate?: "arbitrate" | "void";
  revealMode?: "open" | "blind";
  /** An emoji (drawable by the tile renderer) or one of the creator's own stickers. */
  mark?: MarkInput | null;
  /** A yes-or-no market's outcomes in its own words (docs/design.md 3.25), or null for "Yes" and "No". */
  outcomeWords?: [string, string, string, string] | null;
  /** The asker's IANA zone, for the absolute close time on the link tile (docs/design.md 3.27). */
  zone?: string | null;
  /** Yes-or-no by default. A number market carries its unit and its scoring scale (docs/design.md 3.26). */
  kind?: MarketKind;
  unit?: Unit | null;
  /** The asker's scale, if they set one; else the model's, already through `checkScale`; else the draft is refused. A template's is written by people and shown like an asker's. */
  scale?: { range: bigint; source: "asker" | "ai" | "template" } | null;
  /** The model's most likely answer, when it scoped the question: the far-off check's reference, never shown. */
  typical?: bigint | null;
  /** A pick-one market's answers (docs/design.md 3.29), two to six in the asker's order; a person answer names someone the asker knows, or the asker. */
  answers?: Array<{ text: string; userId?: string | null }> | null;
  /** A What's on market (3.33): the public question it copies. Set only by `draftFromTemplate`. */
  templateId?: string | null;
};

/** The latest moment a question may close, as the server checks it: three calendar years on, and a day for the asker's zone. Pure. */
export function furthestClose(now: Date): number {
  const later = new Date(now.getTime());
  later.setUTCFullYear(later.getUTCFullYear() + LATEST_YEARS);
  return later.getTime() + 86_400_000;
}

/** A draft: terms the creator can read and has not yet signed. Nobody else can see it. */
export async function draftMarket(input: DraftInput): Promise<DareRow> {
  const title = input.title.trim();
  const termsText = input.termsText.trim();
  if (title.length < 3 || title.length > 140) throw new MarketError("Ask it in a line.", "bad_input");
  if (termsText.length < 3 || termsText.length > 800) throw new MarketError("The terms need a sentence.", "bad_input");
  const pace = input.pace ?? "dare";
  if (pace === "dare" && (!input.resolvesBy || input.resolvesBy.getTime() <= Date.now())) throw new MarketError("Pick a time that hasn't passed.", "bad_input");
  // Nothing runs past the furthest a question can (the second-pass round): three years by the calendar, a day either side for the asker's zone.
  if (pace === "dare" && input.resolvesBy && input.resolvesBy.getTime() > furthestClose(new Date())) throw new MarketError("That’s more than three years out. Pick an earlier date.", "bad_input");
  // The criterion a contestable claim is ruled against has to be inside the terms, because the terms are what is hashed and what entering accepts.
  if (input.criterion && !termsText.includes(input.criterion.trim())) throw new MarketError("The terms have to say how it's being decided.", "bad_input");
  if (!(await isMember(input.groupId, input.creatorId))) throw new MarketError("You're not in that group.", "not_member");
  const kind: MarketKind = input.kind ?? "binary";
  // An argument is yes or no, or one of its answers, each person's answer an answer (the first-contact round); never a number.
  if (kind === "numeric" && pace === "argument") throw new MarketError("An argument is yes or no, or one of its answers.", "bad_input");
  // The answers (3.29): two to six, each a few words or a person; a person is someone the asker already knows in the app, or the asker.
  const answers = kind === "categorical" ? (input.answers ?? []).map((a) => ({ text: a.text.trim().replace(/\s+/g, " "), userId: a.userId ?? null })) : [];
  if (kind === "categorical" && (answers.length < MIN_ANSWERS || answers.length > MAX_ANSWERS)) throw new MarketError(`Two to ${MAX_ANSWERS} answers.`, "bad_input");
  if (answers.some((a) => a.text.length < 1 || a.text.length > MAX_ANSWER_LENGTH)) throw new MarketError("Each answer is a few words.", "bad_input");
  if (new Set(answers.map((a) => a.text.toLowerCase())).size !== answers.length) throw new MarketError("Two answers say the same thing.", "bad_input");
  if (answers.some((a) => a.userId)) {
    const known = new Set([input.creatorId, ...(await peopleForUser(input.creatorId)).map((p) => p.user.id)]);
    if (answers.some((a) => a.userId && !known.has(a.userId))) throw new MarketError("One of those people isn’t someone you know here.", "bad_input");
    if (new Set(answers.filter((a) => a.userId).map((a) => a.userId)).size !== answers.filter((a) => a.userId).length) throw new MarketError("Someone is listed twice.", "bad_input");
  }
  const unit = kind === "numeric" ? { singular: input.unit?.singular.trim() ?? "", plural: input.unit?.plural.trim() || input.unit?.singular.trim() || "" } : null;
  if (kind === "numeric" && (!unit || unit.singular.length < 1 || unit.singular.length > 24 || unit.plural.length > 24)) throw new MarketError("Say what the number counts, like shirts.", "bad_input");
  // The scale is a scoring rule (docs/decisions.md 2026-09-24): fixed now, signed by the asker in `Create`, never derived from entries.
  if (kind === "numeric" && (!input.scale || input.scale.range < 1n || input.scale.range > MAX_NUMBER)) throw new MarketError("Say how far off scores nothing, like 20.", "bad_input");
  const denom = await denominationById(input.denomId);
  if (!denom || denom.groupId !== input.groupId) throw new MarketError("That unit belongs to another group.", "bad_input");

  // The offchain mirror of the quorum: the group's account-holders now. The chain takes its own snapshot at lock
  // and that one governs; this is what the ballot shows until then.
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.groupMembers)
    .where(and(eq(schema.groupMembers.groupId, input.groupId), isNotNull(schema.groupMembers.userId), isNull(schema.groupMembers.leftAt)));
  const emoji = input.mark?.kind === "emoji" ? input.mark.value.trim() || null : null;
  // A mark the tile renderer's font cannot draw would be a blank box in the group chat (docs/design.md 1.8).
  if (emoji && !drawable(emoji)) throw new MarketError("That mark can't be drawn on the link. Pick another.", "bad_input");
  // A sticker is the creator's own (3.28: "Your stickers"); its ink was measured from its pixels when it was made.
  const sticker = input.mark?.kind === "sticker" ? await pictureMarkById(input.mark.id) : null;
  if (input.mark?.kind === "sticker" && (!sticker || sticker.ownerId !== input.creatorId)) throw new MarketError("That sticker isn't one of yours.", "bad_input");
  // The market's ink (docs/design.md 1.8): the mark's hue, or a hash of the id, balanced against the inks of the
  // questions still open between these people. Decided once, here, and stored, so balance never re-reads pixels.
  const id = input.id && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id) ? input.id.toLowerCase() : randomUUID();
  const openHere = await db
    .select({ id: schema.dares.id, ink: schema.dares.ink })
    .from(schema.dares)
    .where(and(eq(schema.dares.groupId, input.groupId), isNotNull(schema.dares.creatorSignature), isNull(schema.dares.resolvedAt)));
  const chosen = inkFor({ markInk: emoji ? emojiInk(emoji) : sticker && isInkName(sticker.ink) ? sticker.ink : null, id, takenInGroup: openHere.map((o) => inkOf(o)) });
  const [row] = await db
    .insert(schema.dares)
    .values({
      id,
      ink: chosen.ink,
      inkSource: chosen.source,
      zone: input.zone ?? null,
      groupId: input.groupId,
      kind,
      pace,
      tier: input.tier ?? null,
      criterion: input.criterion?.trim() || null,
      mode: input.mode ?? "quick",
      creatorId: input.creatorId,
      title,
      termsText,
      outcomeLabels: unit ? [unit.singular, unit.plural] : kind === "categorical" ? answers.map((a) => a.text) : ["no", "yes"],
      answerPeople: kind === "categorical" && answers.some((a) => a.userId) ? answers.map((a) => a.userId) : null,
      range: kind === "numeric" && input.scale ? input.scale.range : null,
      rangeSource: kind === "numeric" && input.scale ? input.scale.source : null,
      typical: kind === "numeric" && input.typical !== undefined && input.typical !== null && input.typical >= 0n && input.typical <= MAX_NUMBER ? input.typical : null,
      denomId: denom.id,
      stalemate: input.stalemate ?? "arbitrate",
      revealMode: input.revealMode ?? "open",
      resolvesBy: pace === "argument" ? null : input.resolvesBy,
      threshold: Math.floor(n / 2) + 1,
      markKind: emoji ? "emoji" : sticker ? "sticker" : null,
      markValue: emoji ?? sticker?.id ?? null,
      outcomeWords: kind === "binary" && input.outcomeWords ? input.outcomeWords.map((w) => w.trim()) : null,
      templateId: input.templateId ?? null,
    })
    .returning();
  if (!row) throw new MarketError("Couldn't save that.", "chain");
  return row;
}

/**
 * A market from a public question (docs/design.md 3.33; docs/decisions.md, public markets): the template's
 * question, terms, kind, unit, scale, answers and outcome words copied onto an ordinary market, closing when the
 * game starts, its tiebreaker fixed to the final score (the terms say so in plain words, and the entry signature
 * carries that consent), wearing the sport's mark. The asker is whoever sends it; everything after is the usual.
 * Refused once the game has started, and while the source has not confirmed the start time.
 */
export async function draftFromTemplate(input: { templateId: string; creatorId: string; groupId: string; denomId: string; zone?: string | null; id?: string; now?: Date }): Promise<DareRow> {
  const [row] = await db.select({ template: schema.publicQuestions, game: schema.sportsGames }).from(schema.publicQuestions).innerJoin(schema.sportsGames, eq(schema.sportsGames.id, schema.publicQuestions.gameId)).where(eq(schema.publicQuestions.id, input.templateId)).limit(1);
  if (!row) throw new MarketError("That question isn't on any more.", "not_found");
  const { template: t, game } = row;
  const now = input.now ?? new Date();
  if (!game.timeValid) throw new MarketError("That game doesn't have a confirmed start time yet.", "bad_input");
  if (game.startsAt.getTime() <= now.getTime()) throw new MarketError("That game has started, so it's too late to ask.", "bad_input");
  if (game.status === "postponed" || game.status === "canceled") throw new MarketError("That game is off.", "bad_input");
  const words = t.outcomeWords && t.outcomeWords.length === 4 ? (t.outcomeWords as [string, string, string, string]) : null;
  const mark = SPORT_MARK[game.sport as keyof typeof SPORT_MARK];
  return draftMarket({
    id: input.id,
    creatorId: input.creatorId,
    groupId: input.groupId,
    denomId: input.denomId,
    title: t.title,
    termsText: t.termsText,
    kind: t.kind as MarketKind,
    unit: t.kind === "numeric" ? { singular: t.outcomeLabels[0] ?? "", plural: t.outcomeLabels[1] ?? t.outcomeLabels[0] ?? "" } : null,
    scale: t.kind === "numeric" && t.range !== null ? { range: t.range, source: "template" } : null,
    typical: t.typical,
    answers: t.kind === "categorical" ? t.outcomeLabels.map((text) => ({ text })) : null,
    outcomeWords: t.kind === "binary" ? words : null,
    resolvesBy: game.startsAt,
    stalemate: "arbitrate",
    revealMode: "open",
    mark: mark ? { kind: "emoji", value: mark } : null,
    zone: input.zone ?? null,
    templateId: t.id,
  });
}

/** The creator's signature opens the market. Verified here against their ledger wallet; verified again onchain at lock. */
export async function openMarket(dareId: string, creatorId: string, signature: Hex): Promise<DareRow> {
  const d = await marketById(dareId);
  if (!d) throw new MarketError("That one doesn't exist.", "not_found");
  if (d.creatorId !== creatorId) throw new MarketError("Only the person who asked it can open it.", "not_yours");
  if (stateOf(d) !== "draft") return d;
  const [creator] = await db.select().from(schema.users).where(eq(schema.users.id, creatorId)).limit(1);
  if (!creator) throw new MarketError("unknown user", "not_found");
  const ok = await verifyTypedData({ ...createTypedData(d), address: creator.ledgerWallet as Address, signature });
  if (!ok) throw new MarketError("That didn't come from your account.", "bad_signature");
  const [row] = await db.update(schema.dares).set({ creatorSignature: hexToBuffer(signature) }).where(and(eq(schema.dares.id, dareId), isNull(schema.dares.creatorSignature))).returning();
  // Counted once it is open (the field round): the kind, the pace, where it came from and whether it wears a sticker; never its words.
  if (row) await record("asked", { kind: kindWord(d.kind), pace: d.pace === "argument" ? "argument" : "dare", source: d.templateId ? "whats_on" : "direct", mark: markWord(d.markKind) }, { userId: creatorId }, { dareId: d.id });
  return row ?? d;
}

function kindWord(kind: string): "binary" | "numeric" | "categorical" {
  return kind === "numeric" || kind === "categorical" ? kind : "binary";
}
function markWord(markKind: string | null): "none" | "emoji" | "image" | "sticker" {
  return markKind === "emoji" || markKind === "image" || markKind === "sticker" ? markKind : "none";
}

// ------------------------------------------------------------------------------------------------ entering

/**
 * A position: a stake and a number, signed by the person whose position it is. One per person per market; it
 * can be changed until lock, and each change is a fresh signature over the new numbers, because the signature is
 * what goes onchain.
 */
/** Whether this person withdrew an entry made on a friend's phone from this blind market (3.45): a dismissed position of theirs that a host entered. */
export async function withdrewHostedEntry(dareId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.darePositions.dareId })
    .from(schema.darePositions)
    .where(and(eq(schema.darePositions.dareId, dareId), eq(schema.darePositions.userId, userId), sql`${schema.darePositions.dismissedAt} is not null`, sql`${schema.darePositions.enteredBy} is distinct from ${schema.darePositions.userId}`))
    .limit(1);
  return Boolean(row);
}

/**
 * The close is a hard cutoff (CLAUDE.md; docs/design.md 3.33 for a game, which closes at kickoff): once a
 * question's own time has passed nobody gets in or changes, whether or not the tick has locked it yet, since the
 * outcome may already be knowable. The tick locks at the time only with two in, so without this a question with
 * one person in stayed enterable after its close. An argument has no time until its second entry, and locks the
 * moment it does, so it is never past its time here. Pure, and shared with the entry made without an account.
 */
export function pastItsClose(d: Pick<DareRow, "pace" | "resolvesBy">, now: Date): boolean {
  return d.pace !== "argument" && d.resolvesBy !== null && d.resolvesBy.getTime() <= now.getTime();
}

export async function enterMarket(input: { dareId: string; userId: string; stake: bigint; value: bigint; signature: Hex; /** The host, when the entry was made on a friend's phone (3.45); the person themselves otherwise. */ enteredBy?: string }): Promise<PositionRow> {
  const d = await marketById(input.dareId);
  if (!d) throw new MarketError("That one doesn't exist.", "not_found");
  if (stateOf(d) !== "open") throw new MarketError(stateOf(d) === "draft" ? "It isn't open yet." : "Numbers are locked.", "wrong_state");
  // Past its time and not yet locked: the same refusal as after the lock, since to the person it is the same fact.
  if (pastItsClose(d, new Date())) throw new MarketError("Numbers are locked.", "wrong_state");
  if (!(await isMember(d.groupId, input.userId))) throw new MarketError("This one is for the people in its group.", "not_member");
  if (!valueAllowed(d.kind, input.value, d.outcomeLabels.length)) throw new MarketError(d.kind === "numeric" ? "Any whole number, up to nine digits." : d.kind === "categorical" ? "Pick one of the answers." : "A number from 0 to 100.", "bad_input");
  const denom = await denominationById(d.denomId);
  if (!denom) throw new MarketError("unknown unit", "not_found");
  // An unquantifiable unit ("a next time") forces every stake to 1; the contract refuses anything else.
  if (!denom.quantifiable && input.stake !== 1n) throw new MarketError("With this unit everyone puts up exactly one.", "bad_input");
  if (input.stake <= 0n) throw new MarketError("Put something on it.", "bad_input");

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, input.userId)).limit(1);
  if (!user) throw new MarketError("unknown user", "not_found");
  const ok = await verifyTypedData({ ...enterTypedData(d, input.stake, input.value), address: user.ledgerWallet as Address, signature: input.signature });
  if (!ok) throw new MarketError("That didn't come from your account.", "bad_signature");

  const existing = await positionsOf(d.id);
  // On a blind market an entry is final once made (3.22, 3.31): you see everyone's once you're in, so nobody may change theirs after seeing the others. Keeping a bound ghost's unsigned numbers as they are is the signature, not a change.
  const held = existing.find((p) => p.userId === input.userId);
  if (held && d.revealMode === "blind" && (held.stake !== input.stake || held.value !== input.value)) throw new MarketError("Yours is final on this one.", "wrong_state");
  // A blind entry made on a friend's phone and withdrawn from the person's own (3.45): withdrawn, not changed, so nothing comes in again. Otherwise the remedy for a watched PIN would be a way around blind.
  if (!held && d.revealMode === "blind" && (await withdrewHostedEntry(d.id, input.userId))) throw new MarketError("You withdrew this one, so it's closed to you.", "wrong_state");
  // An argument is between two people. A third number would make it a different kind of question.
  if (d.pace === "argument" && existing.length >= 2 && !existing.some((p) => p.userId === input.userId)) throw new MarketError("This one's between the two of them. You can watch how it comes out.", "wrong_state");
  if (!existing.some((p) => p.userId === input.userId) && existing.length >= MAX_POSITIONS) throw new MarketError(`This one is full at ${MAX_POSITIONS}.`, "wrong_state");

  const now = new Date();
  const [row] = await db
    .insert(schema.darePositions)
    .values({ dareId: d.id, userId: input.userId, stake: input.stake, value: input.value, confidenceBps: d.kind === "categorical" ? confidenceFor(d) : null, enterSignature: hexToBuffer(input.signature), enteredBy: input.enteredBy ?? input.userId, acknowledgedAt: now, dismissedAt: null, changedAt: now })
    .onConflictDoUpdate({ target: [schema.darePositions.dareId, schema.darePositions.userId], set: { stake: input.stake, value: input.value, confidenceBps: d.kind === "categorical" ? confidenceFor(d) : null, enterSignature: hexToBuffer(input.signature), enteredBy: input.enteredBy ?? input.userId, dismissedAt: null, changedAt: now } })
    .returning();
  if (!row) throw new MarketError("Couldn't save that.", "chain");
  // Counted as an entry the first time, never on a change (the field round); on a friend's phone it is counted as pass the phone.
  if (!held) await record("entered", { as: input.enteredBy && input.enteredBy !== input.userId ? "pass_the_phone" : "account" }, { userId: input.userId }, { dareId: d.id });
  // The group's number at this moment, for the line a slow question gets. The aggregate and a headcount only:
  // never whose entry moved it (docs/design.md 3.22). Best effort; a missing point is a gap in a sparkline.
  // A number market's aggregate is not in basis points and the series column is, so it keeps no series yet (docs/decisions.md, Phase 5);
  // a pick-one market has no aggregate at all: a pick is a choice, not a number (3.30).
  if (d.kind !== "binary") return row;
  try {
    const all = await positionsOf(d.id);
    const number = groupsNumberBps(all.map((p) => ({ id: pidOf(p), stake: p.stake, valueBps: p.value })));
    if (number !== null) await db.insert(schema.dareNumberSeries).values({ dareId: d.id, valueBps: Number(number), entries: all.length });
  } catch (err) {
    console.error("recording the group's number failed", { dareId: d.id, err });
  }
  return row;
}

// ------------------------------------------------------------------------------------------------- locking

/**
 * Lock: the first chain write. One `create` carries the market and every position with its owner's signature, or
 * nothing lands at all. The quorum is whatever the ledger says the group is at that moment, never anything sent
 * from here, and the threshold the contract computed is mirrored back.
 */
/**
 * Who may close a market by hand (the field round, 1.2): its asker while it runs, and once its close time has
 * passed anyone in it, since a close the time should have made is nobody's privilege and a market stuck past
 * its close is everyone's to finish. Pure, so the rule is held by a test.
 */
export function mayClose(d: { creatorId: string; resolvesBy: Date | null; inIt: ReadonlyArray<string | null> }, byUserId: string, now: Date): boolean {
  if (d.creatorId === byUserId) return true;
  const timesUp = d.resolvesBy !== null && d.resolvesBy.getTime() <= now.getTime();
  return timesUp && d.inIt.includes(byUserId);
}

/** When an entry last changed: the stamp every entry and change writes, or, on a row from before the stamp existed, when it was first made. */
export function lastChanged(p: Pick<PositionRow, "changedAt" | "enteredAt">): Date {
  return p.changedAt ?? p.enteredAt;
}

/**
 * The close time ends editing whether or not the close has run (the field round, the owner's rule on late
 * closes): at any close after the close time, an entry last changed after it does not count, since by then the
 * outcome may be knowable (for a game, the close time is its start). Pure: the entries that count and the late ones.
 */
export function countedAtClose<P extends Pick<PositionRow, "changedAt" | "enteredAt">>(positions: P[], resolvesBy: Date): { counted: P[]; late: P[] } {
  const counted: P[] = [];
  const late: P[] = [];
  for (const p of positions) (lastChanged(p).getTime() <= resolvesBy.getTime() ? counted : late).push(p);
  return { counted, late };
}

/** An open or closed question ends with nothing decided: no outcome, nothing minted, no toll. Idempotent; true when this call ended it. */
export async function markExpired(dareId: string, now: Date): Promise<boolean> {
  const done = await db.update(schema.dares).set({ resolvedBy: "expired", resolvedAt: now, resolvedOutcome: null }).where(and(eq(schema.dares.id, dareId), isNull(schema.dares.resolvedAt))).returning({ id: schema.dares.id });
  if (done.length > 0) await record("settled", { by: "expired", outcome: "none" }, {}, { dareId });
  return done.length > 0;
}

/** `byUserId` null is the app itself: an argument locks the moment its second person is in, and the scheduler locks a question whose time has come. */
export async function lockMarket(dareId: string, byUserId: string | null, now: Date = new Date()): Promise<{ txHash: Hex; threshold: number; quorum: Address[]; /** The close found fewer than two entries that count, so the question ended as an expiry instead. */ expired?: true }> {
  const d = await marketById(dareId);
  if (!d) throw new MarketError("That one doesn't exist.", "not_found");
  // A second tap on Close, or a close the time made while the first was on its way, finds it closed: that is the
  // close that was asked for, answered as done and sent nowhere twice (the field round, 1.6).
  if (d.lockedAt) return { txHash: "0x" as Hex, threshold: d.threshold, quorum: [] };
  if (stateOf(d) !== "open" || !d.creatorSignature) throw new MarketError(WORDS.changed, "wrong_state");
  let positions = await positionsOf(d.id);
  if (byUserId !== null && !mayClose({ creatorId: d.creatorId, resolvesBy: d.resolvesBy, inIt: positions.map((p) => p.userId) }, byUserId, now)) {
    const [asker] = await db.select({ displayName: schema.users.displayName }).from(schema.users).where(eq(schema.users.id, d.creatorId)).limit(1);
    throw new MarketError(notAllowed(firstName(asker?.displayName ?? "the asker"), "close"), "not_yours");
  }
  // A close after the close time counts only the entries as they stood at that time (`countedAtClose`): with fewer
  // than two of those the question ends as an expiry, and an entry changed after it is out of the close, whoever
  // closes and however late. An argument has no close time of its own, so it is never past it here.
  if (pastItsClose(d, now) && d.resolvesBy) {
    const { counted, late } = countedAtClose(positions, d.resolvesBy);
    if (counted.length < 2) {
      await markExpired(d.id, now);
      return { txHash: "0x" as Hex, threshold: d.threshold, quorum: [], expired: true };
    }
    for (const p of late) {
      await db
        .update(schema.darePositions)
        .set({ dismissedAt: now })
        .where(and(eq(schema.darePositions.dareId, d.id), p.userId ? eq(schema.darePositions.userId, p.userId) : eq(schema.darePositions.claimId, p.claimId as string)));
    }
    if (late.length > 0) console.warn("entries changed after the close time were left out of the close", { dareId: d.id, late: late.length });
    positions = counted;
  }
  if (positions.length < 2) throw new MarketError("It takes two to close it.", "wrong_state");
  // Nothing goes onchain for a position nobody signed (PLANNING.md section 4): a ghost's number, or one bound to
  // an account but never signed, makes the market provisional. It locks here, and its transfers become proposals.
  await record("closed", { by: byUserId !== null ? "asker" : d.pace === "argument" ? "both_in" : "time", game: d.templateId !== null }, { userId: byUserId }, { dareId: d.id });
  if (positions.some((p) => !p.userId || !p.enterSignature)) {
    const r = await lockProvisional(d, positions);
    return { txHash: "0x" as Hex, threshold: r.threshold, quorum: [] };
  }

  const users = await db.select().from(schema.users).where(inArray(schema.users.id, positions.map((p) => p.userId as string)));
  const ledgerOf = new Map(users.map((u) => [u.id, u.ledgerWallet as Address]));
  const [creator] = await db.select().from(schema.users).where(eq(schema.users.id, d.creatorId)).limit(1);
  if (!creator) throw new MarketError("unknown creator", "not_found");

  // A question is decided by a majority of the people in it, and nobody else counts (the owner's rule, 2026-10-06).
  // The chain keeps it only when it would ask exactly them: the deployed contract asks everyone ever registered in
  // the set, the asker included. Anything else is decided here, by the same majority, and settles as proposals each
  // debtor confirms; nothing is registered for it, so nobody joins the set's voters on the chain by its lock.
  const inIt = positions.map((p) => p.userId as string);
  const wallets = users.map((u) => u.governanceWallet);
  if (!chainCarries({ registered: await registeredVoters(d.groupId), inIt: wallets, asker: creator.governanceWallet })) {
    const r = await lockProvisional(d, positions);
    return { txHash: "0x" as Hex, threshold: r.threshold, quorum: [] };
  }
  // Registration: the people in, and the asker, who is one of them here, and the unit. Both are idempotent.
  await ensureGroupOnchain(d.groupId, [...inIt, d.creatorId]);
  await ensureDenomOnchain(d.denomId, [...inIt, d.creatorId]);

  const typed = createTypedData(d);
  const { dares } = contracts();
  // The voters the contract will snapshot are the people in, as checked above.
  const quorumNow = wallets;

  const dareStruct = {
    id: typed.message.dareId,
    groupId: typed.message.groupId,
    kind: typed.message.kind,
    pace: typed.message.pace,
    creator: creator.ledgerWallet as Address,
    termsHash: typed.message.termsHash,
    denomId: typed.message.denomId,
    range: typed.message.range,
    options: typed.message.options,
    stalemate: typed.message.stalemate,
    quorum: [] as Address[], // ignored by the contract, which reads the ledger
    threshold: 0,
    resolvesBy: typed.message.resolvesBy,
    status: 0,
    outcome: 0n,
  };
  const ps = positions.map((p) => {
    const ledger = ledgerOf.get(p.userId as string);
    if (!ledger) throw new MarketError("someone in it has no account", "wrong_state");
    // A pick carries everything on it (3.30); a number carries no confidence. The same figure each person signed.
    return { ledger, stake: p.stake, value: p.value, confidenceBps: confidenceFor(d) };
  });
  const sigs = positions.map((p) => bufferToHex(p.enterSignature as Buffer));

  let txHash: Hex;
  let minedIn: bigint | undefined;
  try {
    const result = await submit({
      label: `create market ${d.id}`,
      address: dares.address,
      abi: dares.abi,
      functionName: "create",
      args: [dareStruct, ps, sigs, bufferToHex(d.creatorSignature)],
      gas: gasFor.create(ps.length, quorumNow.length),
      write: { kind: "create", subject: { dareId: d.id }, actor: byUserId },
    });
    txHash = result.hash;
    minedIn = result.receipt.blockNumber;
  } catch (err) {
    if (err instanceof SendPending) throw err;
    // A retry after a lock whose mirror never got written finds the market already there. That is a lock.
    const already = /DareExists/.test(err instanceof Error ? err.message : "");
    // The raw failure goes to the log, never to the person (5.4): what reaches the screen is what happened and what to do.
    if (!already) {
      console.error("lock failed", { dareId: d.id, err: err instanceof Error ? err.message : err });
      throw new MarketError("Closing it didn’t go through. Nothing changed.", "chain");
    }
    txHash = "0x" as Hex;
  }
  const onchain = await completeLock(d, minedIn);
  return { txHash, threshold: onchain.threshold, quorum: [...onchain.quorum] };
}

/**
 * The offchain mirror of a lock once the chain has it, idempotent: the market is locked the moment the
 * transaction succeeds, so that is recorded first and nothing after can leave a market locked onchain and open
 * here; the room closes with the numbers; then what the contract decided is read at the block it was mined in
 * (a load-balanced node can otherwise say the market does not exist). The tick calls this for a send whose
 * receipt outlived the request (docs/decisions.md 2026-09-27).
 */
export async function completeLock(d: DareRow, minedIn?: bigint): Promise<{ threshold: number; quorum: readonly Address[] }> {
  const { dares } = contracts();
  const { publicClient } = relayer();
  const dareId = createTypedData(d).message.dareId;
  await db.update(schema.dares).set({ onchainId: hexToBuffer(dareId), lockedAt: new Date() }).where(and(eq(schema.dares.id, d.id), isNull(schema.dares.lockedAt)));
  await db.update(schema.roomCodes).set({ closedAt: new Date() }).where(and(eq(schema.roomCodes.dareId, d.id), isNull(schema.roomCodes.closedAt)));
  const onchain = (await publicClient.readContract({ address: dares.address, abi: dares.abi, functionName: "dareOf", args: [dareId], blockNumber: minedIn })) as { threshold: number; quorum: readonly Address[] };
  await db.update(schema.dares).set({ threshold: onchain.threshold }).where(eq(schema.dares.id, d.id));
  // Only the people in decide it (2026-10-06): a registration landing between the lock's check and its send would
  // have put someone else in the chain's snapshot, which no later step can take out, so it is said here, loudly.
  const people = await db.select({ wallet: schema.users.governanceWallet }).from(schema.darePositions).innerJoin(schema.users, eq(schema.users.id, schema.darePositions.userId)).where(and(eq(schema.darePositions.dareId, d.id), isNotNull(schema.darePositions.acknowledgedAt), isNull(schema.darePositions.dismissedAt)));
  if (!snapshotIsThePeopleIn(onchain.quorum, people.map((p) => p.wallet))) console.error("a lock's voters on the chain are not the people in", { dareId: d.id, snapshot: onchain.quorum.length, inIt: people.length });
  return onchain;
}

// -------------------------------------------------------------------------------------------------- voting

/**
 * Who may vote, by governance wallet: the account-holders in the market (the first-contact round, 2026-10-04), and
 * on a market the chain holds only those of them its snapshot names. The ballot is only ever offered to these.
 */
export async function quorumOf(d: DareRow): Promise<Address[]> {
  if (!isProvisional(d) && !d.onchainId) return [];
  const voters = provisionalVoters(await positionsOf(d.id));
  const users = voters.length ? await db.select({ governanceWallet: schema.users.governanceWallet }).from(schema.users).where(inArray(schema.users.id, voters)) : [];
  const theirs = users.map((u) => u.governanceWallet.toLowerCase() as Address);
  if (isProvisional(d) || !d.onchainId) return theirs;
  const { dares } = contracts();
  const onchain = (await relayer().publicClient.readContract({ address: dares.address, abi: dares.abi, functionName: "dareOf", args: [bufferToHex(d.onchainId)] })) as { quorum: readonly Address[] };
  return inTheSnapshot(theirs, onchain.quorum);
}

/** The people in whom the chain's snapshot also names: on a market the chain holds, only they can sign a vote it takes. */
export function inTheSnapshot(theirs: Address[], snapshot: readonly string[]): Address[] {
  const names = new Set(snapshot.map((a) => a.toLowerCase()));
  return theirs.filter((w) => names.has(w));
}

/** One line from someone in it about what happened. It is what the outcome proposal reads. */
export async function sayWhatHappened(dareId: string, userId: string, statement: string): Promise<void> {
  const d = await marketById(dareId);
  if (!d) throw new MarketError("That one doesn't exist.", "not_found");
  if (stateOf(d) !== "locked") throw new MarketError("There’s nothing to call on this one right now.", "wrong_state");
  if (!(await positionsOf(d.id)).some((p) => p.userId === userId)) throw new MarketError(ONLY_THOSE_IN, "not_member");
  const text = statement.trim().slice(0, 280);
  if (text.length < 2) throw new MarketError("Say what happened in a line.", "bad_input");
  await db
    .insert(schema.dareStatements)
    .values({ dareId, userId, statement: text })
    .onConflictDoUpdate({ target: [schema.dareStatements.dareId, schema.dareStatements.userId, schema.dareStatements.kind], set: { statement: text, statedAt: new Date() } });
}

export type Tally = { outcome: bigint; votes: number }[];
export function tally(votes: Pick<VoteRow, "outcome">[]): Tally {
  const by = new Map<bigint, number>();
  for (const v of votes) by.set(v.outcome, (by.get(v.outcome) ?? 0) + 1);
  return Array.from(by, ([outcome, n]) => ({ outcome, votes: n })).sort((a, b) => b.votes - a.votes);
}

/**
 * A vote: a governance-wallet signature over (market, outcome), from someone in the quorum the chain snapshotted.
 * One per person, changeable until it resolves. When `threshold` signatures agree, this submits `resolve`, in a
 * transaction of its own, with exactly those signatures. The server relays votes; it cannot make one.
 */
export async function castVote(input: { dareId: string; userId: string; outcome: bigint; signature: Hex }): Promise<{ resolved: boolean; txHash?: Hex }> {
  const d = await marketById(input.dareId);
  if (!d) throw new MarketError("That one doesn't exist.", "not_found");
  if (stateOf(d) !== "locked") throw new MarketError(d.resolvedAt ? "It's already decided." : "It isn't locked yet.", "wrong_state");
  if (!outcomeAllowed(d.kind, input.outcome, d.outcomeLabels.length)) throw new MarketError(d.kind === "numeric" ? "A whole number, or nobody can tell." : d.kind === "categorical" ? "One of the answers, or nobody can tell." : "Yes, no, or nobody can tell.", "bad_input");

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, input.userId)).limit(1);
  if (!user) throw new MarketError("unknown user", "not_found");
  // Only the people in it vote (the first-contact round, 2026-10-04): a member of the set who never got in is refused here, before any signature is read.
  if (!(await positionsOf(d.id)).some((p) => p.userId === input.userId)) throw new MarketError(ONLY_THOSE_IN, "not_member");
  const quorum = await quorumOf(d);
  if (!quorum.includes(user.governanceWallet.toLowerCase() as Address)) throw new MarketError("This one was locked before you joined the group, so it isn't yours to call.", "not_member");
  const ok = await verifyTypedData({ ...voteTypedData(d, input.outcome), address: user.governanceWallet as Address, signature: input.signature });
  if (!ok) throw new MarketError("That didn't come from your account.", "bad_signature");

  await db
    .insert(schema.dareVotes)
    .values({ dareId: d.id, userId: input.userId, outcome: input.outcome, signature: hexToBuffer(input.signature) })
    .onConflictDoUpdate({ target: [schema.dareVotes.dareId, schema.dareVotes.userId], set: { outcome: input.outcome, signature: hexToBuffer(input.signature), signedAt: new Date() } });
  await record("voted", { provisional: isProvisional(d) }, { userId: input.userId }, { dareId: d.id });

  return resolveFromVotes(d, input.userId);
}

/**
 * The votes already signed decide it, or nothing does yet: the leading outcome at or past the threshold is
 * submitted with exactly the signatures that agree. The last voter's tap calls this; so does the tick, for a
 * question whose votes reached the threshold and whose resolution never landed (docs/decisions.md 2026-09-27).
 */
export async function resolveFromVotes(d: DareRow, byUserId: string | null): Promise<{ resolved: boolean; txHash?: Hex }> {
  const votes = await votesOf(d.id);
  const leading = tally(votes)[0];
  if (!leading || leading.votes < d.threshold) return { resolved: false };
  const txHash = await resolveMarket(d, leading.outcome, votes.filter((v) => v.outcome === leading.outcome), byUserId);
  return { resolved: true, txHash };
}

export type Settlement = { outcome: bigint; txHash: Hex; scores: Map<string, number>; edges: Array<{ tokenId: bigint; debtor: string; creditor: string; qty: bigint; obligationId: Hex; unique: boolean }> };

/** One resolution, one transaction. Then the chain's answer is mirrored: scores, nets, and one shadow row per edge. */
async function resolveMarket(d: DareRow, outcome: bigint, agreeing: VoteRow[], byUserId: string | null): Promise<Hex> {
  if (isProvisional(d)) {
    // Decided by the same signatures the chain would take, settled here: one proposal per transfer, nothing minted.
    await settleProvisional(d, await positionsOf(d.id), outcome, { by: "quorum" });
    return "0x" as Hex;
  }
  if (!d.onchainId) throw new MarketError("It isn't locked yet.", "wrong_state");
  const positions = await positionsOf(d.id);
  const { dares, ledger } = contracts();
  let result;
  try {
    result = await submit({
      label: `resolve market ${d.id}`,
      address: dares.address,
      abi: dares.abi,
      functionName: "resolve",
      args: [bufferToHex(d.onchainId), toChainOutcome(outcome), agreeing.map((v) => bufferToHex(v.signature))],
      // A void mints nothing, and Monad charges what is declared: it never pays for edges it cannot mint.
      gas: outcome === VOID_OUTCOME ? gasFor.resolveVoid(agreeing.length) : gasFor.resolve(positions.length, agreeing.length),
      write: { kind: "resolve", subject: { dareId: d.id }, actor: byUserId },
    });
  } catch (err) {
    if (err instanceof SendPending) throw err;
    // Two last votes can arrive together; the second finds the market already resolved. That is not a failure.
    if (await reconcileFromIndexer(d.id)) return "0x" as Hex;
    console.error("resolve failed", { dareId: d.id, err: err instanceof Error ? err.message : err });
    throw new MarketError("The votes are in, but recording it didn’t go through. Tap again to retry.", "chain");
  }

  await mirrorSettlement(d, settlementFromReceipt(result, outcome), { by: "quorum" });
  return result.hash;
}

/** Reads a settlement out of its receipt: who scored what, and which edges were minted. One resolution per transaction, so every edge in it is this market's. */
export function settlementFromReceipt(result: { hash: Hex; receipt: { logs: ReadonlyArray<{ address: string; data: Hex; topics: [] | [signature: Hex, ...args: Hex[]] }> } }, outcome: bigint): Settlement {
  const { dares, ledger } = contracts();
  const settlement: Settlement = { outcome, txHash: result.hash, scores: new Map(), edges: [] };
  for (const log of result.receipt.logs) {
    const addr = log.address.toLowerCase();
    try {
      if (addr === dares.address.toLowerCase()) {
        const ev = decodeEventLog({ abi: dares.abi, data: log.data, topics: log.topics });
        if (ev.eventName === "Scored") settlement.scores.set((ev.args as { participant: Address }).participant.toLowerCase(), Number((ev.args as { score: number }).score));
      } else if (addr === ledger.address.toLowerCase()) {
        const ev = decodeEventLog({ abi: ledger.abi, data: log.data, topics: log.topics });
        if (ev.eventName === "Confirmed") {
          const a = ev.args as { debtor: Address; creditor: Address; id: bigint; qty: bigint; obligationId: Hex; unique: boolean };
          settlement.edges.push({ tokenId: a.id, debtor: a.debtor.toLowerCase(), creditor: a.creditor.toLowerCase(), qty: a.qty, obligationId: a.obligationId.slice(0, 34) as Hex, unique: a.unique });
        }
      }
    } catch {
      // A log with another event signature; not ours to read.
    }
  }
  return settlement;
}

/**
 * The offchain mirror of a settlement, written once and idempotently: the outcome, each person's score and net,
 * and one shadow `obligations` row per minted edge (the edge's onchain id is its uuid, so the two sides join the
 * way every other obligation does). A partial result is refused rather than recorded.
 */
export async function mirrorSettlement(d: DareRow, s: Settlement, how: { by: "quorum" | "arbitration" | "feed"; rulingText?: string; rulingHash?: Hex }): Promise<void> {
  const positions = await positionsOf(d.id);
  const users = await db.select().from(schema.users).where(inArray(schema.users.id, positions.map((p) => p.userId as string)));
  const byLedger = new Map(users.map((u) => [u.ledgerWallet.toLowerCase(), u]));
  const denom = await denominationById(d.denomId);
  const voided = s.outcome === VOID_OUTCOME;
  if (!voided && s.scores.size !== positions.length) throw new MarketError(`the settlement scored ${s.scores.size} of ${positions.length} people; refusing to record a partial result`, "chain");
  if (voided && s.edges.length > 0) throw new MarketError("a voided market minted something; refusing to record it", "chain");
  // The scale, checked afterward (src/lib/ledger/scale.ts): a number market whose answer fell outside its own scale
  // for most people, or whose scale was so wide that nobody's miss mattered, is visible in the log and in verify-envio.
  if (!voided && d.kind === "numeric") {
    const after = scaleAfterward([...s.scores.values()].map((x) => BigInt(x)));
    if (after.floored * 2 > after.of || after.allNear) console.warn("number market scale", { dareId: d.id, range: d.range?.toString(), source: d.rangeSource, outcome: s.outcome.toString(), ...after });
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(schema.dares).set({ resolvedOutcome: s.outcome, resolvedBy: how.by, resolvedAt: now, ...(how.rulingText && how.rulingHash ? { rulingText: how.rulingText, rulingHash: hexToBuffer(how.rulingHash) } : {}) }).where(and(eq(schema.dares.id, d.id), isNull(schema.dares.resolvedAt)));
    for (const p of positions) {
      const wallet = users.find((x) => x.id === p.userId)?.ledgerWallet.toLowerCase() ?? "";
      const net = s.edges.reduce((a, e) => a + (e.creditor === wallet ? e.qty : 0n) - (e.debtor === wallet ? e.qty : 0n), 0n);
      await tx
        .update(schema.darePositions)
        .set({ score: voided ? null : (s.scores.get(wallet) ?? null), net: voided ? null : net })
        .where(and(eq(schema.darePositions.dareId, d.id), eq(schema.darePositions.userId, p.userId as string)));
    }
    for (const e of s.edges) {
      const from = byLedger.get(e.debtor);
      const to = byLedger.get(e.creditor);
      if (!from || !to) throw new MarketError("the settlement minted an edge to someone who is not in the market", "chain");
      await tx
        .insert(schema.obligations)
        .values({
          id: bytes16ToUuid(e.obligationId),
          tokenId: e.tokenId,
          groupId: d.groupId,
          fromUser: from.id,
          toUser: to.id,
          denomId: d.denomId,
          quantity: denom?.quantifiable === false ? null : e.qty,
          uniqueObligation: e.unique,
          amountCents: denom?.monetary ? e.qty : null,
          origin: "dare",
          originId: d.id,
          settleExpected: denom?.monetary ?? false,
          memo: null,
          confirmTx: hexToBuffer(s.txHash),
          createdAt: now,
        })
        .onConflictDoNothing();
    }
  });
  await record("settled", { by: settledWord(how.by), outcome: voided ? "void" : "decided" }, {}, { dareId: d.id });
}

/**
 * If the chain says a market is decided and this database does not, take the chain's word (through the indexer,
 * the only chain reader). Covers a mirror write that failed after the transaction succeeded, and two final votes
 * arriving at once. Returns whether the market is now recorded as decided.
 */
export async function reconcileFromIndexer(dareId: string, how?: { by: "quorum" | "arbitration" | "feed"; rulingText?: string; rulingHash?: Hex }): Promise<boolean> {
  const d = await marketById(dareId);
  if (!d || !d.onchainId) return false;
  if (d.resolvedAt) return true;
  const indexed = await dareByOnchainId(bufferToHex(d.onchainId)).catch(() => null);
  if (!indexed || (indexed.status !== "RESOLVED" && indexed.status !== "VOIDED") || !indexed.resolveTx) return false;
  await mirrorSettlement(d, {
    outcome: indexed.status === "VOIDED" ? VOID_OUTCOME : BigInt(indexed.outcome ?? "0"),
    txHash: indexed.resolveTx as Hex,
    scores: new Map(indexed.positions.filter((p) => p.score !== null).map((p) => [p.participant.toLowerCase(), p.score as number])),
    edges: indexed.edges.map((e) => ({ tokenId: BigInt(e.tokenId), debtor: e.debtor.toLowerCase(), creditor: e.creditor.toLowerCase(), qty: BigInt(e.qty), obligationId: e.id as Hex, unique: e.unique })),
  }, how ?? { by: indexed.rulingHash ? "arbitration" : "quorum" });
  return true;
}

/**
 * The inks of the questions still open in each of these sets of people, for balance on the who's-in step
 * (docs/design.md 1.8, rule 4; 3.29): the client previews with the same rule the server stores by.
 */
export async function openInksByGroup(groupIds: string[]): Promise<Map<string, InkName[]>> {
  const out = new Map<string, InkName[]>(groupIds.map((g) => [g, []]));
  if (groupIds.length === 0) return out;
  const rows = await db.select({ id: schema.dares.id, groupId: schema.dares.groupId, ink: schema.dares.ink }).from(schema.dares).where(and(inArray(schema.dares.groupId, groupIds), isNotNull(schema.dares.creatorSignature), isNull(schema.dares.resolvedAt)));
  for (const r of rows) out.get(r.groupId)?.push(inkOf(r));
  return out;
}

/**
 * The people this person has shared a market with, most recent first (docs/design.md 3.29, "Add a person"): the
 * order the answers editor offers them in. Only ids; the caller has the names. Whoever they share a group with but
 * have never been in a question with comes after, and the editor still offers them (3.29: anyone the asker knows).
 */
export async function recentCompanions(userId: string): Promise<string[]> {
  const mine = db.select({ dareId: schema.darePositions.dareId }).from(schema.darePositions).where(eq(schema.darePositions.userId, userId));
  const rows = await db
    .select({ userId: schema.darePositions.userId, last: sql<string>`max(${schema.darePositions.enteredAt})` })
    .from(schema.darePositions)
    .where(and(inArray(schema.darePositions.dareId, mine), isNotNull(schema.darePositions.userId), sql`${schema.darePositions.userId} <> ${userId}`))
    .groupBy(schema.darePositions.userId)
    .orderBy(sql`max(${schema.darePositions.enteredAt}) desc`);
  return rows.map((r) => r.userId as string);
}

/** The creator's ink pick (docs/design.md 1.8, rule 1): one tap from the market's own screen, never a step in creating it. */
export async function pickInk(dareId: string, userId: string, ink: InkName): Promise<void> {
  const d = await marketById(dareId);
  if (!d) throw new MarketError("That one doesn’t exist.", "not_found");
  if (d.creatorId !== userId) throw new MarketError("Only the person who asked it can colour it.", "not_yours");
  await db.update(schema.dares).set({ ink, inkSource: "pick" }).where(eq(schema.dares.id, dareId));
}
