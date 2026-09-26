"use client";

import { Chip } from "@/components/ledger/chip";
import type { Hue } from "@/lib/ui/hue";
import { NumberEntry } from "./number-entry";

/**
 * A signed margin, the home side's score minus the away side's (docs/decisions.md, public markets): which side
 * wins, then by how much, with "Level" for a tie. The value is the signed number; storing it shifted is the
 * caller's. Below the shift is as far as the field goes, since the chain stores nothing under zero. Enough to
 * test the kind until the design draws it: the existing number entry with the team names at the ends.
 */
export function MarginEntry({ value, onChange, unit, hue, home, away, shift, disabled = false, problem = false }: { value: bigint | null; onChange: (v: bigint | null) => void; unit: { singular: string; plural: string }; hue: Hue; home: string; away: string; /** Half the scale: the largest away-side margin the field takes. */ shift: bigint; disabled?: boolean; problem?: boolean }) {
  const side: "home" | "away" | "level" | null = value === null ? null : value > 0n ? "home" : value < 0n ? "away" : "level";
  const magnitude = value === null ? null : value < 0n ? -value : value;
  const set = (nextSide: "home" | "away" | "level", by: bigint | null) => {
    if (nextSide === "level") return onChange(0n);
    if (by === null || by === 0n) return onChange(null);
    const signed = nextSide === "home" ? by : -by;
    // Below the shift is as far as the away side goes here: the chain stores nothing under zero.
    onChange(nextSide === "away" && by > shift ? -shift : signed);
  };
  return (
    <div className="flex flex-col gap-3" data-margin-entry="">
      <div role="group" aria-label="Who wins" className="grid grid-cols-3 gap-2">
        {([
          ["away", `${away} by`],
          ["level", "Level"],
          ["home", `${home} by`],
        ] as const).map(([key, label]) => (
          <button key={key} type="button" aria-pressed={side === key} disabled={disabled} onClick={() => set(key, key === "level" ? null : (magnitude ?? null))} className="rounded-pill">
            <Chip size={44} selected={side === key} className="w-full">
              {label}
            </Chip>
          </button>
        ))}
      </div>
      {side !== "level" ? (
        <NumberEntry header={null} label="By how many" value={magnitude === 0n ? null : magnitude} unit={unit} hue={hue} disabled={disabled || side === null} problem={problem} onChange={(v) => set(side ?? "home", v)} />
      ) : null}
      {side === null ? <p className="text-caption text-ink-3">Pick a side first, or Level for a tie.</p> : null}
    </div>
  );
}
