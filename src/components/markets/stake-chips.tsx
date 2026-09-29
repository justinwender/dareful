"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const STAKES_MONEY = [500, 1000, 2000];
export const STAKES_COUNT = [1, 2, 3];

/** The stake step's one fact (docs/design.md 4.9; Round C part 2): the thing that changes whether someone stakes, said where they stake and nowhere else. */
export const STAKE_FACT = "The most you can be out is what you put on it.";

/** The smallest stake is selected when the sheet raises, never the largest (3.3). Pure. */
export function defaultStake(unit: { quantifiable: boolean; monetary: boolean }): string {
  if (!unit.quantifiable) return "1";
  return String(unit.monetary ? STAKES_MONEY[0] : STAKES_COUNT[0]);
}

/**
 * The stake chips (3.3): a different control from the word chips with the same name. Three across, 44px, radius
 * 10, 17px 600 `--ink`, a 1px `--line-strong` border, and the selected one filled `--chalk` with `--on-chalk`
 * text: "$5", "$10", "$20" for dollars, "1 beer", "2 beers", "3 beers" for any other unit. A 44px tertiary
 * "Something else" under them swaps the row for a whole-number field in the same unit. Then the one fact. A unit
 * nobody can count has no chips: one of it, the same for everyone, and the fact still holds. A control, so its
 * sizes are literal here (4.8).
 */
export function StakeChips({ unit, stake, other, custom, stakeWords, onStake, onOther, onCustom }: { unit: { quantifiable: boolean; monetary: boolean; singular: string }; stake: string; other: boolean; custom: string; stakeWords: (units: string) => string; onStake: (stake: string) => void; onOther: (other: boolean) => void; onCustom: (custom: string) => void }) {
  if (!unit.quantifiable) {
    return (
      <p className="text-caption text-ink-3" data-stake-fact="">
        One {unit.singular}, the same for everyone. {STAKE_FACT}
      </p>
    );
  }
  return (
    <>
      {other ? (
        <input inputMode={unit.monetary ? "decimal" : "numeric"} value={custom} onChange={(e) => onCustom(e.target.value)} aria-label={unit.monetary ? "Another amount, in dollars" : `Another number of ${unit.singular}s`} autoFocus className="h-11 w-full rounded-button border border-line bg-ground px-4 text-body text-ink" data-stake-field="" />
      ) : (
        <div role="group" aria-label="What's riding on it" className="grid grid-cols-3 gap-2" data-stake-chips="">
          {(unit.monetary ? STAKES_MONEY : STAKES_COUNT).map((o) => {
            const on = stake === String(o);
            return (
              <button key={o} type="button" aria-pressed={on} onClick={() => (onStake(String(o)), onOther(false))} className={cn("inline-flex h-11 w-full items-center justify-center rounded-button border stake-chip-text press-fill", on ? "border-chalk bg-chalk text-on-chalk" : "border-line-strong bg-transparent text-ink")} data-press="fill">
                {stakeWords(String(o))}
              </button>
            );
          })}
        </div>
      )}
      {other ? null : (
        <Button variant="tertiary" className="self-start" onClick={() => onOther(true)} data-stake-other="">
          Something else
        </Button>
      )}
      <p className="text-caption text-ink-3" data-stake-fact="">
        {STAKE_FACT}
      </p>
    </>
  );
}
