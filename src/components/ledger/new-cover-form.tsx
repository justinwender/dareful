"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ledger/chip";
import { MarkStamp } from "@/components/ledger/mark-stamp";
import { UnitGlyph } from "@/components/ledger/glyphs";
import { createDenominationAction, reuseDenominationAction, type UnitSummary } from "@/lib/actions/denominations";
import { proposeCoverAction } from "@/lib/actions/proposals";
import type { GlyphKey } from "@/lib/ui/units";

export type PersonOption = { id: string; displayName: string };
export type GroupOption = { id: string; name: string | null; isDyad: boolean; memberIds: string[]; units: UnitSummary[] };

const PRESETS: Array<{ template: "beer" | "coffee" | "round" | "next_time"; label: string }> = [
  { template: "next_time", label: "a next time" },
  { template: "beer", label: "a beer" },
  { template: "round", label: "a round" },
  { template: "coffee", label: "a coffee" },
];

/**
 * "I got this one." The creditor authors; the copy never says who owes what (Principle 2, docs/design.md 2.1).
 * Precision is optional: a dollar figure can be kept as the magnitude while the unit logged is "a next time."
 */
export function NewCoverForm({ people, groups, recent, initialPerson, initialGroup }: { people: PersonOption[]; groups: GroupOption[]; recent: UnitSummary[]; initialPerson?: string; initialGroup?: string }) {
  const [personId, setPersonId] = useState(initialPerson ?? people[0]?.id ?? "");
  const sharedGroups = useMemo(() => groups.filter((g) => !g.isDyad && g.memberIds.includes(personId)), [groups, personId]);
  const [groupId, setGroupId] = useState<string | null>(initialGroup ?? sharedGroups[0]?.id ?? null);
  const group = groups.find((g) => g.id === groupId) ?? null;
  const [units, setUnits] = useState<UnitSummary[]>(group?.units ?? []);
  const [unit, setUnit] = useState<string>("usd");
  const [count, setCount] = useState("1");
  const [dollars, setDollars] = useState("");
  const [settleExpected, setSettleExpected] = useState<boolean | null>(null);
  const [memo, setMemo] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [customEmoji, setCustomEmoji] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const selectedUnit = unit === "usd" ? null : units.find((u) => u.id === unit) ?? null;
  const isMoney = unit === "usd";
  const quantifiable = isMoney ? true : selectedUnit?.quantifiable ?? true;
  const settleDefault = isMoney; // before a group has history: true for monetary, false for everything else
  const settle = settleExpected ?? settleDefault;

  function pickGroup(id: string | null) {
    setGroupId(id);
    const g = groups.find((x) => x.id === id);
    setUnits(g?.units ?? []);
    setUnit("usd");
  }

  function pickPerson(id: string) {
    setPersonId(id);
    const shared = groups.filter((g) => !g.isDyad && g.memberIds.includes(id));
    pickGroup(shared[0]?.id ?? null);
  }

  async function addPreset(template: (typeof PRESETS)[number]["template"]) {
    if (!groupId) {
      setError("Pick a group first, or keep it between the two of you and use dollars for now.");
      return;
    }
    const existing = units.find((u) => u.template === template);
    if (existing) {
      setUnit(existing.id);
      return;
    }
    const created = await createDenominationAction({ groupId, template, label: template, quantifiable: template !== "next_time" });
    if ("error" in created) {
      setError(created.error);
      return;
    }
    setUnits((u) => [...u, created]);
    setUnit(created.id);
  }

  async function addCustom() {
    if (!groupId) {
      setError("Pick a group first.");
      return;
    }
    const created = await createDenominationAction({ groupId, template: null, label: customLabel, quantifiable: true, markEmoji: customEmoji || undefined });
    if ("error" in created) {
      setError(created.error);
      return;
    }
    setUnits((u) => [...u, created]);
    setUnit(created.id);
    setShowCustom(false);
    setCustomLabel("");
    setCustomEmoji("");
  }

  async function reuse(sourceId: string) {
    if (!groupId) return;
    const copied = await reuseDenominationAction(sourceId, groupId);
    if ("error" in copied) {
      setError(copied.error);
      return;
    }
    setUnits((u) => (u.some((x) => x.id === copied.id) ? u : [...u, copied]));
    setUnit(copied.id);
  }

  function submit() {
    setError(null);
    if (!personId) {
      setError("Who did you get?");
      return;
    }
    const amountCents = dollars.trim() ? toCents(dollars) : null;
    if (dollars.trim() && amountCents === null) {
      setError("That amount doesn't look right.");
      return;
    }
    if (isMoney && amountCents === null) {
      setError("How much was it?");
      return;
    }
    const qty = isMoney ? null : quantifiable ? count.replace(/\D/g, "") || "1" : null;
    start(async () => {
      const result = await proposeCoverAction({
        debtorUserId: personId,
        groupId: group && !group.isDyad ? group.id : null,
        unit,
        quantity: qty,
        amountCents: amountCents === null ? null : amountCents.toString(),
        settleExpected: settle,
        memo: memo.trim() || undefined,
      });
      if (result && "error" in result) setError(result.error);
    });
  }

  const glyphFor = (u: UnitSummary): GlyphKey | null =>
    u.template === "beer" || u.template === "coffee" || u.template === "round" || u.template === "next_time" ? u.template : null;

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col gap-3">
        <h2 className="text-label text-ink-3">Who</h2>
        <div className="flex flex-wrap gap-2">
          {people.map((p) => (
            <button key={p.id} type="button" onClick={() => pickPerson(p.id)} className="rounded-pill">
              <Chip size={36} selected={p.id === personId}>
                {p.displayName}
              </Chip>
            </button>
          ))}
        </div>
        {sharedGroups.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => pickGroup(null)} className="rounded-pill">
              <Chip size={28} selected={groupId === null}>
                Just us
              </Chip>
            </button>
            {sharedGroups.map((g) => (
              <button key={g.id} type="button" onClick={() => pickGroup(g.id)} className="rounded-pill">
                <Chip size={28} selected={g.id === groupId}>
                  {g.name ?? "Group"}
                </Chip>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-label text-ink-3">What it was</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setUnit("usd")} className="rounded-pill">
            <Chip size={36} selected={isMoney}>
              Dollars
            </Chip>
          </button>
          {units
            .filter((u) => !u.monetary)
            .map((u) => (
              <button key={u.id} type="button" onClick={() => setUnit(u.id)} className="rounded-pill">
                <Chip size={36} selected={unit === u.id}>
                  {u.markKind && u.markValue ? <MarkStamp kind="emoji" value={u.markValue} size={20} inToken /> : null}
                  {glyphFor(u) ? <UnitGlyph unit={glyphFor(u) as GlyphKey} size={16} /> : null}
                  {u.template && u.template !== "usd" ? (u.template === "next_time" ? "a next time" : `a ${u.label}`) : `“${u.label}”`}
                </Chip>
              </button>
            ))}
        </div>
        {groupId ? (
          <div className="flex flex-wrap gap-2">
            {PRESETS.filter((p) => !units.some((u) => u.template === p.template)).map((p) => (
              <button key={p.template} type="button" onClick={() => addPreset(p.template)} className="rounded-pill">
                <Chip size={28}>+ {p.label}</Chip>
              </button>
            ))}
            {recent
              .filter((r) => !units.some((u) => u.label.toLowerCase() === r.label.toLowerCase()))
              .slice(0, 4)
              .map((r) => (
                <button key={r.id} type="button" onClick={() => reuse(r.id)} className="rounded-pill">
                  <Chip size={28}>+ “{r.label}”</Chip>
                </button>
              ))}
            <button type="button" onClick={() => setShowCustom((s) => !s)} className="rounded-pill">
              <Chip size={28}>+ something else</Chip>
            </button>
          </div>
        ) : (
          <p className="text-caption text-ink-3">Between just the two of you it is dollars for now. Pick a group to use beers, rounds, or your own units.</p>
        )}
        {showCustom ? (
          <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
            <label className="text-label text-ink-3" htmlFor="custom-label">
              Call it
            </label>
            <input
              id="custom-label"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              maxLength={40}
              placeholder="dumpling run"
              className="h-12 rounded-tile border border-line bg-ground px-3 text-body text-ink"
            />
            <label className="text-label text-ink-3" htmlFor="custom-emoji">
              Mark (optional)
            </label>
            <input
              id="custom-emoji"
              value={customEmoji}
              onChange={(e) => setCustomEmoji(e.target.value.slice(0, 8))}
              placeholder="🥟"
              className="h-12 w-24 rounded-tile border border-dashed border-line-strong bg-ground px-3 text-center text-[22px] text-ink"
            />
            <Button variant="primary" size="inline" onClick={addCustom} disabled={!customLabel.trim()}>
              Add it
            </Button>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-label text-ink-3">{isMoney ? "How much" : quantifiable ? "How many" : "How much it was, if you want to keep that"}</h2>
        {!isMoney && quantifiable ? (
          <div className="flex gap-2">
            {["1", "2", "3", "4"].map((n) => (
              <button key={n} type="button" onClick={() => setCount(n)} className="rounded-pill">
                <Chip size={36} selected={count === n}>
                  {n}
                </Chip>
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <span className="text-numeral text-ink-2">$</span>
          <input
            inputMode="decimal"
            value={dollars}
            onChange={(e) => setDollars(e.target.value)}
            placeholder={isMoney ? "47.20" : "optional"}
            aria-label={isMoney ? "Amount in dollars" : "Amount in dollars, kept privately"}
            className="h-12 w-40 rounded-tile border border-line bg-surface px-3 text-numeral text-ink"
          />
        </div>
        {!isMoney && dollars.trim() ? <p className="text-caption text-ink-3">The dollar figure stays with you. Nobody else sees it.</p> : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-label text-ink-3">Expecting to square it?</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => setSettleExpected(true)} className="rounded-pill">
            <Chip size={36} selected={settle}>
              Yes, at some point
            </Chip>
          </button>
          <button type="button" onClick={() => setSettleExpected(false)} className="rounded-pill">
            <Chip size={36} selected={!settle}>
              Nah, next time
            </Chip>
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <label className="text-label text-ink-3" htmlFor="memo">
          What was it (optional)
        </label>
        <input id="memo" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={140} placeholder="Dinner at Sal's" className="h-12 rounded-tile border border-line bg-surface px-3 text-body text-ink" />
      </section>

      {error ? (
        <p role="alert" className="text-body-sm text-ink-2">
          {error}
        </p>
      ) : null}
      <Button variant="primary" onClick={submit} loading={pending}>
        I got this one
      </Button>
    </div>
  );
}

/** "47.20" to 4720n, integer cents only; null when it is not a money amount. */
function toCents(input: string): bigint | null {
  const m = /^\s*\$?\s*(\d{1,7})(?:\.(\d{1,2}))?\s*$/.exec(input);
  if (!m) return null;
  const whole = m[1] ?? "0";
  const frac = (m[2] ?? "").padEnd(2, "0");
  return BigInt(whole) * 100n + BigInt(frac);
}
