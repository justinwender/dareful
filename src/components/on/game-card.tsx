import Link from "next/link";
import type { TypedDataDomain } from "viem";
import { Chip } from "@/components/ledger/chip";
import { CloseObligation } from "@/components/ledger/close-obligation";
import { MediaFrame } from "@/components/ledger/media-frame";
import { ObligationToken } from "@/components/ledger/obligation-token";
import { StateMark } from "@/components/ledger/state-mark";
import { TeamStamp } from "@/components/ledger/team-stamp";
import { When } from "@/components/ledger/when";
import { LinkPending } from "@/components/ui/link-pending";
import type { MarketCardData } from "@/lib/ledger/market-view";
import { unitPhrase } from "@/lib/ledger/number-axis";
import { gotSentence } from "@/lib/ui/copy";
import { hueFor } from "@/lib/ui/hue";
import { outcomeLine } from "@/lib/ui/outcome-words";
import { leanPill, type TeamFace } from "@/lib/ui/team";
import { VOID_OUTCOME } from "@/lib/ledger/markets";

export type GameCardProps = {
  game: { id: string; groupId: string; name: string; away: TeamFace; home: TeamFace; score: string | null; over: boolean };
  markets: MarketCardData[];
  groupName: string | null;
  at: Date;
  clock: { zone: string; now: number };
  viewerId: string;
  themId: string;
  themName: string;
  consequenceStates: Record<string, "open" | "settled" | "forgiven">;
  close: { domain: TypedDataDomain; photosOn: boolean };
};

/** "Bills by 3", "Bills 70%", "41", "Field goal": a person's number on one of the game's questions, in the market's words. */
function said(m: MarketCardData, personId: string, game: GameCardProps["game"]): string | null {
  const p = m.people.find((x) => x.id === personId);
  if (!p) return null;
  if (m.pickOne && p.pick !== null) return m.pickOne.answers[p.pick]?.text ?? null;
  if (m.unit && p.number !== null) return unitPhrase(BigInt(p.number), m.unit);
  if (p.percent !== null) return m.dare.templateId && !m.unit && !m.pickOne && /^Who wins/.test(m.dare.title) ? leanPill(p.percent, game.away.name, game.home.name) : `${p.percent}%`;
  return null;
}

/** The outcome of one of the game's questions in the market's words, or where it stands. */
function outcomeOf(m: MarketCardData): string {
  if (m.state === "resolved") {
    if (m.pickOne && m.pickOne.outcome !== null) return m.pickOne.answers[m.pickOne.outcome]?.text ?? "Decided";
    if (m.unit && m.answer !== null) return unitPhrase(BigInt(m.answer), m.unit);
    if (m.outcome !== null) return outcomeLine(m.dare, m.outcome === 1).replace(/\.$/, "");
    return "Decided";
  }
  if (m.state === "voided") return m.dare.resolvedOutcome === VOID_OUTCOME && m.dare.feedEnding === "tie" ? "A tie, void" : "Void";
  if (m.state === "expired") return "Never settled";
  return m.state === "locked" ? "Waiting" : "Open";
}

/**
 * A game as one story in a timeline (docs/design.md 3.4): the kicker with the two 20px stamps and "What's on ·
 * Chiefs at Bills", the final score as the subject, the frame at 180 with the photos from every question, one
 * line per question with its outcome and what the two people in view said, and when. Tapping it opens the game
 * page. Under the link, the consequences between the two people in view, one row per unit summed across the
 * game's questions: that figure is display only, the obligations underneath stay separate, one per question, and
 * each the viewer is owed and still open keeps its own settle row beneath the sum (6.3).
 */
export function GameCard(p: GameCardProps) {
  const media = p.markets.flatMap((m) => m.media.map((x) => ({ id: x.id, author: { name: x.author.displayName, hue: hueFor(x.author.id) } })));
  const consequences = p.markets.flatMap((m) => m.consequences.map((c) => ({ ...c, denomination: m.denomination, question: m.dare.title })));
  // Summed per pair and unit, display only (the brief: the obligations underneath stay separate).
  const sums = new Map<string, { from: { id: string; displayName: string }; to: { id: string; displayName: string }; denomination: MarketCardData["denomination"]; quantity: bigint }>();
  for (const c of consequences) {
    const key = `${c.from.id}:${c.to.id}:${c.denomination.id}`;
    const s = sums.get(key) ?? { from: c.from, to: c.to, denomination: c.denomination, quantity: 0n };
    s.quantity += c.quantity;
    sums.set(key, s);
  }
  const mine = consequences.filter((c) => c.id && p.consequenceStates[c.id] === "open" && c.to.id === p.viewerId);
  return (
    <article className="flex flex-col rounded-card border border-line bg-surface" data-game-story={p.game.id}>
      <Link prefetch={false} href={`/on/${p.game.id}?g=${p.game.groupId}`} className="relative flex flex-col gap-3 rounded-card px-4 py-3.5">
        <LinkPending />
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-2 text-label text-ink-2">
            <span className="inline-flex items-center gap-1">
              <TeamStamp team={p.game.away} size={20} />
              <TeamStamp team={p.game.home} size={20} />
            </span>
            <span className="truncate">What’s on · {p.game.name}</span>
          </span>
          {p.groupName ? <Chip>{p.groupName}</Chip> : null}
        </div>
        <h3 className="text-serif-l text-ink">{p.game.score ? `${p.game.score}.` : p.game.name}</h3>
        {media.length > 0 ? <MediaFrame items={media} height={180} interactive={false} className="-mx-4" /> : null}
        <ul className="flex flex-col gap-2">
          {p.markets.map((m) => {
            const you = said(m, p.viewerId, p.game);
            const them = said(m, p.themId, p.game);
            const both = [you ? `you said ${you}` : null, them ? `${p.themName.split(/\s+/)[0]} said ${them}` : null].filter(Boolean).join(", ");
            return (
              <li key={m.dare.id} className="flex flex-col gap-0.5">
                <span className="text-body-strong text-ink">{m.dare.title}</span>
                <span className="flex items-center gap-2 text-caption text-ink-3">
                  <StateMark state={m.state === "locked" ? (m.votesCast > 0 ? "voting" : "locked") : m.state === "open" ? "open" : m.state} />
                  <span className="truncate">
                    {outcomeOf(m)}
                    {both ? ` · ${both}` : ""}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-body-sm text-ink-2">
          <When iso={p.at.toISOString()} zone={p.clock.zone} serverNow={p.clock.now} />
        </p>
      </Link>
      {p.game.over || sums.size > 0 ? (
        <div className="mx-4 flex flex-col border-t border-line pt-1 pb-3.5">
          {sums.size === 0 ? (
            <p className="pt-2 text-body-sm text-ink-2">Nothing changes hands between you.</p>
          ) : (
            Array.from(sums.values()).map((s) => (
              <div key={`${s.from.id}-${s.to.id}-${s.denomination.id}`} className="flex items-center justify-between gap-3 py-2">
                <span className="text-body-sm text-ink-2">{gotSentence(s.from, s.to, p.viewerId)}, across the game</span>
                <ObligationToken owner={{ id: s.from.id, displayName: s.from.displayName, hue: hueFor(s.from.id) }} other={s.to} viewerId={p.viewerId} denomination={s.denomination} quantity={s.quantity} />
              </div>
            ))
          )}
          {mine.map((c) => (
            // Each obligation the viewer is owed keeps its own settle row, named by its question (6.3): settling closes that one, never the sum.
            <CloseObligation key={c.id} obligationId={c.id as string} sentence={gotSentence(c.from, c.to, p.viewerId)} what={c.question} domain={p.close.domain} photosOn={p.close.photosOn}>
              <div className="flex items-center justify-between gap-3 py-2">
                <span className="text-caption text-ink-3">{c.question}</span>
                <ObligationToken owner={{ id: c.from.id, displayName: c.from.displayName, hue: hueFor(c.from.id) }} other={c.to} viewerId={p.viewerId} denomination={c.denomination} quantity={c.quantity} />
              </div>
            </CloseObligation>
          ))}
          <Link prefetch={false} href={`/on/${p.game.id}?g=${p.game.groupId}`} className="relative pt-1 link-tertiary">
            <LinkPending />
            See the whole night
          </Link>
        </div>
      ) : null}
    </article>
  );
}
