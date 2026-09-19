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
  const stateLine =
    p.state === "settled" ? "Squared up" : p.state === "forgiven" ? "Called it even" : p.state === "partly" ? "Partly squared" : p.state === "pending" ? (p.debtor.id === p.viewerId ? "Waiting on you" : `Waiting for ${p.debtor.displayName}`) : null;

  const body = (
    <article className="flex flex-col gap-2 rounded-card border border-line bg-surface px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-label text-ink-2">
          <CoveredGlyph size={16} />
          Covered
        </span>
        {p.groupName ? <Chip>{p.groupName}</Chip> : null}
      </div>
      <p className="text-body-strong text-ink">{subject}</p>
      {support ? <p className="text-body-sm text-ink-2">{support}</p> : null}
      <div className="mt-1 flex items-center justify-between gap-3 border-t border-line pt-3">
        <span className="text-body-sm text-ink-2">{p.state === "pending" && p.debtor.id === p.viewerId ? (p.pendingHint ?? "Tap to confirm") : consequence}</span>
        <ObligationToken
          owner={{ id: p.debtor.id, displayName: p.debtor.displayName, hue: p.debtor.ghost ? "stone" : hueFor(p.debtor.id), ghost: p.debtor.ghost }}
          other={p.creditor}
          viewerId={p.viewerId}
          denomination={p.denomination}
          quantity={p.quantity}
          pending={p.state === "pending"}
        />
      </div>
      {stateLine ? <p className="text-caption text-ink-3">{stateLine}</p> : null}
    </article>
  );
  return p.href ? (
    <Link href={p.href} className="relative block rounded-card">
      <LinkPending />
      {body}
    </Link>
  ) : (
    body
  );
}
