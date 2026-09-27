"use client";

import { ProblemSummary } from "@/components/ledger/problem";
import { usePhotoAdding } from "@/components/markets/photo-adding";
import { Button } from "@/components/ui/button";
import { PinnedSheet } from "@/components/ui/pinned-sheet";

/**
 * A game's night (docs/design.md 3.37): the page has a sheet with the photo move alone, "Add yours from Sunday",
 * for someone who was in any of the game's questions. A photo added here attaches to the game's first question,
 * so it shows in that question's frame and in the night's.
 */
export function NightSheet({ hasPhotos }: { hasPhotos: boolean }) {
  const { pick, pending, night, problem, retry, canAdd } = usePhotoAdding();
  if (!canAdd) return null;
  return (
    <PinnedSheet
      label={hasPhotos ? "Add yours" : "Add a photo"}
      low={
        <>
          {problem ? (
            <div className="flex items-center justify-between gap-3">
              <ProblemSummary messages={[problem]} />
              <Button variant="tertiary" onClick={retry}>
                Try again
              </Button>
            </div>
          ) : null}
          <Button variant="primary" onClick={pick} loading={pending > 0} data-add-photos="">
            {hasPhotos ? `Add yours from ${night}` : `Add a photo from ${night}`}
          </Button>
        </>
      }
    />
  );
}
