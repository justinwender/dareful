import Link from "next/link";
import { MarkRefStamp } from "@/components/ledger/mark-stamp";
import { StateMark } from "@/components/ledger/state-mark";
import { TeamPair } from "@/components/ledger/team-stamp";
import { LinkPending } from "@/components/ui/link-pending";
import { CallOff } from "./call-off";
import { ON_WAY, type RunningRow } from "@/lib/ledger/home";
import { hueFor } from "@/lib/ui/hue";
import { serialiseShell } from "@/lib/ui/shell";

/**
 * Running (docs/design.md 4.7): questions in flight that this person has already acted on, so "I entered that,
 * didn't I?" has an answer without a search. Each row is the same shape as a needs-you row without its button
 * (3.15): the market's stamp on its field when it has a mark, the question, and a meta line whose state mark says
 * in, locked or voting and whose words say where it stands. The action lives on the question's own screen.
 */
export function Running({ rows, viewerId }: { rows: RunningRow[]; viewerId: string }) {
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-[10px]">
      <h2 className="text-label text-ink-2">Running</h2>
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        {rows.map((r, i) => {
          const row = (
          <Link prefetch={false} href={r.game ? r.game.href : `/m/${r.id}`} data-game-running={r.game ? "" : undefined} data-press="row" data-shell={!r.game && r.shell ? serialiseShell(r.shell) : undefined} data-shell-id={r.game ? undefined : r.id} className={`press-row relative grid items-center gap-3 px-4 py-[14px] ${r.mark || r.game ? "grid-cols-[40px_minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)]"} ${i > 0 ? "border-t border-line" : ""}`}>
            <LinkPending />
            {r.game ? <TeamPair away={r.game.away} home={r.game.home} size={28} overlap /> : <MarkRefStamp mark={r.mark} size={40} ink={r.ink} />}
            <span className="flex min-w-0 flex-col gap-1">
              {/* A game is a subject, not a question (4.7): body 600 where a question takes the serif. */}
              <span className={r.game ? "text-body-strong text-ink" : "text-serif-m text-ink"}>{r.title}</span>
              <span className="flex items-center gap-2 text-caption text-ink-3">
                {/* While the last tap on it is still going through, the on-its-way mark stands in for the state mark (3.15, 5.2). */}
                <StateMark state={r.onWay ? "onway" : r.state} hue={!r.onWay && r.state === "in" ? hueFor(viewerId) : undefined} />
                <span className="truncate">{r.onWay ? `${ON_WAY} · ${r.caption}` : r.caption}</span>
              </span>
            </span>
          </Link>
          );
          // A market you asked that nobody else is in answers a left swipe with Remove (3.15); a game's row does too, as one, when nobody else is in any of its questions; every other row stays put.
          return r.removable ? (
            <CallOff key={r.id} kind="remove" dareId={r.id} ids={r.game?.ids} game={Boolean(r.game)}>
              {row}
            </CallOff>
          ) : (
            <div key={r.id}>{row}</div>
          );
        })}
      </div>
    </section>
  );
}
