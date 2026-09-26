/**
 * Pick one, as rules (docs/design.md 3.25, 3.29, 3.30, 3.31, 4.6, 4.9): picking one means choosing one answer
 * and nothing else. There is no confidence and no odds line; mechanically the pick carries full confidence, so
 * the answer that happened scores full, any other scores nothing, and the people who picked wrong pay the people
 * who picked right, pairwise and capped as usual (`scoreCategorical`, scoring.ts). Everything here is pure, so
 * the shares, the sentences and the limits have tests.
 */
import { lowerFirst } from "@/lib/ui/outcome-words";
import { countWord } from "./weight";

/** Two to six answers (3.29): six is what the entry sheet can hold with the question still in view. */
export const MIN_ANSWERS = 2;
export const MAX_ANSWERS = 6;
export const MAX_ANSWER_LENGTH = 40;
/** The one confidence a pick carries: everything on the pick, nothing anywhere else (3.30). */
export const PICK_ONE_CONFIDENCE = 10_000;

export type Answer = { index: number; text: string; userId: string | null };

/**
 * An answer's share of everything riding (3.31): the stake on it over all stake, rounded by largest remainder so
 * the printed shares sum to 100. Nothing riding anywhere reads as all zeros. Integers throughout.
 */
export function answerShares(stakes: readonly bigint[]): number[] {
  const total = stakes.reduce((a, s) => a + (s > 0n ? s : 0n), 0n);
  if (total === 0n) return stakes.map(() => 0);
  const exact = stakes.map((s) => ((s > 0n ? s : 0n) * 10_000n) / total); // hundredths of a percent, floored
  const floors = exact.map((e) => Number(e / 100n));
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, rest: e % 100n }))
    .sort((a, b) => (b.rest > a.rest ? 1 : b.rest < a.rest ? -1 : a.i - b.i));
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] = (floors[i] ?? 0) + 1;
    left -= 1;
  }
  return floors;
}

/**
 * Who called it (3.25): "Theo called it. Nobody else did.", "Theo and Maya called it.", "Four of you called it:
 * Theo, Maya, Gabe and John.", "Nobody called it." The viewer is "you", first in a pair and last in a list.
 */
export function calledItLine(callers: readonly string[], viewerIn: boolean): string {
  const others = callers.filter((c) => c !== "You" && c !== "you");
  if (callers.length === 0) return "Nobody called it.";
  if (callers.length === 1) return `${viewerIn ? "You" : others[0]} called it. Nobody else did.`;
  if (callers.length === 2) return viewerIn ? `You and ${others[0]} called it.` : `${others[0]} and ${others[1]} called it.`;
  const list = viewerIn ? [...others, "you"] : others;
  const word = countWord(callers.length);
  return `${word.charAt(0).toUpperCase()}${word.slice(1)} of you called it: ${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}.`;
}

/** The outcome line (3.25): the answer, then the claimant's few words when they run to sixty characters or fewer ("Priya, 40 minutes in."), else the answer alone ("Priya."). */
export function answerLine(answer: string, claimantSaid: string | null): string {
  const said = claimantSaid?.trim() ?? "";
  if (said.length === 0 || said.length > 60) return `${answer}.`;
  return `${answer}, ${said.charAt(0).toLowerCase()}${said.slice(1).replace(/[.!]+$/, "")}.`;
}

/**
 * The caption under the bars (4.9): only when one stake is more than half of everything riding, because the
 * picture alone then reads as agreement. Otherwise nothing: the bars restate nothing and neither does a line.
 */
export function pickOneCaption(input: { entries: ReadonlyArray<{ id: string; stake: bigint; pick: number }>; answers: readonly string[]; viewerId: string; nameOf: (id: string) => string; stakeWords: (stake: bigint) => string }): string | null {
  const { entries } = input;
  if (entries.length < 2) return null;
  const total = entries.reduce((a, e) => a + (e.stake > 0n ? e.stake : 0n), 0n);
  if (total === 0n) return null;
  const heavy = entries.find((e) => e.stake * 2n > total);
  if (!heavy) return null;
  const who = heavy.id === input.viewerId ? "You have" : `${input.nameOf(heavy.id)} has`;
  return `${who} ${input.stakeWords(heavy.stake)} on ${input.answers[heavy.pick] ?? "one answer"}, more than half of what’s riding.`;
}

/**
 * An answer in the middle of a sentence ("Priya says a field goal", "Priya says John"): a person keeps their name,
 * and words lose their capital only when they open with a pronoun or a function word (`lowerFirst`), so an answer
 * typed as a name ("John", as words) keeps it. Found in the real session: "Say it: john".
 */
export function saidAnswer(a: Pick<Answer, "text" | "userId">): string {
  if (a.userId) return a.text;
  return lowerFirst(a.text);
}
