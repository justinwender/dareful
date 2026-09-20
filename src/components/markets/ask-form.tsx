"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ledger/avatar";
import { Chip } from "@/components/ledger/chip";
import { FIELD_PROBLEM_CLASS, Problem, ProblemSummary } from "@/components/ledger/problem";
import { Button } from "@/components/ui/button";
import { dismissNamePromptAction, nameGroupAction } from "@/lib/actions/join";
import { draftMarketAction, scopeMarketAction, type ScopeResult } from "@/lib/actions/markets";
import type { Hue } from "@/lib/ui/hue";
import { cn } from "@/lib/utils";

type SetOption = { groupId: string; label: string; caption: string; avatars: Array<{ name: string; hue: Hue }>; offerName: boolean; size: number; units: Array<{ id: string; label: string; template: string | null }> };
type Person = { id: string; name: string; hue: Hue };
type Who = { kind: "set"; groupId: string } | { kind: "people"; userIds: string[] } | { kind: "link" };
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
const COUNT = ["", "", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/**
 * Asking, in three steps: the question, who's in, the terms (PLANNING.md 8a; docs/design.md 3.20 and section 6).
 * The terms are written up while the person is choosing who's in, so the wait for the write-up is spent on the
 * one decision that needs them anyway. If the write-up is slow or unavailable the line is used as typed, and the
 * screen says so. The last set of people is preselected: the common case is the same people as last time, and
 * it should cost one tap in total.
 */
export function AskForm({ sets, people, initialLine = "" }: { sets: SetOption[]; people: Person[]; initialLine?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"question" | "who" | "terms">("question");
  const [line, setLine] = useState(initialLine.slice(0, 280));
  const [who, setWho] = useState<Who>(sets[0] ? { kind: "set", groupId: sets[0].groupId } : { kind: "link" });
  const [picking, setPicking] = useState(sets.length === 0 && people.length > 0);
  const [named, setNamed] = useState<Record<string, string>>({});
  const [waved, setWaved] = useState<Record<string, boolean>>({});
  const [newName, setNewName] = useState("");
  const [scope, setScope] = useState<ScopeResult | null>(null);
  const scoping = useRef<Promise<void> | null>(null);
  const [title, setTitle] = useState("");
  const [terms, setTerms] = useState("");
  const [hours, setHours] = useState(30);
  const [unit, setUnit] = useState<Unit>({ kind: "usd" });
  const [blind, setBlind] = useState(false);
  const [fieldProblem, setFieldProblem] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [waiting, startWait] = useTransition();
  const [saving, startSave] = useTransition();
  const [namingBusy, startNaming] = useTransition();
  const selectedSet = who.kind === "set" ? sets.find((s) => s.groupId === who.groupId) : undefined;

  function writeUp(criterion?: string) {
    scoping.current = (async () => {
      const r = await scopeMarketAction(line, criterion);
      if ("error" in r) return setProblem(r.error);
      setScope(r);
      setTitle(r.title);
      setTerms(r.terms);
      setHours(WHEN.reduce((best, w) => (Math.abs(w.hours - r.resolvesInHours) < Math.abs(best - r.resolvesInHours) ? w.hours : best), WHEN[0]?.hours ?? 30));
    })();
  }

  function toWho() {
    setFieldProblem(null);
    if (line.trim().length < 3) return setFieldProblem("Ask it in a line, like “John falls asleep during the movie.”");
    setScope(null);
    writeUp();
    setStep("who");
  }

  function toTerms() {
    setProblem(null);
    if (who.kind === "people" && who.userIds.length === 0) return setProblem("Pick someone, or just send the link around.");
    startWait(async () => {
      await scoping.current;
      setUnit({ kind: "usd" });
      setStep("terms");
    });
  }

  function save() {
    setProblem(null);
    if (!scope) return;
    if (title.trim().length < 3) return setProblem("The question needs a few words.");
    if (terms.trim().length < 3) return setProblem("Say how you’ll know, in a sentence.");
    startSave(async () => {
      const r = await draftMarketAction({ who, unit, title, terms, resolvesBy: new Date(Date.now() + hours * 3_600_000).toISOString(), anchorPercent: scope.anchorPercent, anchorRationale: scope.anchorRationale, blind });
      if ("error" in r) return setProblem(r.error);
      router.push(`/m/${r.id}`);
    });
  }

  if (step === "question") {
    return (
      <form
        className="flex flex-col gap-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          toWho();
        }}
      >
        <div className="flex flex-col gap-3">
          <label htmlFor="ask-line" className="text-question text-ink">
            What are you wondering?
          </label>
          <textarea id="ask-line" rows={2} value={line} onChange={(e) => setLine(e.target.value)} maxLength={280} placeholder="John falls asleep during the movie" aria-invalid={fieldProblem ? true : undefined} aria-describedby={fieldProblem ? "ask-line-problem" : undefined} className={cn("rounded-tile border border-line bg-surface px-3 py-3 text-body text-ink placeholder:text-ink-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-marigold", fieldProblem && FIELD_PROBLEM_CLASS)} />
          <Problem id="ask-line-problem" message={fieldProblem} />
        </div>
        <ProblemSummary messages={[fieldProblem]} />
        <Button type="submit" variant="primary">
          Who’s in?
        </Button>
      </form>
    );
  }

  const question = (
    <div className="flex items-start justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-caption text-ink-3">Your question</span>
        <span className="font-serif text-[17px] leading-[22px] text-ink">{step === "terms" && title ? title : line}</span>
      </div>
      <Button variant="tertiary" onClick={() => setStep("question")}>
        Edit
      </Button>
    </div>
  );

  if (step === "who") {
    const circle = (on: boolean) => (
      <span aria-hidden="true" className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-pill", on ? "bg-ink text-ground" : "border-[1.5px] border-line-strong")}>
        {on ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5 9-10" />
          </svg>
        ) : null}
      </span>
    );
    return (
      <div className="flex flex-col gap-6">
        {question}
        <div className="flex flex-col gap-2">
          <h1 className="text-question text-ink">Who’s in?</h1>
          <p className="text-body-sm text-ink-2">Everyone you pick hears about it. Anyone with the link can look.</p>
        </div>
        <div role="group" aria-label="Who's in" className="flex flex-col gap-2">
          {sets.map((s) => {
            const on = who.kind === "set" && who.groupId === s.groupId;
            const label = named[s.groupId] ?? s.label;
            return (
              <div key={s.groupId} className="flex flex-col gap-2">
                <button type="button" aria-pressed={on} onClick={() => (setWho({ kind: "set", groupId: s.groupId }), setPicking(false))} className={cn("grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-card border border-line px-[14px] py-3 text-left", on && "bg-surface shadow-[inset_0_0_0_1px_rgba(185,165,243,0.5)]")}>
                  <span className="flex">
                    {s.avatars.slice(0, 3).map((a, i) => (
                      <span key={i} style={{ marginLeft: i === 0 ? 0 : -10 }}>
                        <Avatar name={a.name} hue={a.hue} size={32} ring={on ? "var(--surface)" : "var(--ground)"} />
                      </span>
                    ))}
                    {s.avatars.length > 3 ? <span className="-ml-[10px] flex h-8 w-8 items-center justify-center rounded-pill bg-surface-2 text-[13px] font-semibold text-ink-2">+{s.avatars.length - 3}</span> : null}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-body-strong text-ink">{label}</span>
                    <span className="truncate text-[13px] leading-[18px] text-ink-3">{s.caption}</span>
                  </span>
                  {circle(on)}
                </button>
                {/* Offered once a set is asking its second question, under its row, and it never blocks (3.20). */}
                {on && s.offerName && !named[s.groupId] && !waved[s.groupId] ? (
                  <form
                    className="flex flex-col gap-3 rounded-card border border-dashed border-line-strong bg-surface px-4 py-3"
                    noValidate
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = newName.trim();
                      if (name.length < 2) return;
                      startNaming(async () => {
                        const r = await nameGroupAction(s.groupId, name);
                        if ("ok" in r) setNamed((n) => ({ ...n, [s.groupId]: name }));
                      });
                    }}
                  >
                    <label htmlFor={`name-${s.groupId}`} className="text-body-sm text-ink-2">
                      Second time with these {COUNT[s.size] ?? "few"}. Want to call them something?
                    </label>
                    <div className="flex gap-2">
                      <input id={`name-${s.groupId}`} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} placeholder="Friday crew" className="h-12 min-w-0 flex-1 rounded-[14px] border border-line bg-ground px-4 text-[17px] text-ink placeholder:text-ink-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-marigold" />
                      <Button type="submit" variant="secondary" loading={namingBusy}>
                        Save
                      </Button>
                    </div>
                    <Button
                      variant="tertiary"
                      className="self-start"
                      onClick={() => {
                        setWaved((w) => ({ ...w, [s.groupId]: true }));
                        void dismissNamePromptAction(s.groupId);
                      }}
                    >
                      Not now
                    </Button>
                  </form>
                ) : null}
              </div>
            );
          })}

          {people.length > 0 ? (
            <div className="flex flex-col gap-2">
              <button type="button" aria-expanded={picking} onClick={() => (setPicking(true), setWho({ kind: "people", userIds: who.kind === "people" ? who.userIds : [] }))} className={cn("grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-card border border-dashed border-line-strong px-[14px] py-3 text-left", who.kind === "people" && "bg-surface")}>
                <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-pill border border-dashed border-line-strong text-ink-2">
                  +
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-body-strong text-ink">Someone else</span>
                  <span className="text-[13px] leading-[18px] text-ink-3">Pick people, or just send the link around</span>
                </span>
                {circle(who.kind === "people")}
              </button>
              {picking && who.kind === "people" ? (
                <ul className="flex flex-col rounded-card border border-line">
                  {people.map((p, i) => {
                    const on = who.userIds.includes(p.id);
                    return (
                      <li key={p.id} className={i > 0 ? "border-t border-line" : undefined}>
                        <button type="button" aria-pressed={on} onClick={() => setWho({ kind: "people", userIds: on ? who.userIds.filter((x) => x !== p.id) : [...who.userIds, p.id].slice(0, 11) })} className="flex min-h-12 w-full items-center gap-3 px-[14px] text-left">
                          <Avatar name={p.name} hue={p.hue} size={28} />
                          <span className="min-w-0 flex-1 truncate text-body-sm text-ink">{p.name}</span>
                          {circle(on)}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          ) : null}

          <button type="button" aria-pressed={who.kind === "link"} onClick={() => (setWho({ kind: "link" }), setPicking(false))} className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-card border border-dashed border-line-strong px-[14px] py-3 text-left", who.kind === "link" && "bg-surface")}>
            <span className="flex min-w-0 flex-col">
              <span className="text-body-strong text-ink">Whoever I send it to</span>
              <span className="text-[13px] leading-[18px] text-ink-3">You get a link and a code. Whoever joins is in.</span>
            </span>
            {circle(who.kind === "link")}
          </button>
        </div>
        <ProblemSummary messages={[problem]} />
        <div className="flex flex-col gap-2">
          <Button variant="primary" onClick={toTerms} loading={waiting}>
            Set the terms
          </Button>
          <p className="text-caption text-ink-3">{waiting ? "Writing up how you’ll know. A few seconds." : "You can add anyone else right up until it closes."}</p>
        </div>
      </div>
    );
  }

  if (!scope) return <ProblemSummary messages={[problem ?? "The write-up didn’t come through. Go back and try once more."]} />;
  if (scope.ambiguous && scope.criteria.length > 0) {
    return (
      <div className="flex flex-col gap-6">
        {question}
        <div className="flex flex-col gap-3 rounded-card border border-dashed border-line-strong p-4">
          <p className="text-body-strong text-ink">That could be decided a few ways. Pick one, so nobody argues about it later.</p>
          {scope.criteria.map((c) => (
            <Button
              key={c}
              variant="secondary"
              disabled={waiting}
              onClick={() => {
                writeUp(c);
                startWait(async () => {
                  await scoping.current;
                });
              }}
            >
              {c}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  const units = selectedSet?.units ?? [];
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
        <h2 className="text-label text-ink-3">What’s riding on it</h2>
        <div className="flex flex-wrap gap-2">
          {unitChip({ kind: "usd" }, "Dollars", "usd")}
          {units.map((u) => unitChip({ kind: "existing", id: u.id }, u.template === "next_time" ? "a next time" : u.template ? `${u.label}s` : `“${u.label}”`, u.id))}
          {PRESETS.filter((p) => !units.some((u) => u.template === p.template)).map((p) => unitChip({ kind: "new", template: p.template, label: p.template }, p.label, p.template))}
        </div>
        <p className="text-caption text-ink-3">One kind of thing for everyone, fixed now. Dollars and beers can’t be weighed against each other.</p>
      </div>
      <div className="flex flex-col gap-3">
        <h2 className="text-label text-ink-3">Where everyone landed</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={!blind} onClick={() => setBlind(false)} className="rounded-pill">
            <Chip size={36} selected={!blind}>
              Shows once you’ve picked
            </Chip>
          </button>
          <button type="button" aria-pressed={blind} onClick={() => setBlind(true)} className="rounded-pill">
            <Chip size={36} selected={blind}>
              Hidden until it’s locked
            </Chip>
          </button>
        </div>
      </div>
      <ProblemSummary messages={[problem]} />
      <Button variant="primary" onClick={save} loading={saving}>
        Looks right
      </Button>
      <Button variant="tertiary" onClick={() => setStep("who")} disabled={saving}>
        Back to who’s in
      </Button>
    </div>
  );
}
