import Link from "next/link";
import { LinkPending } from "@/components/ui/link-pending";
import type { DenominationRow } from "@/lib/ledger/denominations";
import { hueFor } from "@/lib/ui/hue";
import { coveredSentence, gotSentence } from "@/lib/ui/copy";
import { When } from "./when";
import { formatMoney } from "@/lib/ui/units";
import { Chip } from "./chip";
import { CoveredGlyph } from "./glyphs";
import { ObligationToken } from "./obligation-token";
import { StateMark } from "./state-mark";

/** `ghost`: someone who has not joined yet. Stone hue and a dashed ring, per docs/design.md 3.1. */
type Person = { id: string; displayName: string; ghost?: boolean };

export type CoveredCardProps = {
  viewerId: string;
  creditor: Person;
  debtor: Person;
  denomination: Pick<DenominationRow, "id" | "label" | "pluralLabel" | "quantifiable" | "monetary" | "template" | "markKind" | "markValue">;
  quantity: bigint;
  amountCents: bigint | null;
  memo: string | null;
  at: Date;
  /** From `viewerClock()`; the card never formats a time in the server's zone. */
  clock: { zone: string; now: number };
  groupName: string | null;
  state: "pending" | "open" | "partly" | "settled" | "forgiven";
  href?: string;
  /** Replaces "Tap to confirm" where the card is not a control, such as a claim link seen before signing in. */
  pendingHint?: string;
  /** The settlement photo (Principle 6), as the 84px thumbnail a covered card carries (3.4); the full frame behind it. */
  photo?: { thumb: string; full: string };
  /** The last tap on it (the yep, the close) is sent and still going through (docs/design.md 5.2): the on-its-way mark in place of the state's, and "on its way" after the words. */
  onWay?: boolean;
  /** The card is the move, inside a control of the caller's (the creditor's covered card opens the close sheet, 6.3): it presses as a row (9.4), as it does with an `href`. */
  control?: boolean;
};

/**
 * docs/design.md 3.4, the Covered kind: kicker row, subject line, supporting line, then a divider and one
 * consequence row. A settled event keeps its card; only the open header forgets it. Never struck through.
 */
export function CoveredCard(p: CoveredCardProps) {
  const subject = p.memo ?? coveredSentence(p.creditor, p.viewerId);
  const money = p.denomination.monetary && p.amountCents !== null ? formatMoney(p.amountCents, { cents: true }) : null;
  const support = (
    <>
      <When iso={p.at.toISOString()} zone={p.clock.zone} serverNow={p.clock.now} />
      {money ? ` · ${money}` : null}
    </>
  );
  const consequence = gotSentence(p.debtor, p.creditor, p.viewerId);
  // The obligation's state is its mark (docs/design.md 3.23): proposed, open in the owner's hue, settled, forgiven.
  const mark = p.state === "pending" ? ("proposed" as const) : p.state === "settled" ? ("settled" as const) : p.state === "forgiven" ? ("forgiven" as const) : ("owed" as const);
  const onWayLine = p.onWay ? `${p.state === "pending" ? "Yep" : p.state === "forgiven" ? "Called it even" : "Settled"} · on its way` : null;

  // A card that opens something presses to the ground of its place (9.4): the press sits on the card itself, since its fill is what a person sees.
  const press = Boolean(p.href) || p.control === true;
  const body = (
    <article data-press={press ? "row" : undefined} className={`flex flex-col gap-2 rounded-card border border-line bg-surface px-4 py-3.5${press ? " press-row" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-label text-ink-2">
          <StateMark state={p.onWay ? "onway" : mark} hue={!p.onWay && mark === "owed" ? (p.debtor.ghost ? "stone" : hueFor(p.debtor.id)) : undefined} />
          <CoveredGlyph size={16} />
          Covered
        </span>
        {p.groupName ? <Chip>{p.groupName}</Chip> : null}
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-body-strong text-ink">{subject}</p>
          {support ? <p className="text-body-sm text-ink-2">{support}</p> : null}
        </div>
        {p.photo ? (
          // Behind a signed URL that expires; next/image would need a loader for one. Not a link inside a link.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.photo.thumb} alt="The photo from when it was settled" width={84} height={84} loading="lazy" className="h-[84px] w-[84px] shrink-0 rounded-button bg-surface-2 object-cover" />
        ) : null}
      </div>
      <div className="mt-1 flex items-center justify-between gap-3 border-t border-line pt-3">
        <span className="text-body-sm text-ink-2">{onWayLine ?? (p.state === "pending" && p.debtor.id === p.viewerId ? (p.pendingHint ?? "Tap to confirm") : consequence)}</span>
        <ObligationToken
          owner={{ id: p.debtor.id, displayName: p.debtor.displayName, hue: p.debtor.ghost ? "stone" : hueFor(p.debtor.id), ghost: p.debtor.ghost }}
          other={p.creditor}
          viewerId={p.viewerId}
          denomination={p.denomination}
          quantity={p.quantity}
          pending={p.state === "pending"}
        />
      </div>
    </article>
  );
  return p.href ? (
    // The press is the card's (above), not the link's around it: a fill behind the card would never be seen.
    <Link prefetch={false} href={p.href} data-press-within="" className="relative block rounded-card">
      <LinkPending />
      {body}
    </Link>
  ) : (
    body
  );
}
