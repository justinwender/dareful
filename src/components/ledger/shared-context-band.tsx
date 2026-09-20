import Link from "next/link";
import { LinkPending } from "@/components/ui/link-pending";
import type { SharedContext } from "@/lib/ledger/person";
import { cn } from "@/lib/utils";

const SHOWN = 5;

/**
 * docs/design.md 3.21: where these two turn up. A heading, context chips with counts of shared events, and one
 * line saying what tapping does; tapping filters the timeline below and opens nothing.
 *
 * Held to the specification's honesty test: no group header, no member list, no group avatar, no way in, and no
 * "see all". The overflow chip is a count, not a link. If this ever grows one of those it has become a group
 * list in disguise, which is the thing home was rebuilt to stop being.
 */
export function SharedContextBand({ personId, contexts, selectedId }: { personId: string; contexts: SharedContext[]; selectedId: string | null }) {
  if (contexts.length === 0) return null;
  const shown = contexts.slice(0, SHOWN);
  const more = contexts.length - shown.length;
  return (
    <section className="flex flex-col gap-2" aria-label="Where you two turn up">
      <h2 className="text-[13px] font-semibold leading-4 text-ink-2">Where you two turn up</h2>
      <div className="flex flex-wrap items-center gap-2">
        {shown.map((c) => {
          const selected = c.groupId === selectedId;
          return (
            <Link
              key={c.groupId}
              prefetch={false}
              scroll={false}
              href={selected ? `/p/${personId}` : `/p/${personId}?c=${c.groupId}`}
              aria-current={selected ? "true" : undefined}
              className={cn("relative -my-1 inline-flex h-11 max-w-full items-center")}
            >
              <LinkPending />
              <span className={cn("inline-flex h-9 max-w-full items-center gap-1.5 rounded-pill border px-[14px] text-[15px] font-medium text-ink-2", selected ? "border-ink-3 bg-surface-2" : "border-line-strong", c.unnamed && !selected && "border-dashed")}>
                <span className="truncate">{c.label}</span>
                <span className="text-[13px] text-ink-3">{c.count}</span>
              </span>
            </Link>
          );
        })}
        {more > 0 ? <span className="inline-flex h-9 items-center rounded-pill border border-line px-[14px] text-[15px] font-medium text-ink-3">and {more} more</span> : null}
        {selectedId ? (
          <Link prefetch={false} scroll={false} href={`/p/${personId}`} className="relative inline-flex h-11 items-center px-2 text-[15px] font-semibold text-ink-2">
            <LinkPending />
            Clear
          </Link>
        ) : null}
      </div>
      <p className="text-[13px] leading-[18px] text-ink-3">{selectedId ? "Showing only those. Clear to see everything between you." : "Tap one to see only those."}</p>
    </section>
  );
}
