"use client";

import { useSyncExternalStore } from "react";

/**
 * Offline (docs/design.md 3.14; Round C part 2): a 28px `--surface-2` bar under the header, "Offline. You can
 * still look around." It follows the browser's own word for the connection and says nothing else; nothing here
 * queues or retries, and the bar leaves the moment the connection is back.
 */
export function OfflineBarView({ offline }: { offline: boolean }) {
  if (!offline) return null;
  return (
    <div role="status" data-offline="" className="-mx-5 flex h-7 shrink-0 items-center bg-surface-2 px-5 text-caption text-ink-2">
      Offline. You can still look around.
    </div>
  );
}

const subscribe = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};
const isOffline = () => navigator.onLine === false;
const onServer = () => false;

function useOffline(): boolean {
  return useSyncExternalStore(subscribe, isOffline, onServer);
}

export function OfflineBar() {
  return <OfflineBarView offline={useOffline()} />;
}
