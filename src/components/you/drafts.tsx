import Link from "next/link";
import { LinkPending } from "@/components/ui/link-pending";

/**
 * Drafts on You (the first-contact round, 2026-10-04): a question saved and never sent stays reachable here once it
 * has left Now's Needs you, a day after it was saved. Each row opens the draft, where it is sent or discarded.
 */
export function DraftsSection({ drafts }: { drafts: Array<{ id: string; title: string }> }) {
  if (drafts.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" data-you-drafts={drafts.length}>
      <h2 className="text-label text-ink-3">Drafts</h2>
      <ul className="flex flex-col rounded-card border border-line bg-surface">
        {drafts.map((d) => (
          <li key={d.id} className="border-t border-line first:border-t-0">
            <Link href={`/m/${d.id}`} prefetch={false} data-press="row" className="relative flex min-h-12 items-center justify-between gap-3 px-4 py-3 press-row">
              <LinkPending />
              <span className="min-w-0 text-body text-ink">{d.title}</span>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-ink-3">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
