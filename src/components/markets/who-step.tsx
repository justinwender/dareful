"use client";

import { useState, useTransition } from "react";
import { Avatar } from "@/components/ledger/avatar";
import { Button } from "@/components/ui/button";
import { dismissNamePromptAction, nameGroupAction } from "@/lib/actions/join";
import { hueRing, type Hue } from "@/lib/ui/hue";
import type { InkName } from "@/lib/ui/ink";
import { cn } from "@/lib/utils";

export type SetOption = { groupId: string; label: string; caption: string; avatars: Array<{ name: string; hue: Hue }>; offerName: boolean; size: number; units: Array<{ id: string; label: string; template: string | null }>; /** The inks of the questions still open in this set, for balance (1.8, rule 4). */ takenInks: InkName[] };
export type Person = { id: string; name: string; hue: Hue };
export type Who = { kind: "set"; groupId: string } | { kind: "people"; userIds: string[] } | { kind: "link" };
const COUNT = ["", "", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/**
 * Who's in (docs/design.md 3.20, 3.38): the heading and its caption, the rows of saved sets (the last one
 * preselected, since the common case is the same people as last time), the naming prompt under a set asking its
 * second question, the dashed "Someone else" row with the people the asker knows, and "Whoever I send it to". The
 * same step in the ask flow and in starting a game (3.33); the parent renders what stands above it and the sheet.
 */
export function WhoStep({ sets, people, who, onWho, argument = false, hue = "stone" }: { sets: SetOption[]; people: Person[]; who: Who; onWho: (who: Who) => void; argument?: boolean; /** The asker's hue, for the selection ring on the chosen row (3.20). */ hue?: Hue }) {
  const [picking, setPicking] = useState(sets.length === 0 && people.length > 0);
  const [named, setNamed] = useState<Record<string, string>>({});
  const [waved, setWaved] = useState<Record<string, boolean>>({});
  const [newName, setNewName] = useState("");
  const [namingBusy, startNaming] = useTransition();
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
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-body-strong text-ink">{argument ? "Who’s on the other side?" : "Who’s in?"}</h1>
        <p className="text-body-sm text-ink-2">{argument ? "An argument is between two of you. Anyone else in the set can watch, and helps call it." : "Everyone you pick gets the link. Nobody needs an account to look."}</p>
      </div>
      <div role="radiogroup" aria-label="Who's in" className="flex flex-col gap-2">
        {sets.map((s) => {
          const on = who.kind === "set" && who.groupId === s.groupId;
          const label = named[s.groupId] ?? s.label;
          return (
            <div key={s.groupId} className="flex flex-col gap-2">
              <button type="button" role="radio" aria-checked={on} onClick={() => (onWho({ kind: "set", groupId: s.groupId }), setPicking(false))} className={cn("grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-card border border-line px-[14px] py-3 text-left", on && "bg-surface")} style={on ? { boxShadow: hueRing(hue) } : undefined}>
                <span className="flex">
                  {s.avatars.slice(0, 3).map((a, i) => (
                    <span key={i} style={{ marginLeft: i === 0 ? 0 : -10 }}>
                      <Avatar name={a.name} hue={a.hue} size={32} ring={on ? "var(--surface)" : "var(--ground)"} />
                    </span>
                  ))}
                  {s.avatars.length > 3 ? <span className="-ml-[10px] flex h-8 w-8 items-center justify-center rounded-pill bg-surface-2 text-label text-ink-2">+{s.avatars.length - 3}</span> : null}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-body-strong text-ink">{label}</span>
                  <span className="truncate text-caption text-ink-3">{s.caption}</span>
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
                    <input id={`name-${s.groupId}`} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} className="h-12 min-w-0 flex-1 rounded-button border border-line bg-ground px-4 text-body text-ink placeholder:text-ink-3" />
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
            <button type="button" role="radio" aria-checked={who.kind === "people"} onClick={() => (setPicking(true), onWho({ kind: "people", userIds: who.kind === "people" ? who.userIds : [] }))} className={cn("grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-card border border-dashed border-line-strong px-[14px] py-3 text-left", who.kind === "people" && "bg-surface")}>
              <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-pill border border-dashed border-line-strong text-ink-2">
                +
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-body-strong text-ink">Someone else</span>
                <span className="text-caption text-ink-3">Pick people, or just send the link around</span>
              </span>
              {circle(who.kind === "people")}
            </button>
            {picking && who.kind === "people" ? (
              <ul className="flex flex-col rounded-card border border-line">
                {people.map((p, i) => {
                  const on = who.userIds.includes(p.id);
                  return (
                    <li key={p.id} className={i > 0 ? "border-t border-line" : undefined}>
                      <button type="button" aria-pressed={on} onClick={() => onWho({ kind: "people", userIds: on ? who.userIds.filter((x) => x !== p.id) : [...who.userIds, p.id].slice(0, 11) })} className="flex min-h-12 w-full items-center gap-3 px-[14px] text-left">
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

        <button type="button" role="radio" aria-checked={who.kind === "link"} onClick={() => (onWho({ kind: "link" }), setPicking(false))} className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-card border border-dashed border-line-strong px-[14px] py-3 text-left", who.kind === "link" && "bg-surface")}>
          <span className="flex min-w-0 flex-col">
            <span className="text-body-strong text-ink">Whoever I send it to</span>
            <span className="text-caption text-ink-3">You get a link and a code. Whoever joins is in.</span>
          </span>
          {circle(who.kind === "link")}
        </button>
      </div>
    </>
  );
}
