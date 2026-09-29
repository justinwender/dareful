"use client";

import { Chip } from "@/components/ledger/chip";
import { Button } from "@/components/ui/button";

export const STAKES_MONEY = [500, 1000, 2000];
export const STAKES_COUNT = [1, 2, 3];

/** The stake step's one fact (docs/design.md 4.9; Round C part 2): the thing that changes whether someone stakes, said where they stake and nowhere else. */
export const STAKE_FACT = "The most you can be out is what you put on it.";

/**
 * The stake chips (3.3, three across, 44px) under the picture in the raised entry sheet, "Something else" opening
 * a field for another amount, and the one fact under them. A unit nobody can count has no chips: one of it, the
 * same for everyone, and the fact still holds.
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
      <div role="group" aria-label="What's riding on it" className="grid grid-cols-3 gap-2">
        {(unit.monetary ? STAKES_MONEY : STAKES_COUNT).map((o) => (
          <button key={o} type="button" aria-pressed={!other && stake === String(o)} onClick={() => (onStake(String(o)), onOther(false))} className="rounded-pill">
            <Chip size={44} selected={!other && stake === String(o)} className="w-full">
              {stakeWords(String(o))}
            </Chip>
          </button>
        ))}
      </div>
      {other ? (
        <input inputMode={unit.monetary ? "decimal" : "numeric"} value={custom} onChange={(e) => onCustom(e.target.value)} aria-label="Another amount" className="h-11 w-full rounded-button border border-line bg-ground px-4 text-body text-ink" />
      ) : (
        <Button variant="tertiary" className="self-start" onClick={() => onOther(true)}>
          Something else
        </Button>
      )}
      <p className="text-caption text-ink-3" data-stake-fact="">
        {STAKE_FACT}
      </p>
    </>
  );
}
