import { Avatar } from "@/components/ledger/avatar";
import { ObligationToken } from "@/components/ledger/obligation-token";
import type { DenominationRow } from "@/lib/ledger/denominations";
import { gotSentence, possessive } from "@/lib/ui/copy";
import { hueBar, hueFor, hueRing, hueVar } from "@/lib/ui/hue";
import { saidLean } from "@/lib/ui/team";

export type Standing = { userId: string; name: string; percent: number; score: number; /** In it without an account (3.1): the stone avatar with its dashed ring. */ ghost?: boolean };
export type Transfer = { fromId: string; toId: string; quantity: bigint };

/**
 * The resolution screen's centre (PLANNING.md 8c, docs/design.md 3.7): never "Justin won" or "Justin lost".
 * Everyone's number against what actually happened, ranked by how close they were, and the transfers beneath.
 * Ranking is by score, which for a yes-or-no question is the same as ranking by distance; people the same
 * distance off share a rank, marked "=", in alphabetical order.
 */
export type NumberStanding = { userId: string; name: string; value: string; xPermille: number; score: number; ghost?: boolean };

/**
 * A number market's rows (3.7): "said 17" under the name and "off by 3" on the right; the gap bar runs on the
 * ruler's scale from their number to a 3px cream tick at the answer, and there is no 50% tick.
 */
export function NumberLeaderboard({ standings, answer, viewerId, said }: { standings: NumberStanding[]; answer: { value: string; xPermille: number }; viewerId: string; /** The words for a number: on a margin "Bills by 9" (3.40), else the number itself. */ said?: (value: string) => string }) {
  const sorted = [...standings].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const dense = sorted.length >= 9;
  const truth = answer.xPermille / 10;
  return (
    <ol className="flex flex-col gap-1.5">
      {sorted.map((s) => {
        const rank = 1 + sorted.filter((o) => o.score > s.score).length;
        const tied = sorted.filter((o) => o.score === s.score).length > 1;
        const off = BigInt(s.value) > BigInt(answer.value) ? BigInt(s.value) - BigInt(answer.value) : BigInt(answer.value) - BigInt(s.value);
        const hue = hueFor(s.userId);
        const mine = s.xPermille / 10;
        const lo = Math.min(mine, truth);
        const hi = Math.max(mine, truth);
        const you = s.userId === viewerId;
        return (
          <li key={s.userId} className={`grid grid-cols-[22px_minmax(0,1fr)] gap-x-3 rounded-button px-3 ${dense ? "py-2" : "py-2.5"} ${you ? "bg-surface" : ""}`} style={you ? { boxShadow: hueRing(hue) } : undefined}>
            <span className="row-span-2 self-center text-body-strong tabular-nums text-ink-3">
              {tied ? "=" : ""}
              {rank}
            </span>
            <div className="flex items-center gap-3">
              <Avatar name={s.name} hue={hue} size={36} ghost={s.ghost} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-strong text-ink">{you ? "You" : s.name}</p>
                <p className="text-caption text-ink-3">said {said ? said(s.value) : s.value}</p>
              </div>
              <span className="text-numeral-sm text-ink-2">{off === 0n ? "dead on" : `off by ${off.toLocaleString("en-US")}`}</span>
            </div>
            <div className="relative mt-2 h-1 rounded-pill bg-field" aria-hidden="true">
              <span className="absolute inset-y-0 rounded-pill" style={{ left: `${lo}%`, width: `${hi - lo}%`, background: hueBar(hue) }} />
              <span className="absolute top-1/2 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-pill bg-chalk" style={{ left: `${truth}%` }} />
              <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-pill" style={{ left: `${mine}%`, background: hueVar(hue) }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The one annotated row (3.7): a result that reads wrong at a glance, someone on the wrong side of even who still
 * ranks above others, gets one 13px line under their bar naming who they beat. At most one per screen. Pure.
 */
export function annotation(sorted: Array<{ userId: string; name: string; percent: number }>, outcome: 0 | 1, viewerId: string): { userId: string; line: string } | null {
  const wrongSide = (p: number) => (outcome === 1 ? p < 50 : p > 50);
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i] as { userId: string; name: string; percent: number };
    if (!wrongSide(s.percent)) continue;
    const below = sorted.slice(i + 1).map((o) => (o.userId === viewerId ? "you" : (o.name.split(/\s+/)[0] ?? o.name)));
    if (below.length === 0) return null;
    const names = below.length === 1 ? below[0] : `${below.slice(0, -1).join(", ")} and ${below[below.length - 1]}`;
    return { userId: s.userId, line: `Only ${s.percent}%, and still closer than ${names}.` };
  }
  return null;
}

export function Leaderboard({ standings, outcome, viewerId, ends }: { standings: Standing[]; outcome: 0 | 1; viewerId: string; /** Between two teams (3.40): "said Bills 70%", and a lean the other way reads "said Chiefs 55%". */ ends?: { away: string; home: string } | null }) {
  const truth = outcome * 100;
  const sorted = [...standings].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const dense = sorted.length >= 9;
  const note = ends ? null : annotation(sorted, outcome, viewerId);
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
              <Avatar name={s.name} hue={hue} size={36} ghost={s.ghost} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-strong text-ink">{you ? "You" : s.name}</p>
                <p className="text-caption text-ink-3">{ends ? saidLean(s.percent, ends.away, ends.home) : `said ${s.percent}%`}</p>
              </div>
              <span className="text-numeral-sm text-ink-2">{off === 0 ? "dead on" : `off by ${off}`}</span>
            </div>
            <div className="relative mt-2 h-1 rounded-pill bg-field" aria-hidden="true">
              <span className="absolute inset-y-0 rounded-pill" style={{ left: `${lo}%`, width: `${hi - lo}%`, background: hueBar(hue) }} />
              <span className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-line-strong" style={{ left: "50%" }} />
              <span className="absolute top-1/2 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-pill bg-chalk" style={{ left: `${truth}%` }} />
              <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-pill" style={{ left: `${s.percent}%`, background: hueVar(hue) }} />
            </div>
            {note && note.userId === s.userId ? (
              <p className="col-start-2 pt-1 text-caption text-ink-2" data-annotated="">
                {note.line}
              </p>
            ) : null}
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

/**
 * "Who's got who" (docs/design.md 3.37, item 7): grouped by owner, the person who picks up next. The owner's
 * 28px avatar and "John's got" in `body` 600, then the people they have got as tokens under it, in the owner's
 * hue as everywhere else. Then one caption naming the pairs between whom nothing changed hands ("Called it even:
 * you and Priya, John and Gabe."). A market that moved nothing says so in one line.
 */
/** At most three rows under one person; the rest are named in one caption (3.38). Pure, so the fold has a test. */
export const WHO_HAS_WHO_ROWS = 3;
export function foldOwed<T>(rows: T[]): { shown: T[]; rest: T[] } {
  return rows.length <= WHO_HAS_WHO_ROWS ? { shown: rows, rest: [] } : { shown: rows.slice(0, WHO_HAS_WHO_ROWS), rest: rows.slice(WHO_HAS_WHO_ROWS) };
}

/** "Theo’s got Gabe and John too.", "You’ve got Gabe, John and Sam too." */
export function gotTooLine(ownerFirst: string | "you", names: string[]): string {
  const list = names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${ownerFirst === "you" ? "You’ve" : `${possessive(ownerFirst)}`} got ${list} too.`;
}

export function WhoHasWho({ transfers, people, participants, denomination, viewerId }: { transfers: Transfer[]; people: Map<string, { id: string; displayName: string }>; participants: string[]; denomination: DenominationRow; viewerId: string }) {
  if (transfers.length === 0) return <p className="text-body-sm text-ink-2">Nothing changes hands. Everyone was about as close as everyone else.</p>;
  const first = (id: string) => (id === viewerId ? "you" : (people.get(id)?.displayName ?? "Someone").split(/\s+/)[0] ?? "Someone");
  const owners = Array.from(new Set(transfers.map((t) => t.fromId))).sort((a, b) => (a === viewerId ? -1 : b === viewerId ? 1 : first(a).localeCompare(first(b))));
  const even: string[] = [];
  for (let i = 0; i < participants.length; i++)
    for (let j = i + 1; j < participants.length; j++) {
      const a = participants[i] as string;
      const b = participants[j] as string;
      if (!transfers.some((t) => (t.fromId === a && t.toId === b) || (t.fromId === b && t.toId === a))) even.push(a === viewerId || b === viewerId ? `you and ${first(a === viewerId ? b : a)}` : `${first(a)} and ${first(b)}`);
    }
  return (
    <div className="flex flex-col gap-4">
      {owners.map((ownerId) => {
        const owner = people.get(ownerId);
        if (!owner) return null;
        return (
          <div key={ownerId} className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-body-strong text-ink">
              <Avatar name={owner.displayName} hue={hueFor(ownerId)} size={28} />
              {ownerId === viewerId ? "You’ve got" : `${possessive(owner.displayName.split(/\s+/)[0] ?? owner.displayName)} got`}
            </p>
            <ul className="flex flex-wrap gap-2 pl-9">
              {foldOwed(transfers.filter((t) => t.fromId === ownerId)).shown.map((t) => {
                const to = people.get(t.toId);
                return to ? (
                  <li key={t.toId}>
                    <ObligationToken owner={{ id: owner.id, displayName: owner.displayName, hue: hueFor(owner.id) }} other={to} viewerId={viewerId} denomination={denomination} quantity={t.quantity} />
                  </li>
                ) : null;
              })}
            </ul>
            {foldOwed(transfers.filter((t) => t.fromId === ownerId)).rest.length > 0 ? (
              <p className="pl-9 text-caption text-ink-3" data-got-too="">
                {gotTooLine(ownerId === viewerId ? "you" : (owner.displayName.split(/\s+/)[0] ?? owner.displayName), foldOwed(transfers.filter((t) => t.fromId === ownerId)).rest.map((t) => first(t.toId)))}
              </p>
            ) : null}
          </div>
        );
      })}
      {even.length > 0 ? <p className="text-caption text-ink-3">Called it even: {even.join(", ")}.</p> : null}
    </div>
  );
}
