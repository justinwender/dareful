import Link from "next/link";
import { MarkStamp } from "@/components/ledger/mark-stamp";
import { AskGlyph } from "@/components/markets/market-card";
import { LinkPending } from "@/components/ui/link-pending";
import type { RunningRow } from "@/lib/ledger/home";

/**
 * Running (docs/design.md 4.7): questions in flight that this person has already acted on, so "I entered that,
 * didn't I?" has an answer without a search. Each row says where it stands and carries no action: the action lives
 * on the question's own screen, never on the row. Nothing here counts down or ages.
 */
export function Running({ rows }: { rows: RunningRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-[10px]">
      <h2 className="text-label text-ink-2">Running</h2>
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        {rows.map((r, i) => (
          <Link prefetch={false} key={r.id} href={`/m/${r.id}`} className={`relative grid grid-cols-[28px_minmax(0,1fr)] items-start gap-3 px-4 py-[14px] ${i > 0 ? "border-t border-line" : ""}`}>
            <LinkPending />
            {r.mark ? (
              <MarkStamp kind="emoji" value={r.mark} size={28} />
            ) : (
              <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-stamp-28 border border-line bg-surface text-ink-3">
                <AskGlyph />
              </span>
            )}
            <span className="flex min-w-0 flex-col gap-1">
              <span className="font-serif text-[17px] leading-[22px] text-ink">{r.title}</span>
              <span className="text-[13px] leading-[18px] text-ink-3">{r.caption}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
