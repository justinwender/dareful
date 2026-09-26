"use client";

import { Avatar } from "@/components/ledger/avatar";
import { hueVar, type Hue } from "@/lib/ui/hue";
import { cn } from "@/lib/utils";
import type { PickOneAnswer } from "./pick-one-bars";

/**
 * The entry control for a pick-one market, in the sheet (docs/design.md 3.30): the answers as 44px rows, radius
 * 10, a 1px line, the 28px slot and the answer, in the asker's order and never sorted by stake. Picking is a
 * tap: the row takes the market's field, a 1.5px inset ring in your hue and a check; tapping another moves the
 * pick. That is the whole entry. The rows are a control, so nothing here counts toward the screen's type budget.
 */
export function PickOneEntry({ answers, value, onChange, hue, disabled = false }: { answers: PickOneAnswer[]; value: number | null; onChange: (index: number) => void; hue: Hue; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Pick one" className="flex flex-col gap-2" data-pick-one-entry="">
      {answers.map((a) => {
        const picked = value === a.index;
        return (
          <button
            key={a.index}
            type="button"
            role="radio"
            aria-checked={picked}
            disabled={disabled}
            onClick={() => onChange(a.index)}
            className={cn("flex h-11 items-center gap-3 rounded-button border border-line px-3 text-left text-[17px] font-semibold leading-[22px] text-ink disabled:text-ink-3", picked && "bg-field")}
            style={picked ? { boxShadow: `inset 0 0 0 1.5px ${hueVar(hue)}` } : undefined}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center">{a.person ? <Avatar name={a.person.name} hue={a.person.hue} size={28} /> : null}</span>
            <span className="min-w-0 flex-1 truncate">{a.text}</span>
            {picked ? (
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <path d="M5 12l5 5 9-10" />
              </svg>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
