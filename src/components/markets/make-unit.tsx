"use client";

import { useId, useState, useTransition } from "react";
import { Chip, chipPress } from "@/components/ledger/chip";
import { FIELD_PROBLEM_CLASS, Problem } from "@/components/ledger/problem";
import { Button } from "@/components/ui/button";
import { addOwnUnitAction } from "@/lib/actions/account";
import { attempt } from "@/lib/ui/attempt";
import { OWN_UNIT_MAX } from "@/lib/ledger/settings";

/**
 * A stake unit made where the stakes are picked (the final round, section 6): "pizzas", "push-ups". It takes the place
 * of "a next time" in the row, and it is saved to the asker's own units on You by the same rule as there
 * (`ownUnitOf`), so it is offered again next time; once made it is picked. A unit of one's own goes on the chain as
 * "beers" does: the chain holds a unit's id, its set and whether it counts, never its words.
 */
export function MakeUnit({ onMade }: { onMade: (label: string) => void }) {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const add = () =>
    start(async () => {
      setProblem(null);
      const r = await attempt(() => addOwnUnitAction(value));
      if ("error" in r) return setProblem(r.error);
      const made = r.units[r.units.length - 1];
      if (!made) return;
      setValue("");
      setOpen(false);
      onMade(made);
    });
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} {...chipPress(false)} data-make-unit="">
        <Chip size={36} choice>
          One of your own
        </Chip>
      </button>
    );
  return (
    <div className="flex basis-full flex-col gap-2" data-make-unit="open">
      <label htmlFor={fieldId} className="text-label text-ink-3">
        One of your own
      </label>
      <div className="flex gap-2">
        <input
          id={fieldId}
          value={value}
          onChange={(e) => (setValue(e.target.value), setProblem(null))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          maxLength={OWN_UNIT_MAX}
          autoFocus
          autoComplete="off"
          autoCapitalize="none"
          enterKeyHint="done"
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${fieldId}-problem` : undefined}
          className={`h-12 min-w-0 flex-1 rounded-button border border-line bg-ground px-4 text-body text-ink${problem ? ` ${FIELD_PROBLEM_CLASS}` : ""}`}
        />
        <Button variant="secondary" onClick={add} loading={busy} disabled={value.trim().length === 0}>
          Add
        </Button>
      </div>
      <Problem id={`${fieldId}-problem`} message={problem} />
    </div>
  );
}
