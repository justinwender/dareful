/**
 * The rules for media on a market, pure (docs/marks-and-memories.md; docs/decisions.md, the media phase).
 *
 * Two roles, told apart by the control a photo came through and stored on the row. A memory is a photo of the
 * night, added to a market once it has ended (settled, voided or expired: a void was still a night) by anyone who
 * was in it, weeks later included. Evidence is what someone attached while saying what happened, or with a case
 * for the tiebreaker: everyone voting sees it, the proposal and the arbitrator read it as its supplier's claim,
 * and once the market ends the claim's attachments lead the frame as the resolving clip, credited to whoever
 * attached them (docs/design.md 3.8, 4.3). Other people's evidence stays on the record behind More.
 */
import type { MarketState } from "@/lib/ledger/markets";

export type MediaRole = "memory" | "evidence";

/** A market holds this many memories at most: a guard on the bucket, never a count anyone sees. */
export const MEMORIES_PER_MARKET = 48;
/** Screenshots one person may attach to what happened on one question. */
export const EVIDENCE_PER_PERSON = 3;

export type Refusal = "not_ended" | "not_in" | "full" | "not_voting" | "not_member";

/** A market that has ended, whatever the ending: settled, voided or expired (3.8). */
export const ENDED: ReadonlySet<MarketState> = new Set<MarketState>(["resolved", "voided", "expired"]);

/** Whether this person may add a memory to this market now. */
export function memoryAllowed(input: { state: MarketState; inIt: boolean; count: number }): { ok: true } | { ok: false; why: Refusal } {
  if (!ENDED.has(input.state)) return { ok: false, why: "not_ended" };
  if (!input.inIt) return { ok: false, why: "not_in" };
  if (input.count >= MEMORIES_PER_MARKET) return { ok: false, why: "full" };
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
 * the memories in the order they were added. With no claimant (a void, an expiry, a market nobody called) the
 * frame is the memories alone; evidence attached by anyone else is on the record, never in the frame.
 */
export function frameItems<T extends { role: string; createdAt: Date; authorId?: string }>(rows: readonly T[], claimantId: string | null = null): T[] {
  const clip = claimantId ? rows.filter((r) => r.role === "evidence" && r.authorId === claimantId).sort(byAge) : [];
  return [...clip, ...rows.filter((r) => r.role === "memory").sort(byAge)];
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
