"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { LinkPending } from "./link-pending";
import { ROOT_KEY, rootFor, type RootPath } from "@/lib/ui/root";
import { useAskLayer } from "@/components/markets/ask-layer";
import { useRouter } from "next/navigation";
import { rootFresh, whenRootMounts } from "@/lib/ui/roots-store";
import { marketIdOf } from "@/lib/ui/shell";
import { supportsViewTransitions, withLandingTransition } from "@/lib/ui/transitions";
import { MOTION } from "@/lib/ui/motion";

const never = () => () => {};
const onServer = (): RootPath => "/";
function readRoot(): RootPath {
  try {
    return rootFor(sessionStorage.getItem(ROOT_KEY));
  } catch {
    return "/";
  }
}

/** The root this person came from, remembered when that root rendered; Now when nothing is remembered. */
export function useBackHref(): RootPath {
  return useSyncExternalStore(never, readRoot, onServer);
}

/**
 * The 48px back control at the top left of every non-root screen (docs/design.md 6.4). It lands on the root this
 * person came from, remembered when that root rendered, and on Now when nothing is remembered. It never depends on
 * a browser history: an installed app has none to lean on, and a cold start from a notification has no previous
 * page at all. Back marks the document for the step transition's direction (9.8): the content it leaves goes
 * rightward.
 */
export function BackControl({ label = "Back", onBack }: { label?: string; /** Back within a flow (a step of asking, 9.8): a button, not a link to the root. */ onBack?: () => void }) {
  const href = useBackHref();
  const router = useRouter();
  /** Back from a market (9.7): when the root is still held by the router, the ink shrinks into the market's row, wherever it now is, over the same 320ms; otherwise a plain arrival. */
  const back = (e: React.MouseEvent<HTMLAnchorElement>) => {
    document.documentElement.classList.add("back");
    const id = marketIdOf(location.pathname);
    if (!id || !supportsViewTransitions() || !rootFresh(href) || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const landed = whenRootMounts(href).then(() => {
      const row = document.querySelector<HTMLElement>(`[data-shell-id="${id}"]`);
      const stamp = row?.querySelector<HTMLElement>("[data-stamp]");
      const mark = row?.querySelector<HTMLElement>("[data-stamp-mark]");
      // The row takes the names only when it is in view once the scroll is restored; otherwise the ink fades with the band's words.
      if (stamp && row) {
        const r = row.getBoundingClientRect();
        if (r.bottom > 0 && r.top < window.innerHeight) {
          stamp.style.viewTransitionName = "market-ink";
          if (mark) mark.style.viewTransitionName = "market-mark";
          setTimeout(() => {
            stamp.style.viewTransitionName = "";
            if (mark) mark.style.viewTransitionName = "";
          }, MOTION.travel + 60);
        }
      }
    });
    withLandingTransition(() => router.push(href, { scroll: false }), landed, { back: true });
  };
  if (onBack)
    return (
      <button type="button" aria-label={label} onClick={onBack} data-back="" data-press="line" className="relative -ml-2 inline-flex h-12 w-12 items-center justify-center rounded-pill text-ink press-line">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>
    );
  return (
    <Link prefetch={false} href={href} aria-label={label} data-back="" data-press="line" onClick={back} className="relative -ml-2 inline-flex h-12 w-12 items-center justify-center rounded-pill text-ink press-line">
      <LinkPending look="control" />
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </Link>
  );
}

/** The 48px close, a down chevron, where a screen rose from below (9.5): the question step's top left. */
export function CloseControl({ onClose, href, label = "Close" }: { onClose?: () => void; href?: string; label?: string }) {
  const layer = useAskLayer();
  const root = useBackHref();
  const close = onClose ?? layer?.close;
  const glyph = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 9l7 7 7-7" />
    </svg>
  );
  if (close)
    return (
      <button type="button" aria-label={label} onClick={close} data-press="line" className="relative -ml-2 inline-flex h-12 w-12 items-center justify-center rounded-pill text-ink press-line">
        {glyph}
      </button>
    );
  return (
    <Link prefetch={false} href={href ?? root} aria-label={label} data-press="line" className="relative -ml-2 inline-flex h-12 w-12 items-center justify-center rounded-pill text-ink press-line">
      <LinkPending look="control" />
      {glyph}
    </Link>
  );
}
