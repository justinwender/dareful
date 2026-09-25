"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ledger/avatar";
import { Chip } from "@/components/ledger/chip";
import { ProblemSummary } from "@/components/ledger/problem";
import { signingProblem, useSigner } from "@/components/ledger/use-signer";
import { Button } from "@/components/ui/button";
import { enterMarketAction, openMarketAction } from "@/lib/actions/markets";
import { daresTypes } from "@/lib/chain/typed-data";
import type { Hue } from "@/lib/ui/hue";
import { cn } from "@/lib/utils";
import { band } from "./probability-entry";
import type { Signing, StakeUnit } from "./market-actions";

export type StageBucket = { n: number; heightPermille: number; noStake: number };
export type StagePicture =
  | { kind: "weights"; buckets: StageBucket[]; mySharePermille: number; groupTenth: number | null; groupPercent: number | null; riding: string; caption: string }
  /** Blind until lock: who is in, never where. No heights and no group's number, since an aggregate leaks the shape. */
  | { kind: "blind"; inCount: number; ofCount: number };

const STAKES_MONEY = [500, 1000, 2000, 5000];
const STAKES_COUNT = [1, 2, 3, 5];
const HUE_VAR: Record<Hue, string> = { lilac: "var(--person-lilac)", aqua: "var(--person-aqua)", orchid: "var(--person-orchid)", sky: "var(--person-sky)", sand: "var(--person-sand)", stone: "var(--person-stone)" };
const tenthOfPercent = (p: number) => Math.round(p / 10);
const inTen = (p: number) => `${p % 10 === 0 ? "" : "about "}${tenthOfPercent(p)} in 10`;

/**
 * docs/design.md 3.13 and 3.22: the entry control and the picture of where everyone landed are one object in two
 * states. Choosing is a 5 by 2 grid of 56px tiles filling cumulatively, thumb-sized because it is a control.
 * Reading is one row of ten columns, 120px tall, filling per tenth by how much is riding there. The change of
 * geometry is deliberate and carries the change of meaning, and someone who never saw it move still gets the
 * label, the numerals with theirs picked out, their avatar over their column, and a caption saying in words what
 * the picture says in shapes.
 *
 * Submitting does not navigate and raises no toast. What confirms it is the line at the top, which is still
 * there on the next visit: "You're in at 7 in 10".
 */
export function NumberStage(props: {
  dareId: string;
  signing: Signing;
  unit: StakeUnit;
  state: "draft" | "open" | "locked";
  me: { name: string; hue: Hue };
  mine: { percent: number; stake: string; stakeWords: string } | null;
  picture: StagePicture | null;
  mark: string | null;
  /** Who is in, before this person has picked: names only, and the group's number stays hidden until they pick. */
  othersIn: string[];
  lockedLine: string | null;
  /** An argument: which side this person starts on, all the way, and which side is already taken. */
  argument?: { defaultPercent: number; otherSays: { name: string; side: "yes" | "no" } | null } | null;
}) {
  const { dareId, signing, unit, state, me, mine, picture, mark } = props;
  const router = useRouter();
  const sign = useSigner();
  const [changing, setChanging] = useState(false);
  const [value, setValue] = useState(mine?.percent ?? props.argument?.defaultPercent ?? 50);
  const [touched, setTouched] = useState(Boolean(mine) || Boolean(props.argument));
  const [stake, setStake] = useState<string>(mine?.stake ?? (unit.quantifiable ? String(unit.monetary ? 1000 : 1) : "1"));
  const [custom, setCustom] = useState("");
  const [step, setStep] = useState<"idle" | "approving" | "sending">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  /** Set the moment an entry lands, so the grid becomes the row before the server's picture arrives. */
  const [justIn, setJustIn] = useState<{ percent: number } | null>(null);

  const reading = (mine !== null || justIn !== null) && !changing;
  const myPercent = reading ? (justIn?.percent ?? mine?.percent ?? value) : value;
  const myBucket = Math.max(1, Math.ceil(myPercent / 10));

  // FLIP: remember where the ten elements were, and when the layout changes play them from there. Two rows merge
  // into one line in 200ms. With reduced motion nothing plays and the resting state is simply there.
  const cells = useRef<Array<HTMLElement | null>>([]);
  const before = useRef<DOMRect[] | null>(null);
  const wasReading = useRef(reading);
  useLayoutEffect(() => {
    const now = cells.current.map((c) => c?.getBoundingClientRect() ?? new DOMRect());
    const moved = wasReading.current !== reading;
    wasReading.current = reading;
    if (moved && before.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      cells.current.forEach((el, i) => {
        const a = before.current?.[i];
        const b = now[i];
        if (!el || !a || !b || b.width === 0 || b.height === 0) return;
        el.animate([{ transformOrigin: "top left", transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})` }, { transformOrigin: "top left", transform: "none" }], { duration: 200, easing: "ease-out" });
      });
    }
    before.current = now;
  });
  // Heights rise from the baseline after the merge: mine first, everyone else's staggered, the marker last.
  // Someone arriving already in gets the resting picture at once; only a fresh entry plays.
  const [risenFor, setRisenFor] = useState<"arrived" | "played" | null>(mine !== null ? "arrived" : null);
  const risen = reading && risenFor !== null;
  useEffect(() => {
    if (!reading) return;
    const t = setTimeout(() => setRisenFor((r) => r ?? "played"), 20);
    return () => {
      clearTimeout(t);
      setRisenFor(null);
    };
  }, [reading]);

  async function submit() {
    setProblem(null);
    const stakeUnits = custom.trim() ? customStake(custom, unit.monetary) : stake;
    // The contract refuses a stake of nothing, and one refused position fails the whole lock for everyone, so
    // the least anyone can put on it is one (docs/decisions.md 2026-09-20).
    if (!stakeUnits || BigInt(stakeUnits) <= 0n) return setProblem(unit.monetary ? "Put an amount on it, like 10." : "Put at least one on it.");
    const valueBps = value * 100;
    try {
      setStep("approving");
      let createSignature: `0x${string}` | null = null;
      if (state === "draft") {
        if (!signing.create) throw new Error("missing terms");
        const c = signing.create;
        createSignature = await sign(signing.ledgerWallet, { domain: signing.domain, types: daresTypes, primaryType: "Create", message: { dareId: signing.dareOnchainId, groupId: c.groupId, kind: c.kind, pace: c.pace, termsHash: c.termsHash, denomId: c.denomId, range: BigInt(c.range), options: c.options, stalemate: signing.stalemate, resolvesBy: BigInt(c.resolvesBy) } }, "approve terms");
      }
      const enterSignature = await sign(signing.ledgerWallet, { domain: signing.domain, types: daresTypes, primaryType: "Enter", message: { dareId: signing.dareOnchainId, stake: BigInt(stakeUnits), value: BigInt(valueBps), confidenceBps: 0, stalemate: signing.stalemate } }, "approve number");
      setStep("sending");
      const position = { stake: stakeUnits, valueBps };
      const r = createSignature ? await openMarketAction(dareId, createSignature, position, enterSignature) : await enterMarketAction(dareId, position, enterSignature);
      if ("error" in r) {
        // docs/design.md 3.14: the entry screen stays, and the number is never silently dropped.
        setProblem(`Your number didn't send. ${r.error}`);
        setStep("idle");
        return;
      }
      setJustIn({ percent: value });
      setChanging(false);
      setStep("idle");
      router.refresh();
    } catch (err) {
      setProblem(signingProblem(err));
      setStep("idle");
    }
  }

  const weights = reading && picture?.kind === "weights" ? picture : null;
  const blind = reading && picture?.kind === "blind" ? picture : null;
  const stakeLine = justIn && !mine ? "" : (mine?.stakeWords ?? "");

  return (
    <section className="flex flex-col gap-5" aria-label={reading ? "Where the stake sits" : "Your number"}>
      {reading ? (
        <div className="flex items-center gap-3">
          <Avatar name={me.name} hue={me.hue} size={36} />
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="text-body-strong text-ink">You’re in at {inTen(myPercent)}</p>
            <p className="text-caption text-ink-3">{[stakeLine, state === "locked" ? props.lockedLine : "yours to change until it closes"].filter(Boolean).join(" · ")}</p>
          </div>
          {state !== "locked" ? (
            <Button
              variant="tertiary"
              onClick={() => {
                setValue(myPercent);
                setTouched(false);
                setChanging(true);
              }}
            >
              Change
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-2">
            {value % 10 !== 0 ? <span className="text-body-sm text-ink-2">about</span> : null}
            <span className="text-numeral-hero text-ink">{tenthOfPercent(value)}</span>
            <span className="text-serif-l text-ink-2">in 10</span>
          </div>
          <div className="text-right">
            <p className="text-body-strong text-ink">{band(value)}</p>
            <p className="text-caption text-ink-3">{value}%</p>
          </div>
        </div>
      )}

      {!reading && props.argument ? (
        <div className="flex flex-col gap-3">
          {props.argument.otherSays ? <p className="text-body text-ink">{props.argument.otherSays.name} says {props.argument.otherSays.side}. You’re taking the other side.</p> : null}
          <div role="group" aria-label="Your side" className="flex gap-2">
            {([100, 0] as const).map((v) => (
              <button key={v} type="button" aria-pressed={value === v} onClick={() => setValue(v)} className="rounded-pill">
                <Chip size={36} selected={value === v}>
                  {v === 100 ? "Yes, all the way" : "No, all the way"}
                </Chip>
              </button>
            ))}
          </div>
          <p className="text-caption text-ink-3">All the way means whoever’s wrong is out the whole thing. Less sure? Soften it below, and it’s scored by how close you were.</p>
        </div>
      ) : null}

      {reading ? (
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-label text-ink-2">Where the stake sits</h2>
          {weights ? <span className="text-caption text-ink-3">{weights.riding}</span> : null}
        </div>
      ) : null}

      <div className="relative">
        {weights && weights.groupPercent !== null && weights.groupTenth !== null ? (
          <div aria-hidden="true" className="pointer-events-none absolute top-0 z-10 flex h-[146px] -translate-x-1/2 flex-col items-center transition-opacity duration-200" style={{ left: `${Math.min(98, Math.max(2, weights.groupPercent))}%`, opacity: risen ? 1 : 0, transitionDelay: risen ? "420ms" : "0ms" }}>
            <span className="flex h-[22px] items-center whitespace-nowrap rounded-pill bg-ink px-2 text-label text-ground">{weights.groupTenth} in 10</span>
            <span className="w-[2px] flex-1 bg-ink" />
          </div>
        ) : null}
        <div className={cn(reading ? "grid grid-cols-10 gap-[3px] pt-[26px]" : "grid grid-cols-5 gap-2")} role={reading ? "img" : "group"} aria-label={reading ? (weights ? weights.caption : blind ? `${blind.inCount} of ${blind.ofCount} in. Numbers show when everyone's in.` : `You're in at ${inTen(myPercent)}`) : "Pick a number from 1 to 10"}>
          {Array.from({ length: 10 }, (_, i) => {
            const n = i + 1;
            const isMine = reading && n === myBucket;
            if (!reading) {
              const fill = Math.max(0, Math.min(1, value / 10 - i));
              return (
                <button
                  key={n}
                  ref={(el) => void (cells.current[i] = el)}
                  type="button"
                  aria-label={`${n} in 10`}
                  aria-pressed={tenthOfPercent(value) === n}
                  onClick={() => {
                    setValue(n * 10);
                    setTouched(true);
                  }}
                  className="relative h-14 overflow-hidden rounded-button border border-line-strong bg-surface"
                >
                  <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-person-lilac" style={{ width: `${fill * 100}%` }} />
                  <span className="relative z-[1] flex h-full items-center justify-center">{mark ? <span style={{ fontSize: 22, opacity: fill > 0 ? 1 : 0.4 }}>{mark}</span> : <span className="text-numeral-sm" style={{ color: fill >= 0.5 ? "var(--avatar-ink)" : "var(--ink-3)" }}>{n}</span>}</span>
                </button>
              );
            }
            const b = weights?.buckets[i];
            const height = weights ? (b?.heightPermille ?? 0) / 10 : justIn && isMine && !blind ? 100 : 0;
            const share = weights && isMine ? weights.mySharePermille / 10 : !weights && isMine && !blind ? 100 : 0;
            return (
              <div key={n} ref={(el) => void (cells.current[i] = el)} className={cn("relative h-[120px] rounded-column", blind ? "border border-line-strong" : "bg-surface")}>
                {isMine ? (
                  <span className="absolute left-1/2 z-[2] -translate-x-1/2 transition-[bottom] duration-[240ms] ease-out" style={{ bottom: `calc(${risen ? Math.max(height, blind ? 0 : 4) : 0}% + ${blind ? 11 : 6}px)` }}>
                    <Avatar name={me.name} hue={me.hue} size={24} ring="var(--ground)" />
                  </span>
                ) : null}
                {!blind ? (
                  <>
                    <span aria-hidden="true" className="absolute inset-x-0 bottom-0 rounded-column bg-market-ink transition-[height] ease-out" style={{ height: `${risen ? height : 0}%`, transitionDuration: "320ms", transitionDelay: risen && !isMine ? `${240 + i * 30}ms` : "0ms" }} />
                    {isMine ? <span aria-hidden="true" className="absolute inset-x-0 bottom-0 rounded-column transition-[height] duration-[240ms] ease-out" style={{ height: `${risen ? share : 0}%`, background: HUE_VAR[me.hue] }} /> : null}
                    {Array.from({ length: Math.min(b?.noStake ?? 0, 3) }, (_, k) => (
                      <span key={k} aria-hidden="true" className="absolute left-1/2 h-2 w-2 -translate-x-1/2 rounded-pill border border-ink-2 bg-ground" style={{ bottom: 2 + k * 10 }} />
                    ))}
                  </>
                ) : isMine ? (
                  <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[5px] rounded-b-column" style={{ background: HUE_VAR[me.hue] }} />
                ) : null}
              </div>
            );
          })}
        </div>
        {blind ? (
          <span className="pointer-events-none absolute inset-x-0 top-[26px] flex h-[120px] items-center justify-center">
            <span className="inline-flex h-7 items-center gap-1.5 rounded-pill border border-line-strong bg-ground px-3 text-caption text-ink-2">
              <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              Numbers show when everyone’s in
            </span>
          </span>
        ) : null}
        {reading ? (
          <div aria-hidden="true" className="mt-2 grid grid-cols-10 gap-[3px] text-center text-caption tabular-nums">
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} className={i + 1 === myBucket ? "font-semibold text-ink" : "text-ink-3"}>
                {i + 1}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {reading ? (
        <div className="flex flex-col gap-2">
          <p className="flex justify-between text-caption text-ink-3">
            <span>Not once</span>
            <span>Every time</span>
          </p>
          <p className="text-caption text-ink-3">{weights ? weights.caption : blind ? `${blind.inCount} of ${blind.ofCount} in.` : "One moment."}</p>
        </div>
      ) : (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-label text-ink-3">Fine-tune</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={value}
              onChange={(e) => {
                setValue(Number(e.target.value));
                setTouched(true);
              }}
              className="h-11 w-full"
              style={{ accentColor: "var(--person-lilac)" }}
            />
            <span className="flex justify-between text-caption text-ink-3">
              <span>Not once</span>
              <span>Every time</span>
            </span>
          </label>

          {props.othersIn.length > 0 && !changing ? (
            <p className="text-body-sm text-ink-2">{props.othersIn.length === 1 ? "One friend is in." : "A few friends are in."}</p>
          ) : null}

          <div className="flex flex-col gap-3">
            <h2 className="text-label text-ink-3">What’s riding on it</h2>
            {unit.quantifiable ? (
              <div className="flex flex-wrap items-center gap-2">
                {(unit.monetary ? STAKES_MONEY : STAKES_COUNT).map((o) => (
                  <button key={o} type="button" onClick={() => (setStake(String(o)), setCustom(""))} className="rounded-pill">
                    <Chip size={36} selected={!custom && stake === String(o)}>
                      {unit.monetary ? `$${o / 100}` : `${o} ${o === 1 ? unit.singular : unit.plural}`}
                    </Chip>
                  </button>
                ))}
                <input inputMode={unit.monetary ? "decimal" : "numeric"} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={unit.monetary ? "other $" : "other"} aria-label="Another amount" className="h-9 w-24 rounded-pill border border-line-strong bg-transparent px-3 text-caption text-ink placeholder:text-ink-3" />
              </div>
            ) : (
              <p className="text-body-sm text-ink-2">One {unit.singular}, the same for everyone. Whoever was furthest off has got whoever was closest.</p>
            )}
            <p className="text-caption text-ink-3">The most you can be out is what you put on it.</p>
            <p className="text-caption text-ink-3">You only settle with people who land closer than you, and only by the gap between your numbers.</p>
          </div>
          <ProblemSummary messages={[problem]} />
          <div className="flex flex-col gap-1">
            <Button variant={changing ? "secondary" : "primary"} onClick={submit} loading={step !== "idle"}>
              {state === "draft" ? "Looks right. I’m in" : changing ? "Change my number" : "I’m in"}
            </Button>
            {changing ? (
              <Button variant="tertiary" onClick={() => setChanging(false)} disabled={step !== "idle"}>
                Keep it as it is
              </Button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function customStake(input: string, monetary: boolean): string | null {
  if (!monetary) return /^\d{1,6}$/.test(input.trim()) ? input.trim() : null;
  const m = /^\s*\$?\s*(\d{1,6})(?:\.(\d{1,2}))?\s*$/.exec(input);
  if (!m) return null;
  return (BigInt(m[1] ?? "0") * 100n + BigInt((m[2] ?? "").padEnd(2, "0"))).toString();
}
