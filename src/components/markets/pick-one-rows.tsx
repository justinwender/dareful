import { Avatar } from "@/components/ledger/avatar";
import type { Hue } from "@/lib/ui/hue";
import { cn } from "@/lib/utils";
import type { PickOneAnswer } from "./pick-one-bars";

export type Picker = { name: string; hue: Hue; /** In it without an account (3.1): stone, with the dashed ring. */ ghost?: boolean };

/**
 * "Everyone's pick" (docs/design.md 3.25): one 48px row per answer in the asker's order, with its avatar slot, the
 * answer, the avatars of whoever picked it (24px, overlapping by 6px, a ring in the ground behind) and its final
 * share. The answer that happened takes the wash across its row, a 6px cream cap at its left edge and its name
 * in ink, and everyone in that row wears the extra cream ring: that row is who called it, and every other row
 * is who didn't. On a void nothing is washed. The same rows stand in a story card (3.4) and on the memory view
 * (3.37) where the call line would.
 */
export function PickOneRows({ answers, pickers, shares, outcome, showShares = true }: { answers: PickOneAnswer[]; pickers: Picker[][]; shares: number[]; outcome: number | null; showShares?: boolean }) {
  return (
    <ul className="flex flex-col gap-1" data-pick-one-rows="">
      {answers.map((a) => {
        const called = outcome !== null && a.index === outcome;
        const who = pickers[a.index] ?? [];
        return (
          <li key={a.index} className={cn("relative flex h-12 items-center gap-3 overflow-hidden rounded-button px-3", called && "bg-market-wash")}>
            {called ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[6px] bg-chalk" /> : null}
            <span className="flex h-7 w-7 shrink-0 items-center justify-center">{a.person ? <Avatar name={a.person.name} hue={a.person.hue} size={28} /> : null}</span>
            <span className={cn("min-w-0 flex-1 truncate text-body-strong", called ? "text-ink" : "text-ink-2")}>{a.text}</span>
            {who.length > 0 ? (
              <span className="flex shrink-0 items-center" aria-label={`${who.map((p) => p.name).join(", ")} picked ${a.text}`}>
                {who.slice(0, 6).map((p, i) => (
                  <span key={i} className="inline-flex rounded-pill" style={{ marginLeft: i === 0 ? 0 : -6, zIndex: who.length - i, boxShadow: called ? "0 0 0 2px var(--ground), 0 0 0 4px var(--chalk)" : undefined }}>
                    <Avatar name={p.name} hue={p.hue} size={24} ghost={p.ghost} ring={called ? undefined : "var(--ground)"} />
                  </span>
                ))}
              </span>
            ) : null}
            {showShares ? <span className="w-10 shrink-0 text-right text-numeral-sm tabular-nums text-ink-2">{shares[a.index] ?? 0}%</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
