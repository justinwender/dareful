"use client";

import { ProblemSummary, TryAgain } from "@/components/ledger/problem";
import { usePhotoAdding } from "./photo-adding";

/** The one failure a tap could put right: a photo that never went up. "This one’s full." is a refusal, and gets no Try again. */
export const PHOTO_DID_NOT_GO_UP = "That photo didn’t go up.";
export const photoRetryable = (problem: string): boolean => problem === PHOTO_DID_NOT_GO_UP;

/**
 * A photo that did not go up, said (Principle 9; docs/design.md 3.8: "one 5.1 block under the strip"). `PhotoAdding`
 * keeps the sentence and the retry, and nothing drew them: a refused or failed photo just left the strip when the
 * runner stopped. This is the block under the photos, with the failed ones sent again from "Try again".
 */
export function PhotoProblem() {
  const { problem, retry } = usePhotoAdding();
  if (!problem) return null;
  return (
    <div data-photo-problem="">
      <ProblemSummary messages={[problem]}>{photoRetryable(problem) ? <TryAgain onClick={retry} /> : null}</ProblemSummary>
    </div>
  );
}
