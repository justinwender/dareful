"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FIELD_PROBLEM_CLASS, Problem, ProblemSummary } from "@/components/ledger/problem";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { arbitrateAction, stateCaseAction } from "@/lib/actions/markets";
import { cn } from "@/lib/utils";

/**
 * When the group cannot agree (PLANNING.md 8d). Everyone who is in may state their case in one line, and anyone
 * who is in may ask the app to hear it. It is the tiebreaker every one of them agreed to before knowing which way
 * it would cut, which is the only reason it is fair, and the screen says so. Asking ends the vote for everyone,
 * so it gets the deliberate moment a vote gets.
 */
export function Arbitration({ dareId, cases, mine, mayAsk }: { dareId: string; cases: Array<{ name: string; said: string }>; mine: string | null; mayAsk: boolean }) {
  const router = useRouter();
  const [text, setText] = useState(mine ?? "");
  const [saved, setSaved] = useState(Boolean(mine));
  const [field, setField] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [saving, startSave] = useTransition();
  const [hearing, startHear] = useTransition();

  return (
    <section className="flex flex-col gap-4 rounded-card border border-line bg-surface px-4 py-[14px]" aria-labelledby="cant-agree">
      <div className="flex flex-col gap-1">
        <h2 id="cant-agree" className="text-body-strong text-ink">
          Can’t agree?
        </h2>
        <p className="text-body-sm text-ink-2">Everyone who’s in agreed going in that the app hears both sides if it comes to that. Say your side in a line first.</p>
      </div>
      {cases.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {cases.map((c) => (
            <li key={c.name} className="text-body-sm text-ink-2">
              <span className="text-body-strong text-ink">{c.name}:</span> {c.said}
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="flex flex-col gap-2"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setField(null);
          if (text.trim().length < 2) return setField("Say your side in a line.");
          startSave(async () => {
            const r = await stateCaseAction(dareId, text);
            if ("error" in r) return setField(r.error);
            setSaved(true);
            router.refresh();
          });
        }}
      >
        <label htmlFor="my-case" className="text-caption text-ink-3">
          Your side
        </label>
        <div className="flex gap-2">
          <input id="my-case" value={text} onChange={(e) => (setText(e.target.value), setSaved(false))} maxLength={280} placeholder="The sign said 8,558 feet" aria-invalid={field ? true : undefined} aria-describedby={field ? "my-case-problem" : undefined} className={cn("h-12 min-w-0 flex-1 rounded-button border border-line bg-ground px-4 text-body-sm text-ink placeholder:text-ink-3", field && FIELD_PROBLEM_CLASS)} />
          <Button type="submit" variant="secondary" loading={saving} disabled={saved}>
            {saved ? "Saved" : "Save"}
          </Button>
        </div>
        <Problem id="my-case-problem" message={field} />
      </form>
      {mayAsk ? (
        <Button variant="secondary" onClick={() => setAsking(true)}>
          Let the app call it
        </Button>
      ) : null}
      <Sheet open={asking} labelledBy="hear-it-title" onClose={() => (hearing ? undefined : setAsking(false))}>
        <div className="flex flex-col gap-2">
          <p className="text-label text-ink-3">You’re asking the app to call it</p>
          <h2 id="hear-it-title" className="text-serif-l text-ink">
            That ends the vote.
          </h2>
        </div>
        <p className="text-body-sm text-ink-2">It reads the terms, what everyone put in, what people said happened, and each side’s case, and writes down how it came out and why. That counts for everyone in it, and it can’t be undone. If the terms turn out not to settle it, it’s called off and nothing changes hands.</p>
        <ProblemSummary messages={[problem]} />
        <div className="flex flex-col gap-1">
          <Button
            variant="primary"
            data-autofocus
            loading={hearing}
            onClick={() =>
              startHear(async () => {
                setProblem(null);
                const r = await arbitrateAction(dareId);
                if ("error" in r) return setProblem(r.error);
                setAsking(false);
                router.refresh();
              })
            }
          >
            Let the app call it
          </Button>
          <Button variant="tertiary" onClick={() => setAsking(false)} disabled={hearing}>
            Not yet
          </Button>
          {hearing ? <p className="text-center text-caption text-ink-3">Reading both sides. About half a minute.</p> : null}
        </div>
      </Sheet>
    </section>
  );
}
