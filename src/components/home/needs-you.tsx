import Link from "next/link";
import { MarkStamp } from "@/components/ledger/mark-stamp";
import { ObligationToken } from "@/components/ledger/obligation-token";
import { LiveDot, StateMark } from "@/components/ledger/state-mark";
import { LinkPending } from "@/components/ui/link-pending";
import type { NeedRow } from "@/lib/ledger/home";
import { hueFor } from "@/lib/ui/hue";

const SHOWN = 4;

/**
 * docs/design.md 3.15. One card, rows divided by a line. Each row: the market's 40px stamp on its ink's field (or
 * nothing, when it has no mark: a stamp is never invented), the subject, then a meta line that starts with the
 * citron dot when there is a clock, then the state mark, then the clock or the reason, and on the right a 44px
 * row action whose label is the verb. Every row is something they can finish now. Nothing here counts, ages, or
 * badges: no number on the heading, no "waiting 3 days", and when there is nothing the whole section is gone.
 */
export function NeedsYou({ rows, viewer, showAll, allHref }: { rows: NeedRow[]; viewer: { id: string; displayName: string }; showAll: boolean; allHref: string }) {
  if (rows.length === 0) return null;
  const shown = showAll ? rows : rows.slice(0, SHOWN);
  const more = rows.length - shown.length;
  return (
    <section className="flex flex-col gap-[10px]">
      <h2 className="text-label text-ink-2">Needs you</h2>
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        {shown.map((r, i) => {
          const stamp = r.question && r.mark ? <MarkStamp kind="emoji" value={r.mark} size={40} ink={r.ink} /> : null;
          return (
            <Link prefetch={false} key={`${r.kind}-${r.key}`} href={r.href} className={`relative grid items-center gap-3 py-[14px] pr-[14px] pl-4 ${stamp ? "grid-cols-[40px_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]"} ${i > 0 ? "border-t border-line" : ""}`}>
              <LinkPending />
              {stamp}
              <span className="flex min-w-0 flex-col gap-1">
                {r.kind === "yep" ? (
                  <span className="flex items-center gap-2">
                    <ObligationToken owner={{ id: viewer.id, displayName: viewer.displayName, hue: hueFor(viewer.id) }} other={r.creditor} viewerId={viewer.id} denomination={r.denomination} quantity={r.proposal.quantity ?? 1n} pending />
                  </span>
                ) : (
                  <span className="text-serif-m text-ink">{r.subject}</span>
                )}
                <span className="flex items-center gap-2 text-caption text-ink-3">
                  {r.deadline ? <LiveDot /> : null}
                  <StateMark state={r.question ? r.state : "proposed"} />
                  <span className="truncate">{r.context}</span>
                </span>
              </span>
              <span className="link-row">{r.verb}</span>
            </Link>
          );
        })}
        {more > 0 ? (
          <Link prefetch={false} href={allHref} className="relative flex h-11 items-center border-t border-line px-4 link-tertiary">
            <LinkPending />
            {more} more
          </Link>
        ) : null}
      </div>
    </section>
  );
}
