import Link from "next/link";
import { ObligationToken } from "@/components/ledger/obligation-token";
import { LinkPending } from "@/components/ui/link-pending";
import type { NeedRow } from "@/lib/ledger/home";
import { hueFor } from "@/lib/ui/hue";

const SHOWN = 4;

/**
 * docs/design.md 3.15. One card, rows divided by a line; each row says why it needs this person and carries its
 * verb. Every row is something they can finish now. Nothing here counts, ages, or badges: no number on the
 * heading, no "waiting 3 days", and when there is nothing the whole section is gone, not shown empty.
 */
export function NeedsYou({ rows, viewer, showAll, allHref }: { rows: NeedRow[]; viewer: { id: string; displayName: string }; showAll: boolean; allHref: string }) {
  if (rows.length === 0) return null;
  const shown = showAll ? rows : rows.slice(0, SHOWN);
  const more = rows.length - shown.length;
  return (
    <section className="flex flex-col gap-[10px]">
      <h2 className="text-label text-ink-2">Needs you</h2>
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        {shown.map((r, i) => (
          <Link key={`${r.kind}-${r.key}`} href={r.href} className={`relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-[14px] pr-[14px] pl-4 ${i > 0 ? "border-t border-line" : ""}`}>
            <LinkPending />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-[13px] leading-4 text-ink-3">{r.context}</span>
              {r.kind === "yep" ? (
                <span className="flex items-center gap-2">
                  <ObligationToken owner={{ id: viewer.id, displayName: viewer.displayName, hue: hueFor(viewer.id) }} other={r.creditor} viewerId={viewer.id} denomination={r.denomination} quantity={r.proposal.quantity ?? 1n} pending />
                </span>
              ) : (
                <span className="font-serif text-[17px] leading-[22px] text-ink">{r.subject}</span>
              )}
            </span>
            <span className="inline-flex h-11 items-center rounded-chip-button border border-line-strong bg-surface-2 px-4 text-[15px] font-semibold text-ink">{r.verb}</span>
          </Link>
        ))}
        {more > 0 ? (
          <Link href={allHref} className="relative flex h-11 items-center border-t border-line px-4 text-[15px] font-semibold text-ink-2">
            <LinkPending />
            {more} more
          </Link>
        ) : null}
      </div>
    </section>
  );
}
