/**
 * What a final score answers, what the play-by-play answers, and when the backstop may act on either
 * (docs/decisions.md, public markets and the game page). Pure, so every ending has a test. The who-wins question
 * is the chance the home team wins; a tie would be the exact middle, which the deployed contract cannot score
 * (tests/db/scoring-chain.test.ts), so until the redeploy a tie voids with no toll. The margin is signed, home
 * minus away, and stored shifted up by half its scale, which changes no score. Nothing here reads a `winner`
 * flag: a result is a completed game's two scores.
 */
import { VOID_OUTCOME } from "@/lib/ledger/markets";
import { DRIVE_ANSWERS, type DriveAnswer, type FinalScore } from "./types";

export type ScoreOutcome = { outcome: bigint; tie: boolean; floored: boolean };

/** The chain's outcome for a template, from a final. Null for a question the score does not answer. */
export function outcomeFor(t: { key: string; shift: bigint | null; decidedByScore: boolean }, final: FinalScore): ScoreOutcome | null {
  if (!t.decidedByScore) return null;
  if (t.key === "home_wins") {
    if (final.home === final.away) return { outcome: VOID_OUTCOME, tie: true, floored: false };
    return { outcome: final.home > final.away ? 1n : 0n, tie: false, floored: false };
  }
  if (t.key === "total") return { outcome: BigInt(final.home + final.away), tie: false, floored: false };
  if (t.key === "margin") {
    const stored = toStored(BigInt(final.home - final.away), t.shift ?? 0n);
    return { outcome: stored ?? 0n, tie: final.home === final.away, floored: stored === null };
  }
  return null;
}

/** The chain's outcome for the first-drive question: the answer's index in the template's list, or null for no recognised result. */
export function driveOutcome(answers: readonly string[], result: DriveAnswer | null): bigint | null {
  if (result === null || !(DRIVE_ANSWERS as readonly string[]).includes(result)) return null;
  const i = answers.indexOf(result);
  return i < 0 ? null : BigInt(i);
}

/** A signed margin as the chain stores it: shifted up by half the scale; null when it sits below what the field takes. */
export function toStored(signed: bigint, shift: bigint): bigint | null {
  const stored = signed + shift;
  return stored < 0n ? null : stored;
}
/** A stored margin back to its sign. */
export const fromStored = (stored: bigint, shift: bigint): bigint => stored - shift;

/** "Giants by 7", "Titans by 3", "A tie": a signed margin in words, never a sign in front of a number (docs/design.md 3.40). */
export function marginWords(signed: bigint, home: string, away: string): string {
  if (signed === 0n) return "A tie";
  return signed > 0n ? `${home} by ${signed}` : `${away} by ${-signed}`;
}

export const agree = (a: FinalScore, b: FinalScore): boolean => a.home === b.home && a.away === b.away;

/**
 * Whether two finals answer one question the same way (the first-contact round, 2026-10-04): the question's outcome
 * under each, never the whole score. Two scoreboards naming the same winner agree on who wins though one has the
 * loser's score wrong (the Yankees 9, the Red Sox 2 or 0); the same two disagree on the margin and the total. A
 * question the score does not decide falls back to the whole final.
 */
export function outcomesAgree(t: { key: string; shift: bigint | null; decidedByScore: boolean }, a: FinalScore, b: FinalScore): boolean {
  const x = outcomeFor(t, a);
  const y = outcomeFor(t, b);
  if (!x || !y) return agree(a, b);
  return x.outcome === y.outcome && x.tie === y.tie && x.floored === y.floored;
}

/** The three endings' clocks: both sources agreeing settles at a day; the scoreboard alone at three days, unchanged; the warning goes six hours before the earliest. */
export const AGREE_AFTER_MS = 24 * 3_600_000;
export const ALONE_AFTER_MS = 72 * 3_600_000;
export const WARN_BEFORE_MS = 6 * 3_600_000;
/** How long past a game's expected end "Say it yourself" appears on the ballot (3.35): kept beside the rule for when the vote opens. */
export { SAY_YOURSELF_AFTER_MS } from "@/lib/ledger/voting-open";
/** How long after a final's first read it is read once more, to catch a correction, before polling stops. */
export const CONFIRM_AFTER_MS = 30 * 60_000;

/** Which of the feed's endings a market took (docs/design.md 3.35), kept on the row for the settled screen's line. */
export type FeedEnding = "agreed" | "alone" | "conflict" | "tie" | "drive" | "drive_unknown";

export type Backstop = { act: "wait" } | { act: "settle"; final: FinalScore; alone: boolean } | { act: "void"; why: "conflict" };

/**
 * Whether the backstop may act, and how (docs/decisions.md, public markets, "Every backstop path has an ending"):
 * the two sources reporting the same final settles it a day after the final was seen; the scoreboard alone, with
 * no second source (hockey always, or the check down or late), settles it three days after, provided the score has
 * not changed since; two finals that answer the question differently void it with no toll, a real conflict being
 * worse than nothing changing hands (`same`, the question's own outcome under each since 2026-10-04; the whole final
 * when not given). Before its time, it waits. `check` is null where the second source had nothing to say.
 */
export function backstopDecision(input: { finalSeenAt: Date; confirmedAt: Date | null; final: FinalScore; check: FinalScore | null; now: Date; same?: (a: FinalScore, b: FinalScore) => boolean }): Backstop {
  const since = input.now.getTime() - input.finalSeenAt.getTime();
  if (input.check) {
    if (!(input.same ?? agree)(input.final, input.check)) return since >= AGREE_AFTER_MS ? { act: "void", why: "conflict" } : { act: "wait" };
    return since >= AGREE_AFTER_MS ? { act: "settle", final: input.final, alone: false } : { act: "wait" };
  }
  if (since >= ALONE_AFTER_MS && input.confirmedAt !== null) return { act: "settle", final: input.final, alone: true };
  return { act: "wait" };
}

export type DriveBackstop = { act: "wait" } | { act: "settle"; outcome: bigint } | { act: "void"; why: "unknown" };

/**
 * The first drive's backstop (docs/decisions.md, the game page): one source only, since the second source's free
 * key has no play-by-play, so a recognised result settles three days after it was first read once a later read
 * found it unchanged; a result the adapter does not recognise, or none at all, three days after the game was
 * complete, voids with no toll rather than waiting forever. Before its time, it waits.
 */
export function driveBackstopDecision(input: { outcome: bigint | null; seenAt: Date | null; confirmedAt: Date | null; completeAt: Date | null; now: Date }): DriveBackstop {
  if (input.outcome !== null && input.seenAt && input.confirmedAt && input.now.getTime() - input.seenAt.getTime() >= ALONE_AFTER_MS) return { act: "settle", outcome: input.outcome };
  if (input.outcome === null && input.completeAt && input.now.getTime() - input.completeAt.getTime() >= ALONE_AFTER_MS) return { act: "void", why: "unknown" };
  return { act: "wait" };
}

/** When the warning goes: six hours before the earliest ending, counted from the final. */
export const warnAt = (finalSeenAt: Date): Date => new Date(finalSeenAt.getTime() + AGREE_AFTER_MS - WARN_BEFORE_MS);

/** "Giants 24, Titans 17": the final in words, the winner first, the way the ballot and the settled line say it. */
export function scoreLine(final: FinalScore, home: string, away: string): string {
  return final.home >= final.away ? `${home} ${final.home}, ${away} ${final.away}` : `${away} ${final.away}, ${home} ${final.home}`;
}
