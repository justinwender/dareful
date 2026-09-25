"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProblemSummary } from "@/components/ledger/problem";
import { pickInkAction } from "@/lib/actions/markets";
import { INK_NAMES, INKS, type InkName } from "@/lib/ui/ink";

const NAME: Record<InkName, string> = { clay: "Clay", ochre: "Ochre", olive: "Olive", sea: "Sea", slate: "Slate", iris: "Iris", plum: "Plum", rose: "Rose" };

/**
 * The creator's pick (docs/design.md 1.8, rule 1): eight dots, one tap, honoured as picked. It lives behind More on
 * the market's own screen, never as a step in creating it, and only the person who asked sees it.
 */
export function InkPicker({ dareId, current }: { dareId: string; current: InkName }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-label text-ink-3">Its colour</p>
      <div role="radiogroup" aria-label="Its colour" className="flex flex-wrap gap-2">
        {INK_NAMES.map((name) => {
          const on = name === current;
          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={NAME[name]}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setProblem(null);
                  const r = await pickInkAction(dareId, name);
                  if ("error" in r) return setProblem(r.error);
                  router.refresh();
                })
              }
              className="flex h-11 w-11 items-center justify-center rounded-pill"
            >
              <span aria-hidden="true" className="block h-7 w-7 rounded-pill" style={{ background: INKS[name].ink, boxShadow: on ? "0 0 0 2px var(--ground), 0 0 0 3.5px var(--ink)" : undefined }} />
            </button>
          );
        })}
      </div>
      <ProblemSummary messages={[problem]} />
    </div>
  );
}
