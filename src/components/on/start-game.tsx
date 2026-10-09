"use client";

import { attempt } from "@/lib/ui/attempt";
import type { CSSProperties } from "react";
import { useId, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { TypedDataDomain } from "viem";
import { Avatar, AvatarStack } from "@/components/ledger/avatar";
import { Chip, chipPress } from "@/components/ledger/chip";
import { ProblemSummary } from "@/components/ledger/problem";
import { Screen } from "@/components/ledger/screen";
import { TeamStamp } from "@/components/ledger/team-stamp";
import { signingProblem, useSigner } from "@/components/ledger/use-signer";
import { Button } from "@/components/ui/button";
import { PinnedSheet } from "@/components/ui/pinned-sheet";
import { Sheet } from "@/components/ui/sheet";
import type { SetOption, Who } from "@/components/markets/who";
import { openGameQuestionsAction, startGameAction } from "@/lib/actions/games";
import { daresTypes } from "@/lib/chain/typed-data";
import { consentFor } from "@/lib/sports/templates";
import { startWord } from "@/lib/sports/types";
import type { TeamFace } from "@/lib/ui/team";
import type { Hue } from "@/lib/ui/hue";
import { cn } from "@/lib/utils";
import { FIRST_CALL_CLOSE } from "@/lib/ui/copy";
import { MakeUnit } from "@/components/markets/make-unit";

type Unit = { kind: "usd" } | { kind: "existing"; id: string } | { kind: "new"; template: "beer" | "round" | "coffee" | null; label: string };
/** Beside Dollars; "a next time" left the stakes in the final round (section 6), and one of your own took its place. */
const PRESETS = [
  { template: "beer", label: "beers" },
  { template: "round", label: "rounds" },
] as const;

export type MenuItem = { key: "home_wins" | "margin" | "total" | "first_drive"; name: string; kindLabel: string; title: string; rows: { countsIf: string; tie: string | null; unclear: string } };
export type GameHeaderData = { id: string; name: string; away: TeamFace; home: TeamFace; /** "Sun 1:00pm" */ start: string; /** The feed's sport, for its own start word ("kickoff", "first pitch"). */ sport: string };

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
    <section className="-mx-2 flex flex-col gap-3 rounded-card bg-surface-2 p-4 pb-[18px]" data-game-header={game.id} style={{ viewTransitionName: "market-ink" } as CSSProperties}>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5">
          <TeamStamp team={game.away} size={44} travels="market-mark" />
          <TeamStamp team={game.home} size={44} travels="market-mark-2" />
        </span>
        <span className="text-label text-ink-2">{right ?? game.start}</span>
      </div>
      <h1 className="text-serif-l text-ink">{game.name}</h1>
      {caption ? <div className="text-caption text-ink-2">{caption}</div> : null}
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
/** A question already on this person's page for the game, from another set (3.33, "Asking what's already asked"): offered before starting the same one. */
export type AlreadyAsked = { dareId: string; line: string; asker: { name: string; hue: Hue } };

export function StartGame({ game, menu, sets, chrome, signing, mode, closes, existing = {}, ownUnits = [] }: {
  game: GameHeaderData;
  menu: MenuItem[];
  sets: SetOption[];
  chrome: ReactNode;
  signing: { domain: TypedDataDomain; ledgerWallet: string };
  /** Starting fresh, or adding one question to a game already running with these people. */
  mode: { kind: "start" } | { kind: "add"; /** The set it goes to; null where that set already runs it, so it goes to whoever the asker sends it to. */ groupId: string | null; groupLabel: string; key: MenuItem["key"] };
  /** "Sun 1:00pm": when everything closes, in the asker's zone; on a game being played, the words for a close set by the first call (section 5). */
  closes: string;
  /** The menu's questions already on this person's page from another set, by key (3.33): the offer names one before the same is started. */
  existing?: Partial<Record<MenuItem["key"], AlreadyAsked>>;
  /** The asker's own stake units, from You (the touch-ups round). */
  ownUnits?: string[];
}) {
  const router = useRouter();
  const sign = useSigner();
  // Asking what's already asked (3.33, frame 3): the one on the page is offered first, once; "Ask your own" carries on.
  const [offer, setOffer] = useState<AlreadyAsked | null>(mode.kind === "add" ? (existing[mode.key] ?? null) : null);
  const [offered, setOffered] = useState(mode.kind === "add");
  const offerTitle = useId();
  // Starting a game skips "Who's in" (the games-and-the-reveal round, the owner's call): the menu, then the terms.
  const [step, setStep] = useState<"menu" | "terms">(mode.kind === "add" ? "terms" : "menu");
  const [checked, setChecked] = useState<Set<MenuItem["key"]>>(new Set(mode.kind === "add" ? [mode.key] : menu.some((m) => m.key === "home_wins") ? ["home_wins"] : []));
  // Whoever the asker sends it to; adding one keeps the game's own people.
  const who: Who = mode.kind === "add" && mode.groupId ? { kind: "set", groupId: mode.groupId } : { kind: "link" };
  /** A game being played: its questions close five minutes after their first call, never "at first pitch" (the final round, found starting a game on the dev browser). */
  const live = closes === FIRST_CALL_CLOSE;
  const [unit, setUnit] = useState<Unit>({ kind: "usd" });
  /** The asker's own units: those on You, and any made here (the final round, section 6). */
  const [mine, setMine] = useState<string[]>(ownUnits);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [signingStep, setSigningStep] = useState<string | null>(null);
  const selectedSet = who.kind === "set" ? sets.find((s) => s.groupId === who.groupId) : undefined;
  const chosen = menu.filter((m) => checked.has(m.key));
  const units = selectedSet?.units ?? [];

  const unitChip = (u: Unit, label: string, key: string) => {
    const selected = u.kind === unit.kind && (u.kind === "usd" || (u.kind === "existing" && unit.kind === "existing" && u.id === unit.id) || (u.kind === "new" && unit.kind === "new" && u.template === unit.template && (u.template !== null || u.label === unit.label)));
    return (
      <button key={key} type="button" onClick={() => setUnit(u)} {...chipPress(selected)}>
        <Chip size={36} selected={selected} choice>
          {label}
        </Chip>
      </button>
    );
  };

  function send() {
    setProblem(null);
    if (chosen.length === 0) return setProblem("Pick at least one question.");
    startSave(async () => {
      // A send that throws on its way (a phone that lost its network halfway) answers words at the button, never the error card (the first-contact round).
      const r = await attempt(() => startGameAction({ gameId: game.id, keys: chosen.map((m) => m.key), who, unit }));
      if ("error" in r) return setProblem(r.error);
      // The asker's Create signature opens each question for the group; the ledger wallet signs silently, once per question.
      const signed: Array<{ id: string; signature: string }> = [];
      try {
        for (const q of r.toOpen) {
          setSigningStep(q.title);
          const c = q.create;
          const signature = await sign(signing.ledgerWallet, { domain: signing.domain, types: daresTypes, primaryType: "Create", message: { dareId: c.dareId, groupId: c.groupId, kind: c.kind, pace: c.pace, termsHash: c.termsHash, denomId: c.denomId, range: BigInt(c.range), options: c.options, stalemate: c.stalemate, resolvesBy: BigInt(c.resolvesBy) } }, "approve terms", { action: "create", dareId: q.id });
          signed.push({ id: q.id, signature });
        }
      } catch (err) {
        setSigningStep(null);
        // The drafts are saved and listed on the page as the asker's to finish, so nothing typed is lost.
        setProblem(`${signingProblem(err)} The questions are saved as drafts; open the game to finish them.`);
        router.replace(`/on/${game.id}?g=${r.groupId}`);
        return;
      }
      setSigningStep(null);
      const o = await attempt(() => openGameQuestionsAction(signed));
      if ("error" in o) return setProblem(o.error);
      router.replace(`/on/${game.id}?g=${r.groupId}`);
    });
  }

  const caption = mode.kind === "add" && selectedSet ? (
    <span className="flex items-center gap-2">
      <AvatarStack people={selectedSet.avatars.slice(0, 4)} size={26} ring="var(--surface-2)" />
      <span>{mode.groupLabel}</span>
    </span>
  ) : live ? FIRST_CALL_CLOSE : `Everything closes at ${startWord(game.sport)}.`;

  const wrap = (children: ReactNode) => (
    <Screen>
      {chrome}
      <div className="flex flex-col gap-6 py-2">
        <GameHeader game={game} caption={caption} />
        {children}
      </div>
      <Sheet open={offer !== null} onClose={() => setOffer(null)} labelledBy={offerTitle}>
        {offer ? (
          <div className="flex flex-col gap-4" data-already-asked={offer.dareId}>
            <div className="flex items-center gap-3">
              <Avatar name={offer.asker.name} hue={offer.asker.hue} size={28} />
              <h2 id={offerTitle} className="text-body-strong text-ink">
                {offer.line}
              </h2>
            </div>
            <Button variant="primary" onClick={() => router.replace(`/on/${game.id}?q=${offer.dareId}`)}>
              Go to that one
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setOffer(null);
                if (mode.kind === "start") {
                  setUnit({ kind: "usd" });
                  setStep("terms");
                }
              }}
            >
              Ask your own
            </Button>
          </div>
        ) : null}
      </Sheet>
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
              <Button
                variant="primary"
                disabled={chosen.length === 0}
                onClick={() => {
                  setProblem(null);
                  const already = chosen.map((m) => existing[m.key]).find((x): x is AlreadyAsked => Boolean(x));
                  if (already && !offered) {
                    setOffered(true);
                    return setOffer(already);
                  }
                  setUnit({ kind: "usd" });
                  setStep("terms");
                }}
              >
                Set the terms
              </Button>
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
            <dd className="text-body text-ink-2">{live ? FIRST_CALL_CLOSE : `At ${startWord(game.sport)}, ${closes}`}</dd>
          </dl>
        </section>
      ))}
      {/* The one Stakes row, in a card of its own (3.38), since it covers every question started together. */}
      <section className="flex flex-col gap-3 rounded-card border border-line bg-surface px-4 py-[14px]" data-game-stakes="">
        <h2 className="text-label text-ink-3">Stakes{chosen.length > 1 ? `, for all ${chosen.length}` : ""}</h2>
        <div className="flex flex-wrap gap-2">
          {unitChip({ kind: "usd" }, "Dollars", "usd")}
          {units.filter((u) => u.template !== "next_time").map((u) => unitChip({ kind: "existing", id: u.id }, u.template ? `${u.label}s` : `“${u.label}”`, u.id))}
          {PRESETS.filter((p) => !units.some((u) => u.template === p.template)).map((p) => unitChip({ kind: "new", template: p.template, label: p.template }, p.label, p.template))}
          {mine.filter((o) => !units.some((u) => !u.template && u.label.toLowerCase() === o)).map((o) => unitChip({ kind: "new", template: null, label: o }, `“${o}”`, `own-${o}`))}
          <MakeUnit onMade={(label) => (setMine((m) => (m.includes(label) ? m : [...m, label])), setUnit({ kind: "new", template: null, label }))} />
        </div>
        <p className="text-caption text-ink-3">One kind of thing for everyone, fixed now. Dollars and beers can’t be weighed against each other.</p>
      </section>
      {mode.kind === "start" ? (
        <Button variant="tertiary" className="self-start" onClick={() => setStep("menu")} disabled={saving}>
          Back
        </Button>
      ) : null}
      <PinnedSheet
        label="Finish"
        low={
          <>
            <ProblemSummary messages={[problem]} />
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
