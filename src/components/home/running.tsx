import Link from "next/link";
import { MarkStamp } from "@/components/ledger/mark-stamp";
import { StateMark } from "@/components/ledger/state-mark";
import { LinkPending } from "@/components/ui/link-pending";
import type { RunningRow } from "@/lib/ledger/home";
import { hueFor } from "@/lib/ui/hue";

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
        {rows.map((r, i) => (
          <Link prefetch={false} key={r.id} href={`/m/${r.id}`} className={`relative grid items-center gap-3 px-4 py-[14px] ${r.mark ? "grid-cols-[40px_minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)]"} ${i > 0 ? "border-t border-line" : ""}`}>
            <LinkPending />
            {r.mark ? <MarkStamp kind="emoji" value={r.mark} size={40} ink={r.ink} /> : null}
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-serif-m text-ink">{r.title}</span>
              <span className="flex items-center gap-2 text-caption text-ink-3">
                <StateMark state={r.state} hue={r.state === "in" ? hueFor(viewerId) : undefined} />
                <span className="truncate">{r.caption}</span>
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
