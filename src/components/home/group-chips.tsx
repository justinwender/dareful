import Link from "next/link";
import { LinkPending } from "@/components/ui/link-pending";
import type { GroupChip } from "@/lib/ledger/groups";
import { cn } from "@/lib/utils";

/**
 * docs/design.md 3.19. A group is a label on an event and a filter over this screen, never a container to go
 * into. One that came out of a single occasion and has not recurred is dashed: "has not happened yet", applied
 * to a group that may never become one.
 */
export function GroupChips({ chips, hidden, selectedId }: { chips: GroupChip[]; hidden: GroupChip[]; selectedId: string | null }) {
  if (chips.length === 0 && hidden.length === 0) return null;
  return (
    <section className="flex flex-col gap-[10px]">
      <h2 className="text-label text-ink-2">Groups</h2>
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((c) => {
          const selected = c.id === selectedId;
          return (
            <Link prefetch={false}
              key={c.id}
              href={selected ? "/" : `/?g=${c.id}`}
              aria-current={selected ? "true" : undefined}
              className={cn(
                "relative inline-flex h-9 max-w-full items-center overflow-hidden rounded-pill border px-[14px] text-[15px] font-medium text-ink-2",
                selected ? "border-ink-3 bg-surface-2" : "border-line-strong",
                c.once && !selected && "border-dashed",
              )}
            >
              <LinkPending />
              <span className="truncate">{c.label}</span>
            </Link>
          );
        })}
        {selectedId ? (
          <Link prefetch={false} href="/" className="relative inline-flex h-11 items-center px-2 text-[15px] font-semibold text-ink-2">
            <LinkPending />
            Clear
          </Link>
        ) : null}
      </div>
      {hidden.length > 0 ? (
        <details className="text-[15px] text-ink-2">
          <summary className="inline-flex h-11 cursor-pointer list-none items-center font-semibold">Hidden</summary>
          <div className="flex flex-wrap gap-2 pt-1">
            {hidden.map((c) => (
              <Link prefetch={false} key={c.id} href={`/?g=${c.id}`} className="relative inline-flex h-9 max-w-full items-center overflow-hidden rounded-pill border border-line px-[14px] text-[15px] font-medium text-ink-3">
                <LinkPending />
                <span className="truncate">{c.label}</span>
              </Link>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
