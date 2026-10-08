/**
 * Entering without an account (PLANNING.md section 4; docs/design.md 3.17): someone taps the link, puts a
 * number on it, says who they are, and is in. No account, no wallet, no signature. The position belongs to a
 * ghost (`participant_claims`), acknowledged at once because a question's set is whoever joins (docs/decisions.md
 * 2026-09-19), and a browser token in the cookie is what makes the same browser the same ghost next time: the
 * number is theirs to change until lock, and the ghost binds to whoever signs in here, or with that phone
 * number, through the paths every ghost already has. A market with a ghost in it locks provisionally.
 *
 * Limits, enforced here and said plainly: one position per browser per market, and ten ghosts per market.
 */
import { and, count, eq, gt, ilike, isNotNull, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { isIdentifier } from "@/lib/auth/login";
import { claimsForBrowserTokens } from "./claims";
import { denominationById } from "./denominations";
import { groupsNumberBps } from "./weight";
import { confidenceFor, gameOverFor, marketById, MarketError, MAX_POSITIONS, pastItsClose, positionsOf, startFirstCallClock, stateOf, valueAllowed, type PositionRow } from "./markets";
import { pidOf } from "./participants";
import { hashToken, newToken } from "./tokens";
import { record } from "@/lib/usage";
import { guestNameOf } from "@/lib/ui/entry-words";

export const MAX_GHOSTS_PER_MARKET = 10;

export type GhostWho = {
  /** What they typed, kept on a new ghost only. */
  name: string;
  /** Their own number, hashed at the edge; stored on the ghost so a phone login binds it. Never the number. */
  phoneHash: Buffer | null;
  /** One of the group's ghosts they said was them, picked from the suggestions under the name (3.17, frames 4 and 5). It joins only with the number it joined with before. */
  memberClaimId: string | null;
};

/** Wrong numbers one picked name takes in an hour before the check refuses to answer (3.17: the check confirms or denies a number, so tries are counted). */
export const NUMBER_TRIES_PER_HOUR = 5;
/** How many letters someone types before any name is suggested (3.17, frame 4): nobody's name is shown to someone who hasn't started typing their own. */
export const SUGGEST_AFTER = 2;
export const SUGGEST_AT_MOST = 3;

/**
 * A picked name joins only with the number it joined with before (3.17, frame 5). A different number, or none,
 * is the field error; too many wrong ones for one name in an hour and the check stops answering, so a name
 * cannot be taken by trying numbers. Nothing about any number is kept: one row per wrong try, by the name.
 */
async function checkPickedNumber(claimId: string, phoneHash: Buffer | null): Promise<void> {
  const [claim] = await db.select({ phoneHash: schema.participantClaims.phoneHash, displayName: schema.participantClaims.displayName }).from(schema.participantClaims).where(eq(schema.participantClaims.id, claimId)).limit(1);
  if (!claim) throw new MarketError("That name isn't here any more. Type your own.", "not_found");
  const first = claim.displayName.trim().split(/\s+/)[0] ?? claim.displayName;
  const since = new Date(Date.now() - 3_600_000);
  const [tries] = await db.select({ n: count() }).from(schema.claimNumberAttempts).where(and(eq(schema.claimNumberAttempts.claimId, claimId), gt(schema.claimNumberAttempts.createdAt, since)));
  if ((tries?.n ?? 0) >= NUMBER_TRIES_PER_HOUR) throw new MarketError(`Too many tries for ${first}. Give it an hour, or type your own name.`, "slow_down");
  if (!claim.phoneHash || !phoneHash || !claim.phoneHash.equals(phoneHash)) {
    await db.insert(schema.claimNumberAttempts).values({ claimId });
    throw new MarketError(`That isn't the number ${first} joined with. If you're not ${first}, type your own name.`, "wrong_number");
  }
}

async function isUnclaimedMember(groupId: string, claimId: string): Promise<boolean> {
  const [row] = await db
    .select({ claimId: schema.groupMembers.claimId })
    .from(schema.groupMembers)
    .innerJoin(schema.participantClaims, eq(schema.participantClaims.id, schema.groupMembers.claimId))
    .where(and(eq(schema.groupMembers.groupId, groupId), eq(schema.groupMembers.claimId, claimId), isNull(schema.groupMembers.leftAt), isNull(schema.participantClaims.claimedBy), isNull(schema.participantClaims.mergedInto)))
    .limit(1);
  return Boolean(row);
}

/** The ghost this entry is for: the browser's own, the member they said they were, the creator's ghost with this number, or a new one. */
async function claimFor(d: { id: string; groupId: string; creatorId: string }, who: GhostWho, tokens: string[], existing: PositionRow[]): Promise<{ claimId: string; viaToken: boolean }> {
  const held = await claimsForBrowserTokens(tokens);
  const inMarket = held.find((c) => existing.some((p) => p.claimId === c.id));
  if (inMarket) return { claimId: inMarket.id, viaToken: true };
  for (const c of held) if (await isUnclaimedMember(d.groupId, c.id)) return { claimId: c.id, viaToken: true };
  if (held[0]) return { claimId: held[0].id, viaToken: true };
  if (who.memberClaimId) {
    if (!(await isUnclaimedMember(d.groupId, who.memberClaimId))) throw new MarketError("That name isn't here any more. Type your own.", "not_found");
    await checkPickedNumber(who.memberClaimId, who.phoneHash);
    return { claimId: who.memberClaimId, viaToken: false };
  }
  const name = guestNameOf(who.name);
  if (!name) throw new MarketError("Say what your friends call you.", "bad_input");
  // An address, a tag, a number or a handle is not a name here either (the same rule as the sign-up step), and it would be printed on every card the ghost is on.
  if (isIdentifier(name)) throw new MarketError("Say what your friends call you.", "bad_input");
  if (who.phoneHash) {
    const [mine] = await db
      .select({ id: schema.participantClaims.id })
      .from(schema.participantClaims)
      .where(and(eq(schema.participantClaims.createdBy, d.creatorId), eq(schema.participantClaims.phoneHash, who.phoneHash), isNull(schema.participantClaims.claimedBy), isNull(schema.participantClaims.mergedInto)))
      .limit(1);
    if (mine) return { claimId: mine.id, viaToken: false };
  }
  const [made] = await db.insert(schema.participantClaims).values({ displayName: name, phoneHash: who.phoneHash, createdBy: d.creatorId }).returning({ id: schema.participantClaims.id });
  if (!made) throw new MarketError("Couldn't save that.", "chain");
  return { claimId: made.id, viaToken: false };
}

export async function enterAsGhost(input: { dareId: string; who: GhostWho; tokens: string[]; stake: bigint; value: bigint }): Promise<{ claimId: string; browserToken: string | null; position: PositionRow }> {
  const d = await marketById(input.dareId);
  if (!d) throw new MarketError("That one doesn't exist.", "not_found");
  const state = stateOf(d);
  if (state !== "open") throw new MarketError(state === "draft" ? "It isn't open yet." : "Numbers are locked.", "wrong_state");
  // The close is a hard cutoff for a ghost as for anyone (`pastItsClose`): past its time, nobody gets in or changes, locked yet or not.
  if (pastItsClose(d, new Date())) throw new MarketError("Numbers are locked.", "wrong_state");
  // A question started during a game closes at its final at the latest (the games-and-the-reveal round, section 5).
  if (d.closesAfterFirst && (await gameOverFor(d))) throw new MarketError("Numbers are locked.", "wrong_state");
  if (!valueAllowed(d.kind, input.value, d.outcomeLabels.length)) throw new MarketError(d.kind === "numeric" ? "Any whole number, up to nine digits." : d.kind === "categorical" ? "Pick one of the answers." : "A number from 0 to 100.", "bad_input");
  const denom = await denominationById(d.denomId);
  if (!denom) throw new MarketError("unknown unit", "not_found");
  if (!denom.quantifiable && input.stake !== 1n) throw new MarketError("With this unit everyone puts up exactly one.", "bad_input");
  if (input.stake <= 0n) throw new MarketError("Put something on it.", "bad_input");

  const existing = await positionsOf(d.id);
  const { claimId, viaToken } = await claimFor(d, input.who, input.tokens, existing);
  const mine = existing.find((p) => p.claimId === claimId) ?? null;
  // Final once made on a blind market (3.22, 3.31), for a ghost as for anyone. An entry the asker removed may come in again.
  if (mine && d.revealMode === "blind" && (mine.stake !== input.stake || mine.value !== input.value)) throw new MarketError("Yours is final on this one.", "wrong_state");
  if (!mine) {
    if (d.pace === "argument" && existing.length >= 2) throw new MarketError("This one's between the two of them. You can watch how it comes out.", "wrong_state");
    if (existing.length >= MAX_POSITIONS) throw new MarketError(`This one is full at ${MAX_POSITIONS}.`, "wrong_state");
    if (existing.filter((p) => p.claimId !== null).length >= MAX_GHOSTS_PER_MARKET) throw new MarketError("This one has all the guests it can take. Sign in to get in.", "wrong_state");
  }

  // A ghost in a named set is a member of it, as an account-holder joining by the link would be; a pair's dyad takes nobody new.
  const [group] = await db.select({ isDyad: schema.groups.isDyad }).from(schema.groups).where(eq(schema.groups.id, d.groupId)).limit(1);
  if (group && !group.isDyad) {
    await db
      .insert(schema.groupMembers)
      .values({ groupId: d.groupId, claimId })
      .onConflictDoUpdate({ target: [schema.groupMembers.groupId, schema.groupMembers.claimId], set: { leftAt: null } });
  }

  const now = new Date();
  const [position] = await db
    .insert(schema.darePositions)
    .values({ dareId: d.id, claimId, stake: input.stake, value: input.value, confidenceBps: d.kind === "categorical" ? confidenceFor(d) : null, enterSignature: null, enteredBy: d.creatorId, acknowledgedAt: now, changedAt: now })
    // A ghost the asker removed may enter again: the row comes back with the new number, and the asker may remove it again.
    .onConflictDoUpdate({ target: [schema.darePositions.dareId, schema.darePositions.claimId], set: { stake: input.stake, value: input.value, confidenceBps: d.kind === "categorical" ? confidenceFor(d) : null, dismissedAt: null, acknowledgedAt: now, changedAt: now } })
    .returning();
  if (!position) throw new MarketError("Couldn't save that.", "chain");
  // The first call on a question started during a game sets its close, five minutes on (section 5).
  await startFirstCallClock(d, now);

  if (d.kind === "binary") {
    try {
      const all = await positionsOf(d.id);
      const number = groupsNumberBps(all.map((p) => ({ id: pidOf(p), stake: p.stake, valueBps: p.value })));
      if (number !== null) await db.insert(schema.dareNumberSeries).values({ dareId: d.id, valueBps: Number(number), entries: all.length });
    } catch (err) {
      console.error("recording the group's number failed", { dareId: d.id, err });
    }
  }

  // The browser's token for this ghost, issued once the person has said so by entering (docs/decisions.md 2026-09-18).
  let browserToken: string | null = null;
  if (!viaToken) {
    browserToken = newToken();
    const tokenHash = hashToken(browserToken);
    if (tokenHash) await db.insert(schema.claimTokens).values({ tokenHash, claimId });
    else browserToken = null;
  }
  if (!mine) await record("entered", { as: "guest" }, { claimId }, { dareId: d.id });
  return { claimId, browserToken, position };
}

/** The ghost this browser is, on this market: the position held by one of the cookie's claims, with the ghost's name. */
export async function ghostPositionFor(dareId: string, tokens: string[]): Promise<{ claimId: string; displayName: string; position: PositionRow } | null> {
  if (tokens.length === 0) return null;
  const held = await claimsForBrowserTokens(tokens);
  if (held.length === 0) return null;
  const positions = await positionsOf(dareId);
  for (const c of held) {
    const p = positions.find((x) => x.claimId === c.id);
    if (p) return { claimId: c.id, displayName: c.displayName, position: p };
  }
  return null;
}

/**
 * "Is one of these you?" (3.17, frame 4): names for the letters typed so far, at most three, and only people without
 * an account who joined this group's markets from a link with a number, since a picked name joins only with its
 * number (frame 5) and a name that joined without one could never be proved. Nothing before `SUGGEST_AFTER` letters.
 */
export async function suggestGhostNames(groupId: string, typed: string): Promise<Array<{ claimId: string; displayName: string }>> {
  const prefix = typed.trim();
  if (prefix.length < SUGGEST_AFTER) return [];
  const pattern = `${prefix.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const rows = await db
    .selectDistinct({ claimId: schema.participantClaims.id, displayName: schema.participantClaims.displayName })
    .from(schema.participantClaims)
    .innerJoin(schema.darePositions, eq(schema.darePositions.claimId, schema.participantClaims.id))
    .innerJoin(schema.dares, eq(schema.dares.id, schema.darePositions.dareId))
    .where(and(eq(schema.dares.groupId, groupId), isNotNull(schema.participantClaims.phoneHash), isNull(schema.participantClaims.claimedBy), isNull(schema.participantClaims.mergedInto), isNull(schema.darePositions.dismissedAt), ilike(schema.participantClaims.displayName, pattern)))
    .limit(SUGGEST_AT_MOST);
  return rows.map((r) => ({ claimId: r.claimId, displayName: r.displayName }));
}

/**
 * The asker removes an entry from someone without an account, before the lock (docs/decisions.md 2026-09-27, the
 * check-in's ruling): the position is dismissed and no longer counts; the ghost keeps its seat and its token, and
 * may enter again. Only the asker, only a ghost's entry, only while the question is open.
 */
export async function removeGhostEntry(input: { dareId: string; claimId: string; byUserId: string }): Promise<void> {
  const d = await marketById(input.dareId);
  if (!d) throw new MarketError("That one doesn't exist.", "not_found");
  if (d.creatorId !== input.byUserId) throw new MarketError("Only the person who asked it can remove someone.", "not_yours");
  if (stateOf(d) !== "open") throw new MarketError("Numbers are locked.", "wrong_state");
  const [row] = await db
    .update(schema.darePositions)
    .set({ dismissedAt: new Date() })
    .where(and(eq(schema.darePositions.dareId, d.id), eq(schema.darePositions.claimId, input.claimId), isNull(schema.darePositions.dismissedAt)))
    .returning({ claimId: schema.darePositions.claimId });
  if (!row) throw new MarketError("They're not in it.", "not_found");
}
