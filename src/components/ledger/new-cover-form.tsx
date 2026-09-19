"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ledger/chip";
import { MarkStamp } from "@/components/ledger/mark-stamp";
import { UnitGlyph } from "@/components/ledger/glyphs";
import { Problem } from "@/components/ledger/problem";
import type { UnitSummary } from "@/lib/actions/denominations";
import { proposeCoverAction, splitCoverAction } from "@/lib/actions/proposals";
import { splitTotal, SplitError, type Split } from "@/lib/ledger/split";
import { formatMoney, type GlyphKey } from "@/lib/ui/units";
import { cents as asCents } from "@/lib/money";

/** An account-holder, or a ghost the viewer added earlier: previously picked people are offered first. */
export type PersonOption = { id: string; displayName: string; kind: "user" | "claim" };
export type GroupOption = { id: string; name: string | null; isDyad: boolean; memberIds: string[]; ghostIds: string[]; units: UnitSummary[] };

/** The Contact Picker API, where the browser has one (Android Chrome). Everywhere else a name is typed. */
type PickedContact = { name?: string[]; tel?: string[] };
type ContactsManager = { select(props: Array<"name" | "tel">, opts?: { multiple?: boolean }): Promise<PickedContact[]> };
function contactPicker(): ContactsManager | null {
  if (typeof navigator === "undefined") return null;
  const c = (navigator as Navigator & { contacts?: ContactsManager }).contacts;
  return c && typeof c.select === "function" ? c : null;
}

type Template = "beer" | "coffee" | "round" | "next_time";
const PRESETS: Array<{ template: Template; label: string; quantifiable: boolean }> = [
  { template: "next_time", label: "a next time", quantifiable: false },
  { template: "beer", label: "a beer", quantifiable: true },
  { template: "round", label: "a round", quantifiable: true },
  { template: "coffee", label: "a coffee", quantifiable: true },
];

/**
 * What it was. A unit named here does not exist anywhere yet: it is registered with the group when the cover is
 * saved. Between two people that group is a dyad that is itself only made on save, which is why the unit cannot
 * be made first, and why a one-on-one cover offers the same units a group does.
 */
type UnitChoice = { kind: "usd" } | { kind: "existing"; id: string } | { kind: "new"; template: Template | null; label: string; markEmoji?: string; quantifiable: boolean };
type Preview = { ok: true; split: Split; pins: Map<string, bigint> } | { ok: false; error: string };
type Field = "who" | "unit" | "amount" | "split";

/**
 * "I got this one." The creditor authors; the copy never says who owes what (Principle 2, docs/design.md 2.1).
 * One person, or several in a group with one total split between them. Precision is optional: a dollar figure
 * can be kept privately while the unit logged is "a next time."
 *
 * Every refusal is shown at the field it is about, as a statement of what to do, with the field marked and
 * brought into view. The first real session read an error at the bottom of the form, phrased as a question, as
 * a second prompt, and read the form as having done nothing (docs/testing.md, session 2).
 */
export function NewCoverForm({ people, groups, recent, initialPerson, initialGroup }: { people: PersonOption[]; groups: GroupOption[]; recent: UnitSummary[]; initialPerson?: string; initialGroup?: string }) {
  const named = useMemo(() => groups.filter((g) => !g.isDyad), [groups]);
  const [groupId, setGroupId] = useState<string | null>(initialGroup && named.some((g) => g.id === initialGroup) ? initialGroup : null);
  const [selected, setSelected] = useState<string[]>(initialPerson ? [initialPerson] : !initialGroup && people[0] ? [people[0].id] : []);
  // Someone new: a name, and the number from the contact card when they were picked. The number is sent once
  // with the form, hashed on the server, and kept nowhere, including here after the submit.
  const [someoneNew, setSomeoneNew] = useState<{ name: string; phone?: string } | null>(people.length === 0 ? { name: "" } : null);
  const [unit, setUnit] = useState<UnitChoice>({ kind: "usd" });
  const [namedUnits, setNamedUnits] = useState<Array<Extract<UnitChoice, { kind: "new" }>>>([]);
  const [count, setCount] = useState("1");
  const [dollars, setDollars] = useState("");
  const [payerIn, setPayerIn] = useState(true);
  const [adjusting, setAdjusting] = useState(false);
  const [fixed, setFixed] = useState<Record<string, string>>({});
  const [settleExpected, setSettleExpected] = useState<boolean | null>(null);
  const [memo, setMemo] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [customEmoji, setCustomEmoji] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field | "form", string>>>({});
  const [pending, start] = useTransition();
  const whoRef = useRef<HTMLElement>(null);
  const unitRef = useRef<HTMLElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const splitRef = useRef<HTMLElement>(null);

  const group = named.find((g) => g.id === groupId) ?? null;
  const visiblePeople = group ? people.filter((p) => group.memberIds.includes(p.id) || group.ghostIds.includes(p.id)) : people;
  const chosen = someoneNew ? [] : selected.filter((id) => visiblePeople.some((p) => p.id === id));
  const splitting = chosen.length > 1;
  const one = chosen.length === 1 ? people.find((p) => p.id === chosen[0]) ?? null : null;

  // The units on offer are the ones the cover's group already has: the named group, or the pair's dyad if one
  // exists. Anything else is named here and registered on save.
  const dyad = !group && one ? groups.find((g) => g.isDyad && (g.memberIds.includes(one.id) || g.ghostIds.includes(one.id))) ?? null : null;
  const existingUnits = (group ?? dyad)?.units.filter((u) => !u.monetary) ?? [];
  const has = (t: Template | null, label: string) => existingUnits.some((u) => (t ? u.template === t : !u.template && u.label.toLowerCase() === label.toLowerCase())) || namedUnits.some((u) => (t ? u.template === t : !u.template && u.label.toLowerCase() === label.toLowerCase()));

  const isMoney = splitting || unit.kind === "usd";
  const selectedExisting = unit.kind === "existing" ? existingUnits.find((u) => u.id === unit.id) ?? null : null;
  const quantifiable = isMoney ? true : unit.kind === "new" ? unit.quantifiable : (selectedExisting?.quantifiable ?? true);
  const settle = settleExpected ?? isMoney; // before a group has history: yes for dollars, no for everything else

  function fail(field: Field, message: string) {
    setErrors({ [field]: message });
    const el = { who: whoRef, unit: unitRef, amount: amountRef, split: splitRef }[field].current;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    if (el instanceof HTMLInputElement) el.focus({ preventScroll: true });
  }

  function pickGroup(id: string | null) {
    setGroupId(id);
    setUnit({ kind: "usd" });
    setErrors({});
    if (id === null) setSelected((s) => s.slice(0, 1));
  }

  function tapPerson(id: string) {
    setSomeoneNew(null);
    setErrors({});
    setUnit((u) => (u.kind === "existing" ? { kind: "usd" } : u));
    // Between two people it is one person. In a group, tapping adds and removes: several people, one total.
    setSelected((s) => (group ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id]));
  }

  function startSomeoneNew() {
    setSomeoneNew({ name: "" });
    setGroupId(null); // someone new starts between just the two of you
    setUnit((u) => (u.kind === "existing" ? { kind: "usd" } : u));
    setErrors({});
  }

  async function pickFromContacts() {
    const picker = contactPicker();
    if (!picker) return;
    try {
      const [c] = await picker.select(["name", "tel"], { multiple: false });
      if (!c) return;
      const first = (c.name?.[0] ?? "").trim().split(/\s+/)[0] ?? "";
      setSomeoneNew({ name: first.slice(0, 40), phone: c.tel?.[0] });
      setGroupId(null);
    } catch {
      // The sheet was closed without picking anyone.
    }
  }

  function nameUnit(u: Extract<UnitChoice, { kind: "new" }>) {
    setNamedUnits((list) => [...list, u]);
    setUnit(u);
    setErrors({});
  }

  function addCustom() {
    const label = customLabel.trim();
    if (!label) return;
    if (!has(null, label)) nameUnit({ kind: "new", template: null, label, markEmoji: customEmoji.trim() || undefined, quantifiable: true });
    setShowCustom(false);
    setCustomLabel("");
    setCustomEmoji("");
  }

  const total = dollars.trim() ? toCents(dollars) : null;
  const preview = ((): Preview | null => {
    if (!splitting || total === null || total <= 0n) return null;
    try {
      const pins = new Map<string, bigint>();
      for (const [id, v] of Object.entries(fixed)) {
        if (!chosen.includes(id) || !v.trim()) continue;
        const c = toCents(v);
        if (c === null) return { ok: false, error: "One of those amounts doesn't look right." };
        pins.set(id, c);
      }
      return { ok: true, split: splitTotal({ totalCents: total, present: chosen, payerIn, fixed: pins }), pins };
    } catch (err) {
      return { ok: false, error: err instanceof SplitError ? err.message : "That split doesn't add up." };
    }
  })();

  function submit() {
    setErrors({});
    if (someoneNew ? !someoneNew.name.trim() : chosen.length === 0) return fail("who", someoneNew ? "Type their first name." : "Pick who you got.");
    if (dollars.trim() && total === null) return fail("amount", "That amount doesn't look right. Try it like 47.20.");
    if (isMoney && (total === null || total <= 0n)) return fail("amount", splitting ? "Add the total first." : "Add the amount first.");

    if (splitting) {
      if (!group) return fail("who", "Pick the group you were all in.");
      if (chosen.some((id) => people.find((p) => p.id === id)?.kind === "claim")) return fail("who", "Someone who isn't here yet can only be covered on their own for now.");
      if (!preview || !preview.ok) return fail("split", preview?.error ?? "Add the total first.");
      const pins = preview.pins;
      start(async () => {
        const result = await splitCoverAction({
          groupId: group.id,
          present: chosen,
          totalCents: (total as bigint).toString(),
          payerIn,
          fixed: Array.from(pins, ([userId, c]) => ({ userId, cents: c.toString() })),
          settleExpected: settle,
          memo: memo.trim() || undefined,
        });
        if (result && "error" in result) setErrors({ form: result.error });
      });
      return;
    }

    const who = someoneNew
      ? { kind: "new" as const, name: someoneNew.name.trim(), phone: someoneNew.phone }
      : one?.kind === "claim"
        ? { kind: "claim" as const, claimId: one.id }
        : { kind: "user" as const, userId: (one as PersonOption).id };
    const sent = unit.kind === "new" ? { kind: "new" as const, template: unit.template, label: unit.label, markEmoji: unit.markEmoji } : unit;
    start(async () => {
      const result = await proposeCoverAction({
        who,
        groupId: group ? group.id : null,
        unit: sent,
        quantity: isMoney ? null : quantifiable ? count.replace(/\D/g, "") || "1" : null,
        amountCents: total === null ? null : total.toString(),
        settleExpected: settle,
        memo: memo.trim() || undefined,
      });
      if (result && "error" in result) setErrors({ form: result.error });
    });
  }

  const glyphFor = (template: string | null): GlyphKey | null => (template === "beer" || template === "coffee" || template === "round" || template === "next_time" ? template : null);
  const unitLabel = (template: string | null, label: string) => (template === "next_time" ? "a next time" : template ? `a ${label}` : `“${label}”`);
  const invalid = "border-marigold";

  return (
    <div className="flex flex-col gap-7">
      <section ref={whoRef} className="flex flex-col gap-3">
        <h2 className="text-label text-ink-3">{group ? "Who was there" : "Who"}</h2>
        {named.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => pickGroup(null)} className="rounded-pill">
              <Chip size={28} selected={groupId === null}>
                Just us
              </Chip>
            </button>
            {named.map((g) => (
              <button key={g.id} type="button" onClick={() => pickGroup(g.id)} className="rounded-pill">
                <Chip size={28} selected={g.id === groupId}>
                  {g.name ?? "Group"}
                </Chip>
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {visiblePeople.map((p) => (
            <button key={p.id} type="button" aria-pressed={!someoneNew && chosen.includes(p.id)} onClick={() => tapPerson(p.id)} className="rounded-pill">
              <Chip size={36} selected={!someoneNew && chosen.includes(p.id)}>
                {p.displayName}
              </Chip>
            </button>
          ))}
          {!group ? (
            <button type="button" onClick={startSomeoneNew} className="rounded-pill">
              <Chip size={36} selected={someoneNew !== null}>
                + someone new
              </Chip>
            </button>
          ) : null}
        </div>
        {group && visiblePeople.length > 1 ? <p className="text-caption text-ink-3">Tap everyone who was in on it. One total, split between you.</p> : null}
        {someoneNew ? (
          <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
            {contactPicker() ? (
              <div>
                <Button variant="secondary" size="inline" onClick={pickFromContacts}>
                  Pick from contacts
                </Button>
              </div>
            ) : null}
            <label className="text-label text-ink-3" htmlFor="new-name">
              {contactPicker() ? "Or type a first name" : "Their first name"}
            </label>
            <input
              id="new-name"
              value={someoneNew.name}
              onChange={(e) => setSomeoneNew((s) => ({ ...(s ?? { name: "" }), name: e.target.value }))}
              maxLength={40}
              placeholder="Gabe"
              autoComplete="off"
              aria-invalid={Boolean(errors.who)}
              className={`h-12 rounded-tile border bg-ground px-3 text-body text-ink ${errors.who ? invalid : "border-line"}`}
            />
            <p className="text-caption text-ink-3">
              They don’t need the app. It waits here until they say it’s right.{someoneNew.phone ? " Their number is only used to recognize them if they join; it isn’t kept." : ""}
            </p>
          </div>
        ) : null}
        <Problem message={errors.who} />
      </section>

      <section ref={unitRef} className="flex flex-col gap-3">
        <h2 className="text-label text-ink-3">What it was</h2>
        {splitting ? (
          <p className="text-body-sm text-ink-2">Dollars, split between you. To log a round or a next time, pick one person.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setUnit({ kind: "usd" })} className="rounded-pill">
                <Chip size={36} selected={unit.kind === "usd"}>
                  Dollars
                </Chip>
              </button>
              {existingUnits.map((u) => (
                <button key={u.id} type="button" onClick={() => setUnit({ kind: "existing", id: u.id })} className="rounded-pill">
                  <Chip size={36} selected={unit.kind === "existing" && unit.id === u.id}>
                    {u.markKind && u.markValue ? <MarkStamp kind="emoji" value={u.markValue} size={20} inToken /> : null}
                    {glyphFor(u.template) ? <UnitGlyph unit={glyphFor(u.template) as GlyphKey} size={16} /> : null}
                    {unitLabel(u.template, u.label)}
                  </Chip>
                </button>
              ))}
              {namedUnits.map((u) => (
                <button key={`${u.template ?? ""}:${u.label}`} type="button" onClick={() => setUnit(u)} className="rounded-pill">
                  <Chip size={36} selected={unit.kind === "new" && unit.template === u.template && unit.label === u.label}>
                    {u.markEmoji ? <MarkStamp kind="emoji" value={u.markEmoji} size={20} inToken /> : null}
                    {glyphFor(u.template) ? <UnitGlyph unit={glyphFor(u.template) as GlyphKey} size={16} /> : null}
                    {unitLabel(u.template, u.label)}
                  </Chip>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.filter((p) => !has(p.template, p.template)).map((p) => (
                <button key={p.template} type="button" onClick={() => nameUnit({ kind: "new", template: p.template, label: p.template, quantifiable: p.quantifiable })} className="rounded-pill">
                  <Chip size={28}>+ {p.label}</Chip>
                </button>
              ))}
              {recent
                .filter((r) => !r.template && !has(null, r.label))
                .slice(0, 4)
                .map((r) => (
                  <button key={r.id} type="button" onClick={() => nameUnit({ kind: "new", template: null, label: r.label, markEmoji: r.markKind === "emoji" && r.markValue ? r.markValue : undefined, quantifiable: r.quantifiable })} className="rounded-pill">
                    <Chip size={28}>+ “{r.label}”</Chip>
                  </button>
                ))}
              <button type="button" onClick={() => setShowCustom((s) => !s)} className="rounded-pill">
                <Chip size={28}>+ something else</Chip>
              </button>
            </div>
          </>
        )}
        {showCustom && !splitting ? (
          <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
            <label className="text-label text-ink-3" htmlFor="custom-label">
              Call it
            </label>
            <input id="custom-label" value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} maxLength={40} placeholder="dumpling run" className="h-12 rounded-tile border border-line bg-ground px-3 text-body text-ink" />
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
        <Problem message={errors.unit} />
      </section>

      {!isMoney && quantifiable ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-label text-ink-3">How many</h2>
          <div className="flex gap-2">
            {["1", "2", "3", "4"].map((n) => (
              <button key={n} type="button" onClick={() => setCount(n)} className="rounded-pill">
                <Chip size={36} selected={count === n}>
                  {n}
                </Chip>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        {/* For dollars this is the amount, and the only place one is asked for. For anything else it is a private
            note of what the thing cost: optional, never shown to anyone else, and worded that way. */}
        <label htmlFor="amount" className="text-label text-ink-3">
          {splitting ? "The total" : isMoney ? "How much" : "What it cost, if you want to remember (optional)"}
        </label>
        <div className="flex items-center gap-2">
          <span className="text-numeral text-ink-2">$</span>
          <input
            id="amount"
            ref={amountRef}
            inputMode="decimal"
            value={dollars}
            onChange={(e) => {
              setDollars(e.target.value);
              if (errors.amount) setErrors({});
            }}
            placeholder={isMoney ? "47.20" : "skip it"}
            aria-invalid={Boolean(errors.amount)}
            aria-describedby={errors.amount ? "amount-problem" : undefined}
            className={`h-12 w-40 rounded-tile border bg-surface px-3 text-numeral text-ink ${errors.amount ? invalid : "border-line"}`}
          />
        </div>
        <Problem id="amount-problem" message={errors.amount} />
        {!isMoney ? <p className="text-caption text-ink-3">Only you ever see this. It helps answer “are we roughly even” later.</p> : null}
      </section>

      {splitting ? (
        <section ref={splitRef} className="flex flex-col gap-3">
          <h2 className="text-label text-ink-3">The split</h2>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPayerIn(true)} className="rounded-pill">
              <Chip size={36} selected={payerIn}>
                I was in on it too
              </Chip>
            </button>
            <button type="button" onClick={() => setPayerIn(false)} className="rounded-pill">
              <Chip size={36} selected={!payerIn}>
                It was all theirs
              </Chip>
            </button>
          </div>
          {preview?.ok ? (
            <ul className="flex flex-col rounded-card border border-line bg-surface">
              {preview.split.shares.map((s) => (
                <li key={s.personId} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
                  <span className="text-body text-ink">{people.find((p) => p.id === s.personId)?.displayName}</span>
                  {adjusting ? (
                    <span className="flex items-center gap-1">
                      <span className="text-body-sm text-ink-2">$</span>
                      <input
                        inputMode="decimal"
                        aria-label={`Amount for ${people.find((p) => p.id === s.personId)?.displayName ?? "them"}`}
                        value={fixed[s.personId] ?? ""}
                        placeholder={formatMoney(asCents(s.cents), { cents: true }).replace("$", "")}
                        onChange={(e) => setFixed((f) => ({ ...f, [s.personId]: e.target.value }))}
                        className="h-11 w-24 rounded-tile border border-line bg-ground px-2 text-right text-body text-ink"
                      />
                    </span>
                  ) : (
                    <span className="text-body-strong text-ink">{formatMoney(asCents(s.cents), { cents: true })}</span>
                  )}
                </li>
              ))}
              {payerIn ? (
                <li className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-body text-ink-2">You</span>
                  <span className="text-body text-ink-2">{formatMoney(asCents(preview.split.payerCents), { cents: true })}</span>
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="text-body-sm text-ink-2">{preview && !preview.ok ? preview.error : "Add the total and it splits evenly."}</p>
          )}
          {preview?.ok ? (
            <button type="button" onClick={() => setAdjusting((a) => !a)} className="h-11 self-start text-[15px] font-semibold text-ink-2">
              {adjusting ? "Done adjusting" : "Someone had more or less?"}
            </button>
          ) : null}
          <Problem message={errors.split} />
        </section>
      ) : null}

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

      <div className="flex flex-col gap-3">
        <Problem message={errors.form} />
        {/* A refusal higher up the form is repeated here, where the thumb is, so a tap is never met with nothing. */}
        {!errors.form && (errors.who || errors.unit || errors.amount || errors.split) ? <Problem message={errors.who ?? errors.unit ?? errors.amount ?? errors.split} /> : null}
        <Button variant="primary" onClick={submit} loading={pending}>
          {splitting ? `I got this one, for ${chosen.length}` : "I got this one"}
        </Button>
      </div>
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
