import Link from "next/link";
import { LinkPending } from "@/components/ui/link-pending";
import { AvatarStack } from "@/components/ledger/avatar";
import { Chip } from "@/components/ledger/chip";
import { MarkStamp } from "@/components/ledger/mark-stamp";
import { ObligationToken } from "@/components/ledger/obligation-token";
import { When } from "@/components/ledger/when";
import type { DenominationRow } from "@/lib/ledger/denominations";
import { gotSentence } from "@/lib/ui/copy";
import { hueFor } from "@/lib/ui/hue";
import { CallLine, type Pin } from "./call-line";

export type MarketCardProps = {
  id: string;
  title: string;
  mark: string | null;
  groupName: string | null;
  state: "open" | "locked" | "resolved" | "voided";
  at: Date;
  clock: { zone: string; now: number };
  viewerId: string;
  /** Everyone in it. Percents are only present when numbers may be shown. */
  people: Array<{ id: string; name: string; percent: number | null }>;
  groupSize: number;
  outcome: 0 | 1 | null;
  denomination: DenominationRow;
  /** What this market left between the people in view: the whole market on a group page, one pair on a person page. */
  consequences: Array<{ from: { id: string; displayName: string }; to: { id: string; displayName: string }; quantity: bigint }>;
  needsYou?: string | null;
};

/**
 * A market in a timeline (docs/design.md 3.4): a story, never ledger rows. The question in the serif, the call
 * line, what happened, and beneath a divider only the consequences between the people in view, however many
 * obligations the market minted. The full table is one tap away.
 */
export function MarketCard(p: MarketCardProps) {
  const pins: Pin[] = p.people.filter((x): x is { id: string; name: string; percent: number } => x.percent !== null).map((x) => ({ id: x.id, name: x.name, percent: x.percent }));
  const kicker = p.state === "open" ? "Open" : p.state === "locked" ? "Waiting on an answer" : p.state === "voided" ? "No answer" : "Settled";
  return (
    <Link prefetch={false} href={`/m/${p.id}`} className="relative block rounded-card">
      <LinkPending />
      <article className="flex flex-col gap-3 rounded-card border border-line bg-surface px-4 py-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-label text-ink-2">
            <AskGlyph />
            {kicker}
          </span>
          {p.groupName ? <Chip>{p.groupName}</Chip> : null}
        </div>
        <h3 className="flex items-start gap-2 text-card-question text-ink">
          {p.mark ? <MarkStamp kind="emoji" value={p.mark} size={28} /> : null}
          <span>{p.title}</span>
        </h3>

        {p.state === "open" ? (
          <div className="flex items-center gap-3">
            <AvatarStack people={p.people.map((x) => ({ name: x.name, hue: hueFor(x.id) }))} size={26} ring="var(--surface)" />
            <span className="text-body-sm text-ink-2">
              {p.people.length} of {p.groupSize} in
            </span>
          </div>
        ) : p.state === "voided" ? (
          <p className="text-body-sm text-ink-2">Nobody could tell, so it’s void.</p>
        ) : (
          <>
            {p.state === "resolved" && p.outcome !== null ? <p className="text-outcome-sm text-ink">{p.outcome === 1 ? "Yes." : "No."}</p> : null}
            <CallLine pins={pins} state={p.state === "resolved" ? "resolved" : pins.length > 0 ? "in" : "hidden"} outcome={p.outcome ?? undefined} />
          </>
        )}

        <p className="text-body-sm text-ink-2">
          <When iso={p.at.toISOString()} zone={p.clock.zone} serverNow={p.clock.now} />
          {p.needsYou ? <span className="text-ink"> · {p.needsYou}</span> : null}
        </p>

        {p.state === "resolved" ? (
          <div className="flex flex-col border-t border-line pt-1">
            {p.consequences.length === 0 ? (
              <p className="pt-2 text-body-sm text-ink-2">Nothing changes hands between you.</p>
            ) : (
              p.consequences.map((c) => (
                <div key={`${c.from.id}-${c.to.id}`} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-body-sm text-ink-2">{gotSentence(c.from, c.to, p.viewerId)}</span>
                  <ObligationToken owner={{ id: c.from.id, displayName: c.from.displayName, hue: hueFor(c.from.id) }} other={c.to} viewerId={p.viewerId} denomination={p.denomination} quantity={c.quantity} />
                </div>
              ))
            )}
            <span className="pt-1 text-[15px] font-semibold text-ink-2">See how everyone did</span>
          </div>
        ) : null}
      </article>
    </Link>
  );
}

function AskGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7" />
      <path d="M12 17h.01" />
    </svg>
  );
}
