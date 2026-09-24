"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-reads the screen every few seconds while something is known to be on its way, and gives up after a minute. */
export function RefreshWhile({ everyMs = 3000, forMs = 60_000 }: { everyMs?: number; forMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => {
      if (Date.now() - started > forMs) return clearInterval(t);
      if (document.visibilityState === "visible") router.refresh();
    }, everyMs);
    return () => clearInterval(t);
  }, [router, everyMs, forMs]);
  return null;
}
