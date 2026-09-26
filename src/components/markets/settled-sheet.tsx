"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { InviteShare } from "@/components/ledger/invite-share";
import { ProblemSummary } from "@/components/ledger/problem";
import { Button } from "@/components/ui/button";
import { PinnedSheet } from "@/components/ui/pinned-sheet";
import { usePhotoAdding } from "./photo-adding";

const never = () => () => {};

export type SettledSheetProps = {
  dareId: string;
  /** Whether the viewer was in it: their move is adding a photo, every visit, weeks later included. */
  inIt: boolean;
  /** How it ended. A void or an expiry has no result tile, so there is nothing to send. */
  ending: "settled" | "void" | "expired";
  /** Whether the frame already has anything: "Add yours" once it does, "Add a photo" while it doesn't. */
  hasPhotos: boolean;
  /** The result tile and its share, on a settled market. */
  tile: { tileUrl: string; caption: string; url: string; text: string } | null;
};

/**
 * The sheet on a market that has ended (docs/design.md 3.24, 3.37). For someone who was in it: the chalk "Add
 * yours from Friday" ("Add a photo from Friday" while there are none), which opens the shared picker, and on a
 * settled market the secondary "Send how it ended" with the whole result tile at the second height. Sending is
 * the secondary because it is worth doing more than once: once photos are added, the tile says so. A void or an
 * expiry has the chalk alone, since no tile tells a void. For someone who wasn't in: "Send how it ended" alone on
 * a settled market, which goes once they have sent it or left the screen (remembered on the device, never as a
 * record), and no sheet at all on a void or an expiry: the story is the whole screen.
 */
export function SettledSheet({ dareId, inIt, ending, hasPhotos, tile }: SettledSheetProps) {
  const { pick, pending, night, problem, retry } = usePhotoAdding();
  const key = `dareful_result:${dareId}`;
  // Whether this browser has seen it (someone who wasn't in): read on the client. The server renders it, since a
  // screen served without its sheet is missing its one move; the client hides it once the device says it was seen.
  const fresh = useSyncExternalStore(
    never,
    () => {
      try {
        return sessionStorage.getItem(key) === null;
      } catch {
        return true;
      }
    },
    () => true,
  );
  const [sent, setSent] = useState(false);
  useEffect(() => {
    if (inIt) return;
    // Leaving the screen is what marks it seen for someone who wasn't in. Development mounts every effect twice in
    // the same tick; that synthetic unmount is not the person leaving, so a stay shorter than a second is not counted.
    const since = Date.now();
    return () => {
      if (Date.now() - since < 1000) return;
      try {
        sessionStorage.setItem(key, "seen");
      } catch {
        // Storage blocked: the sheet simply comes back next time.
      }
    };
  }, [key, inIt]);
  const done = () => {
    try {
      sessionStorage.setItem(key, "sent");
    } catch {
      // Storage blocked: see above.
    }
    setSent(true);
  };
  const tilePreview = tile ? (
    <div className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- a generated tile, served by this app, never optimised twice */}
      <img src={tile.tileUrl} alt="" width={120} height={63} className="shrink-0 rounded-stamp-28 border border-line" />
      <p className="text-body-sm text-ink-2">{tile.caption}</p>
    </div>
  ) : null;
  const wholeTile = tile ? (
    // eslint-disable-next-line @next/next/no-img-element -- the same tile at full width
    <img src={tile.tileUrl} alt="How it ended, as the chat will get it" className="w-full rounded-card border border-line" />
  ) : undefined;

  if (!inIt) {
    if (ending !== "settled" || !tile || !fresh || sent) return null;
    return (
      <PinnedSheet
        label="How it ended"
        low={
          <>
            {tilePreview}
            <InviteShare url={tile.url} text={tile.text} primary label="Send how it ended" onShared={done} />
          </>
        }
        high={wholeTile}
      />
    );
  }
  const add = (
    <Button variant="primary" onClick={pick} loading={pending > 0} data-add-photos="">
      {hasPhotos ? `Add yours from ${night}` : `Add a photo from ${night}`}
    </Button>
  );
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
          {add}
          {ending === "settled" && tile ? <InviteShare url={tile.url} text={tile.text} label="Send how it ended" /> : null}
        </>
      }
      high={ending === "settled" && tile ? wholeTile : undefined}
    />
  );
}
