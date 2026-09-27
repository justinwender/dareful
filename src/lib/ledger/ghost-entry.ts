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
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { claimsForBrowserTokens } from "./claims";
import { denominationById } from "./denominations";
import { groupsNumberBps } from "./weight";
import { confidenceFor, marketById, MarketError, MAX_POSITIONS, positionsOf, stateOf, valueAllowed, type PositionRow } from "./markets";
import { pidOf } from "./participants";
import { hashToken, newToken } from "./tokens";

export const MAX_GHOSTS_PER_MARKET = 10;

export type GhostWho = {
  /** What they typed, kept on a new ghost only. */
  name: string;
  /** Their own number, hashed at the edge; stored on the ghost so a phone login binds it. Never the number. */
  phoneHash: Buffer | null;
  /** One of the group's ghosts they said was them, from the members list. */
  memberClaimId: string | null;
};

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
  if (who.memberClaimId && (await isUnclaimedMember(d.groupId, who.memberClaimId))) return { claimId: who.memberClaimId, viaToken: false };
  const name = who.name.trim().slice(0, 40);
  if (!name) throw new MarketError("Say what your friends call you.", "bad_input");
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
  if (!valueAllowed(d.kind, input.value, d.outcomeLabels.length)) throw new MarketError(d.kind === "numeric" ? "Any whole number, up to nine digits." : d.kind === "categorical" ? "Pick one of the answers." : "A number from 0 to 100.", "bad_input");
  const denom = await denominationById(d.denomId);
  if (!denom) throw new MarketError("unknown unit", "not_found");
  if (!denom.quantifiable && input.stake !== 1n) throw new MarketError("With this unit everyone puts up exactly one.", "bad_input");
  if (input.stake <= 0n) throw new MarketError("Put something on it.", "bad_input");

  const existing = await positionsOf(d.id);
  const { claimId, viaToken } = await claimFor(d, input.who, input.tokens, existing);
  const mine = existing.find((p) => p.claimId === claimId) ?? null;
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
    .values({ dareId: d.id, claimId, stake: input.stake, value: input.value, confidenceBps: d.kind === "categorical" ? confidenceFor(d) : null, enterSignature: null, enteredBy: d.creatorId, acknowledgedAt: now })
    .onConflictDoUpdate({ target: [schema.darePositions.dareId, schema.darePositions.claimId], set: { stake: input.stake, value: input.value, confidenceBps: d.kind === "categorical" ? confidenceFor(d) : null } })
    .returning();
  if (!position) throw new MarketError("Couldn't save that.", "chain");

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

/** The group's unclaimed ghosts, for "is one of these you?" on the way in. Names only. */
export async function ghostMembersOf(groupId: string): Promise<Array<{ claimId: string; displayName: string }>> {
  return (
    await db
      .select({ claimId: schema.participantClaims.id, displayName: schema.participantClaims.displayName })
      .from(schema.groupMembers)
      .innerJoin(schema.participantClaims, eq(schema.participantClaims.id, schema.groupMembers.claimId))
      .where(and(eq(schema.groupMembers.groupId, groupId), isNull(schema.groupMembers.leftAt), isNull(schema.participantClaims.claimedBy), isNull(schema.participantClaims.mergedInto)))
  ).map((r) => ({ claimId: r.claimId, displayName: r.displayName }));
}
