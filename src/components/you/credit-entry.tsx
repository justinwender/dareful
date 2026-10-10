"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FIELD_PROBLEM_CLASS, Problem } from "@/components/ledger/problem";
import { enterCreditAction } from "@/lib/actions/stats";
import { attempt } from "@/lib/ui/attempt";

/**
 * The model API's credit, typed by the owner after a top-up (the ops round, section 1): no API says what is left, so the
 * runway counts down from this, less what the app spends after it. On the owner's page and nowhere else.
 */
export function CreditEntry() {
  const router = useRouter();
  const fieldId = useId();
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const save = () =>
    start(async () => {
      setProblem(null);
      setSaid(null);
      const r = await attempt(() => enterCreditAction(value));
      if ("error" in r) return setProblem(r.error);
      setValue("");
      setSaid("Saved. The runway counts down from it.");
      router.refresh();
    });
  return (
    <div className="flex flex-col gap-2" data-credit-entry="">
      <label htmlFor={fieldId} className="text-body-sm text-ink">
        The model API’s credit after a top-up, in dollars
      </label>
      <input
        id={fieldId}
        value={value}
        inputMode="decimal"
        autoComplete="off"
        onChange={(e) => (setValue(e.target.value), setProblem(null))}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? `${fieldId}-problem` : undefined}
        className={`h-12 w-full rounded-button border border-line bg-ground px-4 text-body text-ink${problem ? ` ${FIELD_PROBLEM_CLASS}` : ""}`}
      />
      <Problem id={`${fieldId}-problem`} message={problem} />
      <Button variant="secondary" size="inline" onClick={save} loading={saving} disabled={value.trim() === ""} data-credit-save="">
        Save the credit
      </Button>
      {said ? <p className="text-caption text-ink-3">{said}</p> : null}
    </div>
  );
}
