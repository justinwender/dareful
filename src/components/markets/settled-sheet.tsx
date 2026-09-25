"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { InviteShare } from "@/components/ledger/invite-share";
import { PinnedSheet } from "@/components/ui/pinned-sheet";

const never = () => () => {};

/**
 * The sheet on a settled market (docs/design.md 3.24, 3.27): a thumbnail of the result tile, one caption, and
 * "Send how it ended". Raised, the whole tile, as the chat will get it. Once the result has been sent, or once
 * this person leaves the settled screen, the sheet is gone and the market is a story. That memory is this
 * browser's alone (sessionStorage), because it is about what this person has seen, not about the market.
 */
export function SettledSheet({
  dareId,
  tileUrl,
  caption,
  url,
  text,
}: {
  dareId: string;
  tileUrl: string;
  caption: string;
  url: string;
  text: string;
}) {
  const key = `dareful_result:${dareId}`;
  // Whether this browser has seen it: read from the store on the client, never on the server (where there is no browser).
  const fresh = useSyncExternalStore(
    never,
    () => {
      try {
        return sessionStorage.getItem(key) === null;
      } catch {
        return true;
      }
    },
    () => false,
  );
  const [sent, setSent] = useState(false);
  useEffect(() => {
    // Leaving the screen is what marks it seen. Development mounts every effect twice in the same tick; that
    // synthetic unmount is not the person leaving, so a stay shorter than a second is not counted.
    const since = Date.now();
    return () => {
      if (Date.now() - since < 1000) return;
      try {
        sessionStorage.setItem(key, "seen");
      } catch {
        // Storage blocked: the sheet simply comes back next time.
      }
    };
  }, [key]);
  if (!fresh || sent) return null;
  const done = () => {
    try {
      sessionStorage.setItem(key, "sent");
    } catch {
      // Storage blocked: see above.
    }
    setSent(true);
  };
  return (
    <PinnedSheet
      label="How it ended"
      low={
        <>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- a generated tile, served by this app, never optimised twice */}
            <img
              src={tileUrl}
              alt=""
              width={120}
              height={63}
              className="shrink-0 rounded-stamp-28 border border-line"
            />
            <p className="text-body-sm text-ink-2">{caption}</p>
          </div>
          <InviteShare
            url={url}
            text={text}
            primary
            label="Send how it ended"
            onShared={done}
          />
        </>
      }
      high={
        // eslint-disable-next-line @next/next/no-img-element -- the same tile at full width
        <img
          src={tileUrl}
          alt="How it ended, as the chat will get it"
          className="w-full rounded-card border border-line"
        />
      }
    />
  );
}
