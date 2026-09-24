"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { LinkPending } from "./link-pending";
import { ROOT_KEY, rootFor, type RootPath } from "@/lib/ui/root";

const never = () => () => {};
const onServer = (): RootPath => "/";
function readRoot(): RootPath {
  try {
    return rootFor(sessionStorage.getItem(ROOT_KEY));
  } catch {
    return "/";
  }
}

/**
 * The 48px back control at the top left of every non-root screen (docs/design.md 6.4). It lands on the root this
 * person came from, remembered when that root rendered, and on Now when nothing is remembered. It never depends on
 * a browser history: an installed app has none to lean on, and a cold start from a notification has no previous
 * page at all.
 */
export function BackControl({ label = "Back" }: { label?: string }) {
  const href = useSyncExternalStore(never, readRoot, onServer);
  return (
    <Link prefetch={false} href={href} aria-label={label} className="relative -ml-2 inline-flex h-12 w-12 items-center justify-center rounded-pill text-ink">
      <LinkPending />
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </Link>
  );
}
