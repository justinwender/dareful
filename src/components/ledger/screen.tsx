import type { ReactNode } from "react";
import { LinkPending } from "@/components/ui/link-pending";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** One phone layout, 390px reference, 20px gutters, centered on wider viewports (docs/design.md 4.2). */
export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn("mx-auto flex w-full max-w-[430px] flex-1 flex-col px-5 pb-[max(2rem,calc(env(safe-area-inset-bottom)+1rem))]", className)}>{children}</main>;
}

export function TopBar({ back, title, right }: { back?: { href: string; label: string }; title?: string; right?: ReactNode }) {
  return (
    <header className="flex h-14 items-center justify-between">
      <div className="flex min-w-0 items-center gap-2">
        {back ? (
          <Link prefetch={false} href={back.href} aria-label={back.label} className="relative -ml-2 inline-flex h-12 w-12 items-center justify-center rounded-pill text-ink">
            <LinkPending />
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </Link>
        ) : null}
        {title ? <span className="truncate text-body-strong text-ink">{title}</span> : null}
      </div>
      <div className="flex items-center gap-1">{right}</div>
    </header>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="text-label text-ink-3">{children}</h2>;
}

/** Bottom action area: 16px top, 20px sides, 24px bottom or the home indicator's inset, whichever is more. At most one primary button per viewport. */
export function ActionArea({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 -mx-5 mt-auto bg-ground px-5 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{children}</div>;
}
