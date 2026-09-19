"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ledger/chip";
import { Problem } from "@/components/ledger/problem";
import { draftMarketAction, scopeMarketAction, type ScopeResult } from "@/lib/actions/markets";

type Group = { id: string; name: string; size: number; units: Array<{ id: string; label: string; template: string | null; quantifiable: boolean }> };
type Unit = { kind: "usd" } | { kind: "existing"; id: string } | { kind: "new"; template: "beer" | "round" | "coffee" | "next_time"; label: string };
const PRESETS = [
  { template: "beer", label: "beers" },
  { template: "round", label: "rounds" },
  { template: "next_time", label: "a next time" },
] as const;
const WHEN = [
  { label: "Tonight", hours: 8 },
  { label: "Tomorrow", hours: 30 },
  { label: "This week", hours: 24 * 7 },
  { label: "This month", hours: 24 * 30 },
];

/**
 * Quick mode (PLANNING.md 8a): one line, one tap. The terms are written up while the person waits a few seconds
 * and they approve the text; the write-up interrupts only when what would count is genuinely unclear, and then
 * with a single pick. If the write-up is slow or unavailable the line is used as typed, and the screen says so.
 */
export function AskForm({ groups, initialGroup }: { groups: Group[]; initialGroup?: string }) {
  const router = useRouter();
  const [groupId, setGroupId] = useState(groups.find((g) => g.id === initialGroup)?.id ?? groups[0]?.id ?? "");
  const [line, setLine] = useState("");
  const [scope, setScope] = useState<ScopeResult | null>(null);
  const [title, setTitle] = useState("");
  const [terms, setTerms] = useState("");
  const [hours, setHours] = useState(30);
  const [unit, setUnit] = useState<Unit>({ kind: "usd" });
  const [problem, setProblem] = useState<string | null>(null);
  const [scoping, startScope] = useTransition();
  const [saving, startSave] = useTransition();
  const group = groups.find((g) => g.id === groupId);

  function writeUp(criterion?: string) {
    setProblem(null);
    if (line.trim().length < 3) return setProblem("Ask it in a line, like “John falls asleep during the movie.”");
    startScope(async () => {
      const r = await scopeMarketAction(line, criterion);
      if ("error" in r) return setProblem(r.error);
      setScope(r);
      setTitle(r.title);
      setTerms(r.terms);
      setHours(WHEN.reduce((best, w) => (Math.abs(w.hours - r.resolvesInHours) < Math.abs(best - r.resolvesInHours) ? w.hours : best), WHEN[0]?.hours ?? 30));
    });
  }

  function save() {
    setProblem(null);
    if (!scope) return;
    if (title.trim().length < 3) return setProblem("The question needs a few words.");
    if (terms.trim().length < 3) return setProblem("Say how you’ll know, in a sentence.");
    startSave(async () => {
      const r = await draftMarketAction({
        groupId,
        unit,
        title,
        terms,
        resolvesBy: new Date(Date.now() + hours * 3_600_000).toISOString(),
        anchorPercent: scope.anchorPercent,
        anchorRationale: scope.anchorRationale,
      });
      if ("error" in r) return setProblem(r.error);
      router.push(`/m/${r.id}`);
    });
  }

  if (!scope || (scope.ambiguous && scope.criteria.length > 0)) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <label htmlFor="ask-line" className="text-question text-ink">
            What are you wondering?
          </label>
          <textarea id="ask-line" rows={2} value={line} onChange={(e) => setLine(e.target.value)} maxLength={280} placeholder="John falls asleep during the movie" className="rounded-tile border border-line bg-surface px-3 py-3 text-body text-ink placeholder:text-ink-3" />
        </div>
        {groups.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => (
              <button key={g.id} type="button" onClick={() => setGroupId(g.id)} className="rounded-pill">
                <Chip size={36} selected={g.id === groupId}>
                  {g.name}
                </Chip>
              </button>
            ))}
          </div>
        ) : null}
        {scope?.ambiguous ? (
          <div className="flex flex-col gap-3 rounded-card border border-dashed border-line-strong p-4">
            <p className="text-body-strong text-ink">That could be decided a few ways. Pick one, so nobody argues about it later.</p>
            {scope.criteria.map((c) => (
              <Button key={c} variant="secondary" onClick={() => writeUp(c)} disabled={scoping}>
                {c}
              </Button>
            ))}
          </div>
        ) : null}
        <Problem message={problem} />
        <Button variant="primary" onClick={() => writeUp()} loading={scoping}>
          Ask {group?.name ?? "the group"}
        </Button>
        {scoping ? <p className="text-caption text-ink-3">Writing up how you’ll know. A few seconds.</p> : null}
      </div>
    );
  }

  const unitChip = (u: Unit, label: string, key: string) => {
    const selected = u.kind === unit.kind && (u.kind === "usd" || (u.kind === "existing" && unit.kind === "existing" && u.id === unit.id) || (u.kind === "new" && unit.kind === "new" && u.template === unit.template));
    return (
      <button key={key} type="button" onClick={() => setUnit(u)} className="rounded-pill">
        <Chip size={36} selected={selected}>
          {label}
        </Chip>
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="ask-title" className="text-label text-ink-3">
          The question
        </label>
        <textarea id="ask-title" rows={2} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} className="rounded-tile border border-line bg-surface px-3 py-3 font-serif text-[22px] leading-7 text-ink" />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="ask-terms" className="text-label text-ink-3">
          How you’ll know
        </label>
        <textarea id="ask-terms" rows={4} value={terms} onChange={(e) => setTerms(e.target.value)} maxLength={800} className="rounded-tile border border-line bg-surface px-3 py-3 text-body-sm text-ink" />
        <p className="text-caption text-ink-3">{scope.plain ? "The write-up didn’t come through, so this is your line as you typed it. Change it however you like." : "Written up from your line. Change anything; everyone sees exactly this before they’re in."}</p>
      </div>
      <div className="flex flex-col gap-3">
        <h2 className="text-label text-ink-3">You’ll know by</h2>
        <div className="flex flex-wrap gap-2">
          {WHEN.map((w) => (
            <button key={w.label} type="button" onClick={() => setHours(w.hours)} className="rounded-pill">
              <Chip size={36} selected={hours === w.hours}>
                {w.label}
              </Chip>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <h2 className="text-label text-ink-3">What it’s for</h2>
        <div className="flex flex-wrap gap-2">
          {unitChip({ kind: "usd" }, "Dollars", "usd")}
          {(group?.units ?? []).map((u) => unitChip({ kind: "existing", id: u.id }, u.template === "next_time" ? "a next time" : u.template ? `${u.label}s` : `“${u.label}”`, u.id))}
          {PRESETS.filter((p) => !(group?.units ?? []).some((u) => u.template === p.template)).map((p) => unitChip({ kind: "new", template: p.template, label: p.template }, p.label, p.template))}
        </div>
      </div>
      <Problem message={problem} />
      <Button variant="primary" onClick={save} loading={saving}>
        Looks right
      </Button>
      <Button variant="tertiary" onClick={() => setScope(null)} disabled={saving}>
        Start over
      </Button>
    </div>
  );
}
