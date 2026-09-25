import { Avatar } from "@/components/ledger/avatar";
import { ObligationToken } from "@/components/ledger/obligation-token";
import type { DenominationRow } from "@/lib/ledger/denominations";
import { gotSentence } from "@/lib/ui/copy";
import { hueBar, hueFor, hueRing, hueVar } from "@/lib/ui/hue";

export type Standing = { userId: string; name: string; percent: number; score: number };
export type Transfer = { fromId: string; toId: string; quantity: bigint };

/**
 * The resolution screen's centre (PLANNING.md 8c, docs/design.md 3.7): never "Justin won" or "Justin lost".
 * Everyone's number against what actually happened, ranked by how close they were, and the transfers beneath.
 * Ranking is by score, which for a yes-or-no question is the same as ranking by distance; people the same
 * distance off share a rank, marked "=", in alphabetical order.
 */
export function Leaderboard({ standings, outcome, viewerId }: { standings: Standing[]; outcome: 0 | 1; viewerId: string }) {
  const truth = outcome * 100;
  const sorted = [...standings].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const dense = sorted.length >= 9;
  return (
    <ol className="flex flex-col gap-1.5">
      {sorted.map((s) => {
        const rank = 1 + sorted.filter((o) => o.score > s.score).length;
        const tied = sorted.filter((o) => o.score === s.score).length > 1;
        const off = Math.abs(truth - s.percent);
        const hue = hueFor(s.userId);
        const lo = Math.min(s.percent, truth);
        const hi = Math.max(s.percent, truth);
        const you = s.userId === viewerId;
        return (
          <li key={s.userId} className={`grid grid-cols-[22px_minmax(0,1fr)] gap-x-3 rounded-button px-3 ${dense ? "py-2" : "py-2.5"} ${you ? "bg-surface" : ""}`} style={you ? { boxShadow: hueRing(hue) } : undefined}>
            {/* 17px 600 tabular (3.7): the one property the fifth design session changed on a built screen. */}
            <span className="row-span-2 self-center text-body-strong tabular-nums text-ink-3">
              {tied ? "=" : ""}
              {rank}
            </span>
            <div className="flex items-center gap-3">
              <Avatar name={s.name} hue={hue} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-strong text-ink">{you ? "You" : s.name}</p>
                <p className="text-caption text-ink-3">said {s.percent}%</p>
              </div>
              <span className="text-numeral-sm text-ink-2">{off === 0 ? "dead on" : `off by ${off}`}</span>
            </div>
            <div className="relative mt-2 h-1 rounded-pill bg-surface-2" aria-hidden="true">
              <span className="absolute inset-y-0 rounded-pill" style={{ left: `${lo}%`, width: `${hi - lo}%`, background: hueBar(hue) }} />
              <span className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-line-strong" style={{ left: "50%" }} />
              <span className="absolute top-1/2 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-pill bg-chalk" style={{ left: `${truth}%` }} />
              <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-pill" style={{ left: `${s.percent}%`, background: hueVar(hue) }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * What changed hands, as obligations read everywhere else: who has got whom, in the owner's hue, never as a
 * column of gains and losses. A market that moved nothing says so.
 */
export function Transfers({ transfers, people, denomination, viewerId }: { transfers: Transfer[]; people: Map<string, { id: string; displayName: string }>; denomination: DenominationRow; viewerId: string }) {
  if (transfers.length === 0) return <p className="text-body-sm text-ink-2">Nothing changes hands. Everyone was about as close as everyone else.</p>;
  // The viewer's own first, then the rest, largest first.
  const mine = (t: Transfer) => (t.fromId === viewerId || t.toId === viewerId ? 0 : 1);
  const sorted = [...transfers].sort((a, b) => mine(a) - mine(b) || (b.quantity > a.quantity ? 1 : b.quantity < a.quantity ? -1 : 0));
  return (
    <ul className="flex flex-col">
      {sorted.map((t) => {
        const from = people.get(t.fromId);
        const to = people.get(t.toId);
        if (!from || !to) return null;
        return (
          <li key={`${t.fromId}-${t.toId}`} className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
            <span className="text-body-sm text-ink-2">{gotSentence(from, to, viewerId)}</span>
            <ObligationToken owner={{ id: from.id, displayName: from.displayName, hue: hueFor(from.id) }} other={to} viewerId={viewerId} denomination={denomination} quantity={t.quantity} />
          </li>
        );
      })}
    </ul>
  );
}
