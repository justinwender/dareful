"use client";

import { useSyncExternalStore } from "react";
import { offlineConfirmed, subscribeOffline } from "@/lib/ui/connection";

/**
 * Offline (docs/design.md 3.14; Round C part 2): a 28px `--surface-2` bar under the header, "Offline. You can
 * still look around." It follows the browser's word for the connection once a request has borne it out (the
 * first-contact round: iOS 27 says offline with the network up) and says nothing else; nothing here queues or
 * retries, and the bar leaves the moment the connection is back.
 */
export function OfflineBarView({ offline }: { offline: boolean }) {
  if (!offline) return null;
  return (
    <div role="status" data-offline="" className="-mx-5 flex h-7 shrink-0 items-center bg-surface-2 px-5 text-caption text-ink-2">
      Offline. You can still look around.
    </div>
  );
}

const onServer = () => false;

/** Offline as settled by a request (`src/lib/ui/connection.ts`), never by the browser's word alone. */
function useOffline(): boolean {
  return useSyncExternalStore(subscribeOffline, offlineConfirmed, onServer);
}

export function OfflineBar() {
  return <OfflineBarView offline={useOffline()} />;
}
