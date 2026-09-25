import Link from "next/link";
import type { TypedDataDomain } from "viem";
import { LinkPending } from "@/components/ui/link-pending";
import { AvatarStack } from "@/components/ledger/avatar";
import { Chip } from "@/components/ledger/chip";
import { CloseObligation } from "@/components/ledger/close-obligation";
import { MarkStamp } from "@/components/ledger/mark-stamp";
import { ObligationToken } from "@/components/ledger/obligation-token";
import { StateMark, type MarketMark } from "@/components/ledger/state-mark";
import { When } from "@/components/ledger/when";
import type { DenominationRow } from "@/lib/ledger/denominations";
import { gotSentence } from "@/lib/ui/copy";
import { hueFor } from "@/lib/ui/hue";
import type { InkName } from "@/lib/ui/ink";
import { CallLine, type Pin } from "./call-line";

export type MarketCardProps = {
  id: string;
  title: string;
  mark: string | null;
  ink: InkName;
  groupName: string | null;
  state: "open" | "locked" | "resolved" | "voided" | "expired";
  viewerIn: boolean;
  votesCast: number;
  /** The only words beside the state mark: a clock, when the state has one (3.23). */
  clockLine: string | null;
  /** An argument reads "Argument" in its kicker; a dare does not say what it is. */
  argument?: boolean;
  at: Date;
  clock: { zone: string; now: number };
  viewerId: string;
  /** Everyone in it. Percents are only present when numbers may be shown. */
  people: Array<{ id: string; name: string; percent: number | null }>;
  groupSize: number;
  outcome: 0 | 1 | null;
  denomination: DenominationRow;
  /** What this market left between the people in view: the whole market on a group page, one pair on a person page. */
  consequences: Array<{ id?: string; from: { id: string; displayName: string }; to: { id: string; displayName: string }; quantity: bigint }>;
  /** Each consequence's state by obligation id, where the screen knows it (the person view does; Now does not). */
  consequenceStates?: Record<string, "open" | "settled" | "forgiven">;
  /** Given, a consequence the viewer is owed and that is still open becomes the move to settle it or call it even (6.3). */
  close?: { domain: TypedDataDomain; photosOn: boolean };
};

/** The market's state as its mark (3.23): the sentence the kicker used to spend on it is gone. */
function markOf(p: Pick<MarketCardProps, "state" | "viewerIn" | "votesCast">): MarketMark {
  if (p.state === "open") return p.viewerIn ? "in" : "open";
  if (p.state === "locked") return p.votesCast > 0 ? "voting" : "locked";
  return p.state;
}

/**
 * A market in a timeline (docs/design.md 3.4): a story, never ledger rows. The kicker is the state mark, the mark's
 * stamp on the market's field, and at most a clock; then the question in the serif, the call line, what happened,
 * and beneath a divider only the consequences between the people in view, however many obligations the market
 * minted. The action lives on the market's own screen, never on the card.
 */
export function MarketCard(p: MarketCardProps) {
  const pins: Pin[] = p.people.filter((x): x is { id: string; name: string; percent: number } => x.percent !== null).map((x) => ({ id: x.id, name: x.name, percent: x.percent }));
  const mark = markOf(p);
  // The story is the link; its consequences sit under it, outside the link, because one of them may be a control.
  return (
    <article className="flex flex-col rounded-card border border-line bg-surface">
      <Link prefetch={false} href={`/m/${p.id}`} className="relative flex flex-col gap-3 rounded-card px-4 py-3.5">
        <LinkPending />
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-2 text-label text-ink-2">
            <StateMark state={mark} hue={mark === "in" ? hueFor(p.viewerId) : undefined} />
            {p.mark ? <MarkStamp kind="emoji" value={p.mark} size={20} ink={p.ink} /> : <AskGlyph />}
            {p.argument ? <span>Argument</span> : null}
            {p.clockLine ? <span className="truncate">{p.clockLine}</span> : null}
          </span>
          {p.groupName ? <Chip>{p.groupName}</Chip> : null}
        </div>
        <h3 className="text-serif-l text-ink">{p.title}</h3>

        {p.state === "open" ? (
          <div className="flex items-center gap-3">
            <AvatarStack people={p.people.map((x) => ({ name: x.name, hue: hueFor(x.id) }))} size={26} ring="var(--surface)" />
            <span className="text-body-sm text-ink-2">
              {p.people.length} of {p.groupSize} in
            </span>
          </div>
        ) : p.state === "expired" ? (
          <p className="text-body-sm text-ink-2">Nobody called it in time. Nothing changes hands.</p>
        ) : p.state === "voided" ? (
          <p className="text-body-sm text-ink-2">Nobody could tell, so it’s void.</p>
        ) : (
          <>
            {p.state === "resolved" && p.outcome !== null ? <p className="text-serif-l text-ink">{p.outcome === 1 ? "Yes." : "No."}</p> : null}
            <CallLine pins={pins} state={p.state === "resolved" ? "resolved" : pins.length > 0 ? "in" : "hidden"} outcome={p.outcome ?? undefined} />
          </>
        )}

        <p className="text-body-sm text-ink-2">
          <When iso={p.at.toISOString()} zone={p.clock.zone} serverNow={p.clock.now} />
        </p>
      </Link>

      {p.state === "resolved" ? (
        <div className="mx-4 flex flex-col border-t border-line pt-1 pb-3.5">
          {p.consequences.length === 0 ? (
            <p className="pt-2 text-body-sm text-ink-2">Nothing changes hands between you.</p>
          ) : (
            p.consequences.map((c) => {
              const state = c.id ? p.consequenceStates?.[c.id] : undefined;
              const sentence = gotSentence(c.from, c.to, p.viewerId);
              const row = (
                <div className="flex items-center justify-between gap-3 py-2">
                  <span className="inline-flex items-center gap-2 text-body-sm text-ink-2">
                    {state === "settled" || state === "forgiven" ? <StateMark state={state} /> : null}
                    {sentence}
                  </span>
                  <ObligationToken owner={{ id: c.from.id, displayName: c.from.displayName, hue: hueFor(c.from.id) }} other={c.to} viewerId={p.viewerId} denomination={p.denomination} quantity={c.quantity} />
                </div>
              );
              // An obligation a market minted closes the same way a cover does: from its row, by the person owed.
              if (c.id && state === "open" && p.close && c.to.id === p.viewerId) {
                return (
                  <CloseObligation key={c.id} obligationId={c.id} sentence={sentence} what={p.title} domain={p.close.domain} photosOn={p.close.photosOn}>
                    {row}
                  </CloseObligation>
                );
              }
              return <div key={c.id ?? `${c.from.id}-${c.to.id}`}>{row}</div>;
            })
          )}
          <Link prefetch={false} href={`/m/${p.id}`} className="relative pt-1 link-tertiary">
            <LinkPending />
            See how everyone did
          </Link>
        </div>
      ) : null}
    </article>
  );
}

/** The structural icon for a question, at 16px, where a market has no mark. */
export function AskGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7" />
      <path d="M12 17h.01" />
    </svg>
  );
}
