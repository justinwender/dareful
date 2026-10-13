/**
 * Pre-submission bug fixes 3's mutants (2026-10-12): one break per rule the batch added, each naming the test that must
 * fail while it is in place. Kept beside mutants.ts, which takes them into the list. None widens what the code does to
 * rows a test did not make: the backstop's break acts only on the questions a test names, which the queues' and the
 * answers' tests settle here, off the chain.
 */
import type { Mutant } from "./mutants";

const D_SPORTS = "tests/db/sports.test.ts";

const T_QUEUES = "the tick's two feed queues give places up: with one place, a question waiting on its second source does not hold it against one that can settle, and a listing that fails leaves its games to wait their turn";
const T_ANSWERS = "the backstop reads each question's own answer: a second scoreboard with the loser's score wrong still settles who wins, and voids the margin";

export const bugFixes3: Mutant[] = [
  // section 0: production's tick, on the real clock, never reaches a test's question before the test does
  {
    id: "backstop-due-on-the-real-clock",
    file: "src/lib/sports/index.ts",
    find: "  const dueBy = new Date(now.getTime() - AGREE_AFTER_MS);",
    replace: "  const dueBy = new Date(now.getTime() + AGREE_AFTER_MS);",
    also: [{ file: "src/lib/sports/results.ts", find: '    return since >= AGREE_AFTER_MS ? { act: "settle", final: input.final, alone: false } : { act: "wait" };', replace: '    return { act: "settle", final: input.final, alone: false };' }],
    suite: D_SPORTS,
    kills: [T_QUEUES, T_ANSWERS],
    why: "a final is settled the moment it is seen, so production's tick, on the real clock, takes a test's question before the test does, as it took the margin question on October 12",
  },
];
