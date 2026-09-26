/**
 * The rules for media on a market, pure (docs/marks-and-memories.md; docs/decisions.md, the media phase).
 *
 * Two roles, told apart by the control a photo came through and stored on the row. A memory is a photo of the
 * night, added to a settled market by anyone who was in it, weeks later included, and shown in the frame with
 * its credit and counter. Evidence is a screenshot attached to "what happened" while the question is being
 * called: it informs the proposal and the arbitrator, it is shown beside the claim, and it never appears in the
 * frame, because a scoreboard proves something and is not a memory of the night.
 */
import type { MarketState } from "@/lib/ledger/markets";

export type MediaRole = "memory" | "evidence";

/** A market holds this many memories at most: a guard on the bucket, never a count anyone sees. */
export const MEMORIES_PER_MARKET = 48;
/** Screenshots one person may attach to what happened on one question. */
export const EVIDENCE_PER_PERSON = 3;

export type Refusal = "not_settled" | "not_in" | "full" | "not_voting" | "not_member";

/** Whether this person may add a memory to this market now. */
export function memoryAllowed(input: { state: MarketState; inIt: boolean; count: number }): { ok: true } | { ok: false; why: Refusal } {
  if (input.state !== "resolved") return { ok: false, why: "not_settled" };
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

/** What the frame shows: memories only, oldest first, so the first photo added stays the frame and the counter reads in order. */
export function frameItems<T extends { role: string; createdAt: Date }>(rows: readonly T[]): T[] {
  return rows.filter((r) => r.role === "memory").sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/** What the proposal and the arbitrator read, and what sits beside the claim: evidence only, oldest first. */
export function evidenceItems<T extends { role: string; createdAt: Date }>(rows: readonly T[]): T[] {
  return rows.filter((r) => r.role === "evidence").sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/** The photos in the strip under the frame (docs/design.md 3.8, 4.3): the rest, up to four, then "+N" for what is past them. */
export function strip<T>(rest: readonly T[], shown = 4): { squares: T[]; more: number } {
  if (rest.length <= shown) return { squares: [...rest], more: 0 };
  return { squares: rest.slice(0, shown), more: rest.length - shown };
}
