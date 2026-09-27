"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { TypedDataDomain } from "viem";
import { AvatarStack } from "@/components/ledger/avatar";
import { Chip } from "@/components/ledger/chip";
import { ProblemSummary } from "@/components/ledger/problem";
import { Screen } from "@/components/ledger/screen";
import { TeamStamp } from "@/components/ledger/team-stamp";
import { signingProblem, useSigner } from "@/components/ledger/use-signer";
import { Button } from "@/components/ui/button";
import { PinnedSheet } from "@/components/ui/pinned-sheet";
import { WhoStep, type Person, type SetOption, type Who } from "@/components/markets/who-step";
import { openGameQuestionsAction, startGameAction } from "@/lib/actions/games";
import { daresTypes } from "@/lib/chain/typed-data";
import { consentFor } from "@/lib/sports/templates";
import type { TeamFace } from "@/lib/ui/team";
import { cn } from "@/lib/utils";

type Unit = { kind: "usd" } | { kind: "existing"; id: string } | { kind: "new"; template: "beer" | "round" | "coffee" | "next_time"; label: string };
const PRESETS = [
  { template: "beer", label: "beers" },
  { template: "round", label: "rounds" },
  { template: "next_time", label: "a next time" },
] as const;

export type MenuItem = { key: "home_wins" | "margin" | "total" | "first_drive"; name: string; kindLabel: string; title: string; rows: { countsIf: string; tie: string | null; unclear: string } };
export type GameHeaderData = { id: string; name: string; away: TeamFace; home: TeamFace; /** "Sun 1:00pm" */ start: string };

/** The menu row's 28px glyph (3.33): a small structural icon per kind, on `--surface-2`. */
function MenuGlyph({ k }: { k: MenuItem["key"] }) {
  return (
    <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-stamp-28 bg-surface-2 text-ink-2">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {k === "home_wins" ? (
          <>
            <circle cx="8" cy="12" r="5" />
            <circle cx="16" cy="12" r="5" />
          </>
        ) : k === "margin" ? (
          <>
            <path d="M3 12h18" />
            <path d="M12 7v10" />
            <path d="M18 9l3 3-3 3" />
          </>
        ) : k === "total" ? (
          <>
            <path d="M5 12h14M12 5v14" />
          </>
        ) : (
          <>
            <ellipse cx="12" cy="12" rx="9" ry="5.5" />
            <path d="M8.5 12h7M10.5 10v4M13.5 10v4" />
          </>
        )}
      </svg>
    </span>
  );
}

/** The game's header band (3.33), on `--surface-2`: the two 44px stamps, the time, the game in serif, and one caption. */
export function GameHeader({ game, caption, right }: { game: GameHeaderData; caption: ReactNode; right?: ReactNode }) {
  return (
    <section className="-mx-2 flex flex-col gap-3 rounded-card bg-surface-2 p-4 pb-[18px]" data-game-header={game.id}>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5">
          <TeamStamp team={game.away} size={44} />
          <TeamStamp team={game.home} size={44} />
        </span>
        <span className="text-label text-ink-2">{right ?? game.start}</span>
      </div>
      <h1 className="text-serif-l text-ink">{game.name}</h1>
      <div className="text-caption text-ink-2">{caption}</div>
    </section>
  );
}

/**
 * Starting a game (docs/design.md 3.33, 3.38 "Starting a game with one question"): the menu with Who wins ticked
 * as the page opens, then who's in, then the terms step with each chosen question's written rows, one Stakes row
 * covering them all, the consent line and "Send it". "Send it" makes one ordinary market per question, all with
 * the same people, all closing at kickoff, and the asker's `Create` signature opens each for the group. Adding
 * another later (the dashed rows) is the terms step alone, with the same people already chosen.
 */
export function StartGame({ game, menu, sets, people, chrome, signing, mode, closes }: {
  game: GameHeaderData;
  menu: MenuItem[];
  sets: SetOption[];
  people: Person[];
  chrome: ReactNode;
  signing: { domain: TypedDataDomain; ledgerWallet: string };
  /** Starting fresh, or adding one question to a game already running with these people. */
  mode: { kind: "start" } | { kind: "add"; groupId: string; groupLabel: string; key: MenuItem["key"] };
  /** "Sun 1:00pm": when everything closes, in the asker's zone. */
  closes: string;
}) {
  const router = useRouter();
  const sign = useSigner();
  const [step, setStep] = useState<"menu" | "who" | "terms">(mode.kind === "add" ? "terms" : "menu");
  const [checked, setChecked] = useState<Set<MenuItem["key"]>>(new Set(mode.kind === "add" ? [mode.key] : menu.some((m) => m.key === "home_wins") ? ["home_wins"] : []));
  const [who, setWho] = useState<Who>(mode.kind === "add" ? { kind: "set", groupId: mode.groupId } : sets[0] ? { kind: "set", groupId: sets[0].groupId } : { kind: "link" });
  const [unit, setUnit] = useState<Unit>({ kind: "usd" });
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [signingStep, setSigningStep] = useState<string | null>(null);
  const selectedSet = who.kind === "set" ? sets.find((s) => s.groupId === who.groupId) : undefined;
  const chosen = menu.filter((m) => checked.has(m.key));
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

  function send() {
    setProblem(null);
    if (chosen.length === 0) return setProblem("Pick at least one question.");
    if (who.kind === "people" && who.userIds.length === 0) return setProblem("Pick someone, or just send the link around.");
    startSave(async () => {
      const r = await startGameAction({ gameId: game.id, keys: chosen.map((m) => m.key), who, unit });
      if ("error" in r) return setProblem(r.error);
      // The asker's Create signature opens each question for the group; the ledger wallet signs silently, once per question.
      const signed: Array<{ id: string; signature: string }> = [];
      try {
        for (const q of r.toOpen) {
          setSigningStep(q.title);
          const c = q.create;
          const signature = await sign(signing.ledgerWallet, { domain: signing.domain, types: daresTypes, primaryType: "Create", message: { dareId: c.dareId, groupId: c.groupId, kind: c.kind, pace: c.pace, termsHash: c.termsHash, denomId: c.denomId, range: BigInt(c.range), options: c.options, stalemate: c.stalemate, resolvesBy: BigInt(c.resolvesBy) } }, "approve terms");
          signed.push({ id: q.id, signature });
        }
      } catch (err) {
        setSigningStep(null);
        // The drafts are saved and listed on the page as the asker's to finish, so nothing typed is lost.
        setProblem(`${signingProblem(err)} The questions are saved as drafts; open the game to finish them.`);
        router.push(`/on/${game.id}?g=${r.groupId}`);
        return;
      }
      setSigningStep(null);
      const o = await openGameQuestionsAction(signed);
      if ("error" in o) return setProblem(o.error);
      router.push(`/on/${game.id}?g=${r.groupId}`);
    });
  }

  const caption = step === "menu" || (step === "who" && !selectedSet) ? "Everything closes at kickoff." : selectedSet ? (
    <span className="flex items-center gap-2">
      <AvatarStack people={selectedSet.avatars.slice(0, 4)} size={26} ring="var(--surface-2)" />
      <span>{mode.kind === "add" ? mode.groupLabel : selectedSet.label}</span>
    </span>
  ) : who.kind === "people" ? `${who.userIds.length} picked. Everything closes at kickoff.` : "Whoever you send it to. Everything closes at kickoff.";

  const wrap = (children: ReactNode) => (
    <Screen>
      {chrome}
      <div className="flex flex-col gap-6 py-2">
        <GameHeader game={game} caption={caption} />
        {children}
      </div>
    </Screen>
  );

  if (step === "menu") {
    return wrap(
      <>
        <section className="flex flex-col gap-[10px]">
          <h2 className="text-label text-ink-3">What to ask</h2>
          <div role="group" aria-label="What to ask" className="overflow-hidden rounded-card border border-line bg-surface" data-game-menu="">
            {menu.map((m, i) => {
              const on = checked.has(m.key);
              return (
                <button
                  key={m.key}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => setChecked((c) => {
                    const next = new Set(c);
                    if (next.has(m.key)) next.delete(m.key);
                    else next.add(m.key);
                    return next;
                  })}
                  className={cn("grid min-h-14 w-full grid-cols-[28px_minmax(0,1fr)_24px] items-center gap-3 px-[14px] py-2 text-left", i > 0 && "border-t border-line")}
                >
                  <MenuGlyph k={m.key} />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-body-strong text-ink">{m.name}</span>
                    <span className="text-caption text-ink-3">{m.kindLabel}</span>
                  </span>
                  <span aria-hidden="true" className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-pill", on ? "bg-ink text-ground" : "border-[1.5px] border-line-strong")}>
                    {on ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12l5 5 9-10" />
                      </svg>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
        <PinnedSheet
          label="Next"
          low={
            <>
              <p className="text-caption text-ink-2">Your friends see only the ones you pick.</p>
              <Button variant="primary" disabled={chosen.length === 0} onClick={() => (setProblem(null), setStep("who"))}>
                Next: who’s in
              </Button>
            </>
          }
        />
      </>,
    );
  }

  if (step === "who") {
    return wrap(
      <>
        <WhoStep sets={sets} people={people} who={who} onWho={setWho} />
        <PinnedSheet
          label="Next"
          low={
            <>
              <ProblemSummary messages={[problem]} />
              <Button
                variant="primary"
                onClick={() => {
                  setProblem(null);
                  if (who.kind === "people" && who.userIds.length === 0) return setProblem("Pick someone, or just send the link around.");
                  setUnit({ kind: "usd" });
                  setStep("terms");
                }}
              >
                Set the terms
              </Button>
              <p className="text-caption text-ink-3">You can add anyone else right up until kickoff.</p>
            </>
          }
        />
      </>,
    );
  }

  return wrap(
    <>
      {chosen.map((m) => (
        <section key={m.key} className="flex flex-col gap-3" data-game-terms={m.key}>
          <h2 className="flex items-center gap-2 text-body-strong text-ink">
            <MenuGlyph k={m.key} />
            <span>{m.title}</span>
          </h2>
          {/* The written rows (3.38): in --ink-2 and not tappable. Everyone who reads them reads the same terms. */}
          <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-card border border-line bg-surface px-4 py-[14px]">
            <dt className="text-label text-ink-3">Counts if</dt>
            <dd className="text-body text-ink-2">{m.rows.countsIf}</dd>
            {m.rows.tie ? (
              <>
                <dt className="text-label text-ink-3">If it’s a tie</dt>
                <dd className="text-body text-ink-2">{m.rows.tie}</dd>
              </>
            ) : null}
            <dt className="text-label text-ink-3">If it’s unclear</dt>
            <dd className="text-body text-ink-2">{m.rows.unclear}</dd>
            <dt className="text-label text-ink-3">Closes</dt>
            <dd className="text-body text-ink-2">At kickoff, {closes}</dd>
          </dl>
        </section>
      ))}
      {/* The one Stakes row, in a card of its own (3.38), since it covers every question started together. */}
      <section className="flex flex-col gap-3 rounded-card border border-line bg-surface px-4 py-[14px]" data-game-stakes="">
        <h2 className="text-label text-ink-3">Stakes{chosen.length > 1 ? `, for all ${chosen.length}` : ""}</h2>
        <div className="flex flex-wrap gap-2">
          {unitChip({ kind: "usd" }, "Dollars", "usd")}
          {units.map((u) => unitChip({ kind: "existing", id: u.id }, u.template === "next_time" ? "a next time" : u.template ? `${u.label}s` : `“${u.label}”`, u.id))}
          {PRESETS.filter((p) => !units.some((u) => u.template === p.template)).map((p) => unitChip({ kind: "new", template: p.template, label: p.template }, p.label, p.template))}
        </div>
        <p className="text-caption text-ink-3">One kind of thing for everyone, fixed now. Dollars and beers can’t be weighed against each other.</p>
      </section>
      {mode.kind === "start" ? (
        <Button variant="tertiary" className="self-start" onClick={() => setStep("who")} disabled={saving}>
          Back to who’s in
        </Button>
      ) : null}
      <PinnedSheet
        label="Finish"
        low={
          <>
            <ProblemSummary messages={[problem]} />
            <p className="text-caption text-ink-3">What’s on wrote the wording, so everyone reads the same terms.</p>
            {/* The consent every entry gives (3.35): one line in ink after the 16px ticket glyph, directly above the button, true for every question chosen (`consentFor`). */}
            <p className="flex items-center gap-2 text-body-sm text-ink" data-consent-line="">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <path d="M4 9a2 2 0 0 0 2-2V6h12v1a2 2 0 0 0 2 2v6a2 2 0 0 0-2 2v1H6v-1a2 2 0 0 0-2-2z" />
                <path d="M12 7v10" strokeDasharray="1.5 2.5" />
              </svg>
              <span>{consentFor(chosen.map((m) => m.key))}</span>
            </p>
            <Button variant="primary" onClick={send} loading={saving}>
              Send it
            </Button>
            {signingStep ? <p className="text-caption text-ink-3">Opening “{signingStep}”.</p> : null}
          </>
        }
      />
    </>,
  );
}
