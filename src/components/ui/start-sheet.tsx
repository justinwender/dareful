"use client";

import Link from "next/link";
import { useState } from "react";
import { LinkPending } from "./link-pending";
import { Sheet } from "./sheet";

/**
 * Start (docs/design.md 6.1): a 56px chalk circle 16px above the bar, on the three roots only, opening the one
 * sheet that holds what a person can begin. Starting is not a place, so it is never a tab, and creating things
 * came off the root to live here. The specification lists five beginnings; splitting a receipt is not built, so it
 * is not offered: a row that leads nowhere is a broken control, not a preview.
 */
const ROWS = [
  { href: "/m/new", label: "Ask something", caption: "Something that’ll happen. Everyone puts a number on it." },
  { href: "/m/new?pace=argument", label: "Settle an argument", caption: "A claim about the world, called now." },
  { href: "/new", label: "I got this one", caption: "You covered something." },
  { href: "/join", label: "Join with a code", caption: "Someone read you one, or sent a link." },
];

export function StartButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px]">
        <button
          type="button"
          aria-label="Start something"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="pointer-events-auto absolute right-5 bottom-[calc(80px+env(safe-area-inset-bottom))] flex h-14 w-14 items-center justify-center rounded-pill bg-primary text-primary-foreground transition-opacity duration-[120ms] ease-out active:opacity-[0.88] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} labelledBy="start-title">
        <h2 id="start-title" className="text-label text-ink-3">
          Start something
        </h2>
        <ul className="-mx-2 flex flex-col">
          {ROWS.map((r, i) => (
            <li key={r.href}>
              <Link prefetch={false} href={r.href} data-autofocus={i === 0 ? true : undefined} className="relative flex min-h-14 items-center gap-3 rounded-button px-2 py-2">
                <LinkPending />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-body-strong text-ink">{r.label}</span>
                  <span className="text-caption text-ink-3">{r.caption}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
