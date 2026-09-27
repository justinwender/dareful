"use client";

import { useState, useTransition } from "react";
import { Chip } from "@/components/ledger/chip";
import { UnitGlyph } from "@/components/ledger/glyphs";
import { MarkStamp } from "@/components/ledger/mark-stamp";
import { ObligationToken } from "@/components/ledger/obligation-token";
import { ProblemSummary } from "@/components/ledger/problem";
import { Button } from "@/components/ui/button";
import { PinnedSheet } from "@/components/ui/pinned-sheet";
import { proposeCoverAction } from "@/lib/actions/proposals";
import type { Hue } from "@/lib/ui/hue";
import { hueVar } from "@/lib/ui/hue";
import type { GlyphKey } from "@/lib/ui/units";
import { cn } from "@/lib/utils";

type Template = "beer" | "coffee" | "round" | "next_time";
const PRESETS: Array<{ template: Template; label: string; plural: string; quantifiable: boolean }> = [
  { template: "beer", label: "beer", plural: "beers", quantifiable: true },
  { template: "round", label: "round", plural: "rounds", quantifiable: true },
  { template: "coffee", label: "coffee", plural: "coffees", quantifiable: true },
  { template: "next_time", label: "next time", plural: "next times", quantifiable: false },
];

export type CoverUnit = { id: string; label: string; pluralLabel: string; template: string | null; quantifiable: boolean; markKind: string | null; markValue: string | null };
type Choice = { kind: "usd" } | { kind: "existing"; unit: CoverUnit } | { kind: "new"; template: Template | null; label: string; plural: string; quantifiable: boolean };

const glyphFor = (template: string | null): GlyphKey | null => (template === "beer" || template === "coffee" || template === "round" || template === "next_time" ? template : null);

/** "47.20" to 4720n, integer cents only; null when it is not a money amount. */
function toCents(input: string): bigint | null {
  const m = /^\s*\$?\s*(\d{1,7})(?:\.(\d{1,2}))?\s*$/.exec(input);
  if (!m) return null;
  return BigInt(m[1] ?? "0") * 100n + BigInt((m[2] ?? "").padEnd(2, "0"));
}

/**
 * "I got this one" (docs/design.md 3.43): the person view's one move, resting at the bottom as a chalk and
 * raising into the cover itself. Nobody has to be picked; the page already did that. Raised, top to bottom: what
 * (unit chips, most used first, and "$" for an amount), how many (a 48px minus, the count and unit, a 48px plus;
 * with "$", the amount in dollars), who picks up next as two rows that each show what they'll make (the token,
 * selected by default, or "Nobody's paying it back" after a dot in your hue, which is how the rally counts it,
 * 3.11), and one primary that says the whole thing ("I got Gabe a beer"). The creditor authors and the copy never
 * says who owes what (Principle 2). Logged, the sheet lowers back to the chalk and the page re-reads with the new
 * token in 3.2's proposed style until the other person says yep. No toast.
 */
export function CoverSheet({ person, units, recent, viewer }: { person: { id: string; displayName: string; kind: "user" | "claim"; hue: Hue; ghost?: boolean }; /** The units already between the two of you, most used first. */ units: CoverUnit[]; /** Units this person has named elsewhere, without a template, offered after the presets. */ recent: CoverUnit[]; viewer: { id: string; displayName: string; hue: Hue } }) {
  const [raised, setRaised] = useState(false);
  const [choice, setChoice] = useState<Choice>({ kind: "usd" });
  const [count, setCount] = useState(1);
  const [dollars, setDollars] = useState("");
  const [payback, setPayback] = useState(true);
  const [naming, setNaming] = useState(false);
  const [named, setNamed] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const first = person.displayName.trim().split(/\s+/)[0] ?? person.displayName;
  const has = (t: Template) => units.some((u) => u.template === t);
  const quantifiable = choice.kind === "usd" ? false : choice.kind === "existing" ? choice.unit.quantifiable : choice.quantifiable;
  const cents = dollars.trim() ? toCents(dollars) : null;
  /** The unit as the token draws it (3.2), so the row shows exactly what will appear on both pages. */
  const denomination = choice.kind === "usd" ? { label: "dollar", pluralLabel: "dollars", quantifiable: true, monetary: true, template: "usd", markKind: null, markValue: null } : choice.kind === "existing" ? { ...choice.unit, monetary: false } : { label: choice.label, pluralLabel: choice.plural, quantifiable: choice.quantifiable, monetary: false, template: choice.template, markKind: null, markValue: null };
  const quantity = choice.kind === "usd" ? (cents ?? 0n) : quantifiable ? BigInt(count) : 1n;
  /** "a beer", "2 coffees", "$40", "a next time": what the primary says was got. */
  const what = choice.kind === "usd" ? (cents !== null && cents > 0n ? `$${dollars.trim().replace(/^\$/, "")}` : "…") : !quantifiable ? `a ${denomination.label}` : count === 1 ? `${/^[aeiou]/i.test(denomination.label) ? "an" : "a"} ${denomination.label}` : `${count} ${denomination.pluralLabel}`;
  const label = `I got ${first} ${what}`;

  function submit() {
    setProblem(null);
    if (choice.kind === "usd" && (cents === null || cents <= 0n)) return setProblem("Add the amount first, like 40.");
    start(async () => {
      const r = await proposeCoverAction({
        who: person.kind === "claim" ? { kind: "claim", claimId: person.id } : { kind: "user", userId: person.id },
        groupId: null,
        unit: choice.kind === "usd" ? { kind: "usd" } : choice.kind === "existing" ? { kind: "existing", id: choice.unit.id } : { kind: "new", template: choice.template, label: choice.label },
        quantity: choice.kind === "usd" ? null : quantifiable ? String(count) : null,
        amountCents: choice.kind === "usd" && cents !== null ? cents.toString() : null,
        settleExpected: payback,
      });
      if (r && "error" in r) setProblem(r.error);
    });
  }

  const chip = (on: boolean, onClick: () => void, children: React.ReactNode, key: string) => (
    <button key={key} type="button" aria-pressed={on} onClick={onClick} className="rounded-pill">
      <Chip size={36} selected={on}>
        {children}
      </Chip>
    </button>
  );
  const rowClass = (on: boolean) => cn("flex min-h-14 w-full items-center justify-between gap-3 rounded-button border px-3 py-2 text-left", on ? "border-ink bg-surface" : "border-line");

  return (
    <PinnedSheet
      label="I got this one"
      raised={raised}
      onRaise={setRaised}
      header={raised ? <p className="text-body-strong text-ink">I got this one</p> : undefined}
      low={
        raised ? null : (
          <Button variant="primary" onClick={() => setRaised(true)} data-cover-open="">
            I got this one
          </Button>
        )
      }
      high={
        <div className="flex flex-col gap-5" data-cover-sheet="">
          <section className="flex flex-col gap-2">
            <h3 className="text-label text-ink-3">What</h3>
            <div className="flex flex-wrap gap-2">
              {units.map((u) => chip(choice.kind === "existing" && choice.unit.id === u.id, () => setChoice({ kind: "existing", unit: u }), <>{u.markKind === "emoji" && u.markValue ? <MarkStamp kind="emoji" value={u.markValue} size={20} /> : null}{glyphFor(u.template) ? <UnitGlyph unit={glyphFor(u.template) as GlyphKey} size={16} /> : null}{u.template === "next_time" ? "Next time" : u.label.charAt(0).toUpperCase() + u.label.slice(1)}</>, u.id))}
              {PRESETS.filter((p) => !has(p.template)).map((p) => chip(choice.kind === "new" && choice.template === p.template, () => setChoice({ kind: "new", template: p.template, label: p.label, plural: p.plural, quantifiable: p.quantifiable }), <><UnitGlyph unit={p.template} size={16} />{p.template === "next_time" ? "Next time" : p.label.charAt(0).toUpperCase() + p.label.slice(1)}</>, p.template))}
              {recent
                .filter((r) => !r.template && !units.some((u) => u.label.toLowerCase() === r.label.toLowerCase()))
                .slice(0, 3)
                .map((r) => chip(choice.kind === "new" && choice.template === null && choice.label === r.label, () => setChoice({ kind: "new", template: null, label: r.label, plural: r.pluralLabel, quantifiable: r.quantifiable }), `“${r.label}”`, `recent-${r.id}`))}
              {chip(choice.kind === "usd", () => setChoice({ kind: "usd" }), "$", "usd")}
              {naming ? null : chip(false, () => setNaming(true), "Something else", "naming")}
            </div>
            {naming ? (
              <div className="flex gap-2">
                <input value={named} onChange={(e) => setNamed(e.target.value)} maxLength={40} aria-label="Call it" className="h-12 min-w-0 flex-1 rounded-button border border-line bg-ground px-4 text-body text-ink" />
                <Button
                  variant="secondary"
                  disabled={!named.trim()}
                  onClick={() => {
                    const l = named.trim();
                    setChoice({ kind: "new", template: null, label: l, plural: l, quantifiable: true });
                    setNaming(false);
                    setNamed("");
                  }}
                >
                  Add it
                </Button>
              </div>
            ) : null}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-label text-ink-3">{choice.kind === "usd" ? "How much" : "How many"}</h3>
            {choice.kind === "usd" ? (
              <div className="flex items-center gap-2">
                <span data-type-exempt="" className="text-numeral text-ink-2">
                  $
                </span>
                <input inputMode="decimal" value={dollars} onChange={(e) => setDollars(e.target.value)} aria-label="How much" className="h-12 w-40 rounded-button border border-line bg-ground px-3 text-numeral text-ink" />
              </div>
            ) : quantifiable ? (
              <div className="flex items-center gap-3">
                <button type="button" aria-label="One fewer" disabled={count <= 1} onClick={() => setCount((c) => Math.max(1, c - 1))} className="flex h-12 w-12 items-center justify-center rounded-button border border-line-strong text-ink-2 disabled:border-line disabled:text-ink-3">
                  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 10h12" />
                  </svg>
                </button>
                <span className="min-w-0 flex-1 text-center text-body-strong text-ink" data-cover-count={count}>
                  {count} {count === 1 ? denomination.label : denomination.pluralLabel}
                </span>
                <button type="button" aria-label="One more" disabled={count >= 20} onClick={() => setCount((c) => Math.min(20, c + 1))} className="flex h-12 w-12 items-center justify-center rounded-button border border-line-strong text-ink-2 disabled:border-line disabled:text-ink-3">
                  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 10h12M10 4v12" />
                  </svg>
                </button>
              </div>
            ) : (
              <p className="text-body-sm text-ink-2">One, the same every time.</p>
            )}
          </section>

          <section className="flex flex-col gap-2" role="radiogroup" aria-label="Who picks up next">
            <h3 className="text-label text-ink-3">Who picks up next</h3>
            <button type="button" role="radio" aria-checked={payback} onClick={() => setPayback(true)} className={rowClass(payback)}>
              <span className="text-body-sm text-ink-2">{first} picks up next</span>
              {/* The token it will make (3.2), exactly as it will appear on both pages; with "$" and no amount typed yet there is no token to show. */}
              {quantity > 0n ? <ObligationToken owner={{ id: person.id, displayName: person.displayName, hue: person.ghost ? "stone" : person.hue, ghost: person.ghost }} other={{ id: viewer.id, displayName: viewer.displayName }} viewerId={viewer.id} denomination={denomination} quantity={quantity} pending /> : <span className="text-caption text-ink-3">The amount, once typed</span>}
            </button>
            <button type="button" role="radio" aria-checked={!payback} onClick={() => setPayback(false)} className={rowClass(!payback)}>
              <span className="flex items-center gap-2 text-body-sm text-ink-2">
                <span aria-hidden="true" className="inline-block h-2 w-2 rounded-pill" style={{ background: hueVar(viewer.hue) }} />
                Nobody’s paying it back
              </span>
            </button>
          </section>

          <ProblemSummary messages={[problem]} />
          <Button variant="primary" onClick={submit} loading={pending} disabled={choice.kind === "usd" && (cents === null || cents <= 0n)} data-cover-submit="">
            {label}
          </Button>
        </div>
      }
    />
  );
}
