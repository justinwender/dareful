import Link from "next/link";
import { LinkPending } from "@/components/ui/link-pending";

/**
 * The ideas tile (docs/design.md 3.47): a row drawn as a game row, with one 28px stamp of 💡 on `--surface-2` where
 * the two team stamps go. First on What's on, above Most asked; last on Now while fewer than three questions are
 * running. The same button in both places, opening the ideas page.
 */
export function IdeasTile() {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface" data-ideas-tile="">
      <Link prefetch={false} href="/ideas" data-press="row" className="press-row relative grid grid-cols-[60px_minmax(0,1fr)_18px] items-center gap-3 px-[14px] py-3">
        <LinkPending />
        <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-panel bg-surface-2 text-body leading-none">
          💡
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-body-strong text-ink">Ideas</span>
          <span className="truncate text-caption text-ink-3">Questions ready to ask</span>
        </span>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-3">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  );
}
