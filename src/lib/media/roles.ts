/**
 * The rules for media on a market, pure (docs/marks-and-memories.md; docs/decisions.md, the media phase).
 *
 * Two roles, told apart by the control a photo came through and stored on the row. A memory is a photo of the
 * night, added by anyone who is in the market: while it is open, with the camera (docs/design.md 3.39), and from
 * the moment it ends (settled, voided or expired: a void was still a night), weeks later included. A memory added
 * before the end is its author's alone until then: nobody else sees it, on any screen or through the door, and
 * it never reaches the proposal or the tiebreaker, because nothing has happened yet that it could prove. Evidence
 * is what someone attached while saying what happened, or with a case for the tiebreaker: everyone voting sees
 * it, the proposal and the arbitrator read it as its supplier's claim, and once the market ends the claim's
 * attachments lead the frame as the resolving clip, credited to whoever attached them (3.8, 4.3). Other people's
 * evidence stays on the record behind More.
 */
import type { MarketState } from "@/lib/ledger/markets";

export type MediaRole = "memory" | "evidence";

/** A market holds this many memories at most: a guard on the bucket, never a count anyone sees. */
export const MEMORIES_PER_MARKET = 48;
/** Screenshots one person may attach to what happened on one question. */
export const EVIDENCE_PER_PERSON = 3;

export type Refusal = "not_asked" | "not_in" | "full" | "not_voting" | "not_member" | "not_yours" | "evidence_stays";

/** A market that has ended, whatever the ending: settled, voided or expired (3.8). */
export const ENDED: ReadonlySet<MarketState> = new Set<MarketState>(["resolved", "voided", "expired"]);

/**
 * Whether this person may add a memory to this market now: someone who is in it, from the moment it is asked
 * (3.39: the camera while it is open; a photo started before lock lands as a memory even if it finishes after)
 * and for as long as it exists, while there is room. A draft has nobody in it yet.
 */
export function memoryAllowed(input: { state: MarketState; inIt: boolean; count: number }): { ok: true } | { ok: false; why: Refusal } {
  if (input.state === "draft") return { ok: false, why: "not_asked" };
  if (!input.inIt) return { ok: false, why: "not_in" };
  if (input.count >= MEMORIES_PER_MARKET) return { ok: false, why: "full" };
  return { ok: true };
}

/**
 * Whether a memory is anyone's to see but its author's (3.39): before the market ends, only the person who took
 * it; from the moment it ends, everyone the market's rule lets see it. Evidence is not decided here: everyone
 * voting sees it from the moment it lands.
 */
export function memoryVisible(input: { state: MarketState; authorId: string; viewerId: string }): boolean {
  return ENDED.has(input.state) || input.authorId === input.viewerId;
}

/** Whether this person may remove this photo (3.8): a memory, by whoever added it, at any time; evidence stays, since a vote or a ruling may rest on it. */
export function removeAllowed(input: { role: MediaRole; authorId: string; byUserId: string }): { ok: true } | { ok: false; why: Refusal } {
  if (input.role !== "memory") return { ok: false, why: "evidence_stays" };
  if (input.authorId !== input.byUserId) return { ok: false, why: "not_yours" };
  return { ok: true };
}

/** Whether this person may attach a screenshot to what happened now: the same people who may say what happened, while it is being called. */
export function evidenceAllowed(input: { state: MarketState; member: boolean; mine: number }): { ok: true } | { ok: false; why: Refusal } {
  if (input.state !== "locked") return { ok: false, why: "not_voting" };
  if (!input.member) return { ok: false, why: "not_member" };
  if (input.mine >= EVIDENCE_PER_PERSON) return { ok: false, why: "full" };
  return { ok: true };
}

const byAge = <T extends { createdAt: Date }>(a: T, b: T) => a.createdAt.getTime() - b.createdAt.getTime();

/**
 * What the frame shows, in order (3.8): what the claim carried first, the claimant's attachments oldest first, then
 * the memories in the order they were added, so photos taken while it was open come first among them. With no
 * claimant (a void, an expiry, a market nobody called) the frame is the memories alone; evidence attached by
 * anyone else is on the record, never in the frame. Before the market ends (`ended` false) the memories are not
 * in it: a memory taken while it was open waits for the end, seen by its author alone (3.39), while the claim's
 * clip is everyone's from the moment it lands.
 */
export function frameItems<T extends { role: string; createdAt: Date; authorId?: string }>(rows: readonly T[], claimantId: string | null = null, ended = true): T[] {
  const clip = claimantId ? rows.filter((r) => r.role === "evidence" && r.authorId === claimantId).sort(byAge) : [];
  const memories = ended ? rows.filter((r) => r.role === "memory").sort(byAge) : [];
  return [...clip, ...memories];
}

/** "Yours from tonight" (3.39): this person's own memories on a market that has not ended, oldest first. Empty once it has, when they are in the frame. */
export function yoursItems<T extends { role: string; createdAt: Date; authorId?: string }>(rows: readonly T[], viewerId: string, ended: boolean): T[] {
  if (ended) return [];
  return rows.filter((r) => r.role === "memory" && r.authorId === viewerId).sort(byAge);
}

/** What the proposal and the arbitrator read, and what the raised sheet lists while voting: every attachment, oldest first. */
export function evidenceItems<T extends { role: string; createdAt: Date }>(rows: readonly T[]): T[] {
  return rows.filter((r) => r.role === "evidence").sort(byAge);
}

/** What stays on the record behind More once it has ended: evidence that was not the claimant's. */
export function recordItems<T extends { role: string; createdAt: Date; authorId?: string }>(rows: readonly T[], claimantId: string | null): T[] {
  return rows.filter((r) => r.role === "evidence" && r.authorId !== claimantId).sort(byAge);
}

/** The photos in the strip under the frame (docs/design.md 3.8, 4.3): the rest, up to four, then "+N" for what is past them. */
export function strip<T>(rest: readonly T[], shown = 4): { squares: T[]; more: number } {
  if (rest.length <= shown) return { squares: [...rest], more: 0 };
  return { squares: rest.slice(0, shown), more: rest.length - shown };
}
