import Link from "next/link";
import { MarkRefStamp } from "@/components/ledger/mark-stamp";
import { ObligationToken } from "@/components/ledger/obligation-token";
import { LiveDot, StateMark } from "@/components/ledger/state-mark";
import { TeamPair } from "@/components/ledger/team-stamp";
import { LinkPending } from "@/components/ui/link-pending";
import { ThatsMe } from "@/components/ledger/suggested-ghost";
import type { NeedRow } from "@/lib/ledger/home";
import { hueFor } from "@/lib/ui/hue";

const SHOWN = 4;

/**
 * docs/design.md 3.15. One card, rows divided by a line. Each row: the market's 40px stamp on its ink's field (or
 * nothing, when it has no mark: a stamp is never invented), the subject, then a meta line that starts with the
 * citron dot on the one row whose clock is soonest (one citron element per viewport, 4.5; the other rows with
 * clocks keep the clock and lose the dot), then the state mark, then the clock or the reason, and on the right a
 * 44px row action whose label is the verb. Every row is something they can finish now. Nothing here counts,
 * ages, or badges: no number on the heading, no "waiting 3 days", and when there is nothing the whole section is
 * gone. A claim to accept is a row here too (4.7), its verb the one tap that takes it.
 */
export function NeedsYou({ rows, viewer, showAll, allHref }: { rows: NeedRow[]; viewer: { id: string; displayName: string }; showAll: boolean; allHref: string }) {
  if (rows.length === 0) return null;
  const shown = showAll ? rows : rows.slice(0, SHOWN);
  const more = rows.length - shown.length;
  // The soonest clock among the rows on screen carries the dot; a clock that has passed still counts as soonest.
  const soonest = shown.reduce<NeedRow | null>((s, r) => (r.deadline && (!s || !s.deadline || r.deadline.getTime() < s.deadline.getTime()) ? r : s), null);
  const dotted = (r: NeedRow) => r === soonest;
  return (
    <section className="flex flex-col gap-[10px]">
      <h2 className="text-label text-ink-2">Needs you</h2>
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        {shown.map((r, i) => {
          if (r.kind === "game") {
            // Two links side by side, never one inside the other: the row opens the game page, the verb the pressing question.
            return (
              <div key={`game-${r.key}`} data-game-need="" data-need="game" className={`relative grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 py-[14px] pr-[14px] pl-4 ${i > 0 ? "border-t border-line" : ""}`}>
                <Link prefetch={false} href={r.href} className="absolute inset-0" aria-label={r.subject}>
                  <LinkPending />
                </Link>
                <TeamPair away={r.game.away} home={r.game.home} size={28} overlap />
                <span className="pointer-events-none flex min-w-0 flex-col gap-1">
                  <span className="text-body-strong text-ink">{r.subject}</span>
                  <span className="flex items-center gap-2 text-caption text-ink-3">
                    {dotted(r) ? <LiveDot data-soonest="" /> : null}
                    <StateMark state={r.game.state} />
                    <span className="truncate">{r.context}</span>
                  </span>
                </span>
                <Link prefetch={false} href={r.game.questionHref} className="relative link-row">
                  <LinkPending />
                  {r.verb}
                </Link>
              </div>
            );
          }
          if (r.kind === "claim") {
            // Offered, never assumed (PLANNING.md section 4): nothing moves unless they tap, and ignoring it costs nothing.
            return (
              <div key={`claim-${r.key}`} data-claim-need={r.claimId} data-need="claim" className={`relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-[14px] pr-[14px] pl-4 ${i > 0 ? "border-t border-line" : ""}`}>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-body-strong text-ink">{r.subject}</span>
                  <span className="flex items-center gap-2 text-caption text-ink-3">
                    <StateMark state="proposed" />
                    <span className="truncate">{r.context}</span>
                  </span>
                </span>
                <ThatsMe claimId={r.claimId} label={r.verb} />
              </div>
            );
          }
          const stamp = r.question && r.mark ? <MarkRefStamp mark={r.mark} size={40} ink={r.ink} /> : null;
          // The mark belongs to the thing (3.23): a question's state, a cover's proposed ring, an open obligation's ring; a tap that
          // never landed wears the didn't-go-through mark in its place (5.2).
          const mark = r.failed ? "failed" : r.question ? r.state : "proposed";
          return (
            <Link prefetch={false} key={`${r.kind}-${r.key}`} href={r.href} data-need={r.kind} className={`relative grid items-center gap-3 py-[14px] pr-[14px] pl-4 ${stamp ? "grid-cols-[40px_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]"} ${i > 0 ? "border-t border-line" : ""}`}>
              <LinkPending />
              {stamp}
              <span className="flex min-w-0 flex-col gap-1">
                {r.kind === "yep" ? (
                  <span className="flex items-center gap-2">
                    <ObligationToken owner={{ id: viewer.id, displayName: viewer.displayName, hue: hueFor(viewer.id) }} other={r.creditor} viewerId={viewer.id} denomination={r.denomination} quantity={r.proposal.quantity ?? 1n} pending />
                  </span>
                ) : r.kind === "again" && !r.question ? (
                  <span className="text-body-strong text-ink">{r.subject}</span>
                ) : (
                  <span className="text-serif-m text-ink">{r.subject}</span>
                )}
                <span className="flex items-center gap-2 text-caption text-ink-3">
                  {dotted(r) ? <LiveDot data-soonest="" /> : null}
                  <StateMark state={mark} />
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
