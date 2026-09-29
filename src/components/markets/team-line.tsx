"use client";

import { useId, useRef, useState } from "react";
import { TeamStamp } from "@/components/ledger/team-stamp";
import { hueVar, type Hue } from "@/lib/ui/hue";
import { leanBand, leanPill, sliderStamps, type TeamFace } from "@/lib/ui/team";
import { withSeparators } from "@/lib/ledger/number-axis";

/** The thumb travels from 12px to the width minus 12px, as on the odds line (3.13). */
const thumbLeft = (t: number) => `calc(12px + (100% - 24px) * ${t})`;

/**
 * The line between two teams (docs/design.md 3.40): the odds line's ten segments with a team stamp at each end,
 * away on the left and home on the right, each growing as the slider leans its way and shrinking as it leans
 * away, equal at the middle; the fill running from the middle to the thumb in your hue, since the choice is
 * which way and how far; a 1px `--ink` tick at the middle; the thumb, the native range and the riding pill the
 * odds line's, the pill naming a team. Nothing starts at the middle: no thumb until it is touched, both stamps
 * at 39px. The same picture carries who wins (v from 0 to 100, the home side's chance) and the margin (a signed
 * number of points, the sport's usual range either way, one step a point, and past an end the number is typed).
 *
 * The plot is a control, so its text is outside the type budget (4.8); the two names under it are captions.
 */
export function TeamLine({ mode, value, onChange, away, home, hue, disabled = false, reach = 35, unit }: {
  mode: "wins" | "margin";
  /** Who wins: a whole percent, or null before any touch. The margin: the signed margin, home minus away, or null. */
  value: number | null;
  onChange: (v: number) => void;
  away: TeamFace;
  home: TeamFace;
  hue: Hue;
  disabled?: boolean;
  /** The margin's reach either way on the line (3.40): 35 for football, 30 for basketball, 8 for baseball, 5 for hockey. */
  reach?: number;
  /** The margin's unit, for a typed number's words. */
  unit?: { singular: string; plural: string };
}) {
  const id = useId();
  const plot = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [typing, setTyping] = useState(false);
  const [typedSide, setTypedSide] = useState<"away" | "home">("home");
  const [typed, setTyped] = useState("");
  const touched = value !== null;
  const min = mode === "wins" ? 0 : -reach;
  const max = mode === "wins" ? 100 : reach;
  // Where the thumb sits along the line, 0 to 1; a margin past an end sits on that end.
  const clamped = value === null ? null : Math.min(max, Math.max(min, value));
  const t = clamped === null ? 0.5 : (clamped - min) / (max - min);
  const stamps = sliderStamps(t);
  const pill = value === null ? "" : mode === "wins" ? leanPill(value, away.name, home.name) : value === 0 ? "A tie" : value > 0 ? `${home.name} by ${withSeparators(BigInt(value))}` : `${away.name} by ${withSeparators(BigInt(-value))}`;

  function place(clientX: number) {
    const el = plot.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = clientX - r.left - 12;
    const w = Math.max(1, r.width - 24);
    onChange(Math.round(min + Math.min(1, Math.max(0, x / w)) * (max - min)));
  }

  /** Past an end the number is typed (3.40): the pill becomes a numeric field with a two-way choice of team under it. */
  const typedNumber = () => {
    const n = /^\d{1,9}$/.test(typed) ? Number(typed) : null;
    return n === null ? null : typedSide === "home" ? n : -n;
  };

  return (
    <div className="flex flex-col gap-1 px-1" data-team-line={mode}>
      <div
        ref={plot}
        className="relative h-[120px] touch-none select-none"
        onPointerDown={(e) => {
          if (disabled || typing || e.button !== 0) return;
          e.preventDefault();
          place(e.clientX);
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // No active pointer to capture (a synthetic event): the drag still reads from this plot.
          }
          input.current?.focus({ preventScroll: true });
        }}
        onPointerMove={(e) => {
          if (disabled || typing || !e.currentTarget.hasPointerCapture?.(e.pointerId)) return;
          place(e.clientX);
        }}
      >
        {/* The track: ten segments, bottom-aligned 9px above the base; the fill runs from the middle toward the thumb in your hue. */}
        <div aria-hidden="true" className="absolute inset-x-0 bottom-[9px] grid grid-cols-10 gap-[3px]">
          {Array.from({ length: 10 }, (_, i) => {
            // Segment i covers [i/10, (i+1)/10]; the fill covers [min(t, 0.5), max(t, 0.5)].
            const lo = Math.min(t, 0.5);
            const hi = Math.max(t, 0.5);
            const from = Math.max(0, Math.min(1, (lo - i / 10) * 10));
            const to = Math.max(0, Math.min(1, (hi - i / 10) * 10));
            const width = touched && to > from ? (to - from) * 100 : 0;
            return (
              <span key={i} className="relative h-[6px] overflow-hidden rounded-[3px] bg-line">
                <span className="absolute inset-y-0 rounded-[3px]" style={{ left: `${from * 100}%`, width: `${width}%`, background: hueVar(hue) }} />
              </span>
            );
          })}
        </div>
        {/* The middle: a 1px ink tick at half opacity, 16px tall. */}
        <span aria-hidden="true" className="absolute bottom-[4px] left-1/2 h-4 w-px -translate-x-1/2 bg-ink opacity-50" />
        {/* The two stamps, bottom-anchored 30px above the base, sized by the lean: size only, never fading. */}
        <span aria-hidden="true" className="absolute bottom-[30px] left-0 flex items-end">
          <TeamStamp team={away} size={stamps.left} />
        </span>
        <span aria-hidden="true" className="absolute right-0 bottom-[30px] flex items-end">
          <TeamStamp team={home} size={stamps.right} />
        </span>
        {touched ? (
          <>
            <span aria-hidden="true" className="absolute bottom-0 h-6 w-6 -translate-x-1/2 rounded-pill bg-chalk" style={{ left: thumbLeft(t), boxShadow: "0 0 0 3px var(--surface)" }} />
            {typing ? null : (
              <button
                type="button"
                disabled={disabled || mode === "wins"}
                aria-label={mode === "margin" ? `${pill}. Tap to type a margin` : pill}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  if (mode !== "margin") return;
                  setTypedSide(value !== null && value < 0 ? "away" : "home");
                  setTyped(value === null ? "" : String(Math.abs(value)));
                  setTyping(true);
                }}
                className="absolute top-0 flex h-7 -translate-x-1/2 items-center whitespace-nowrap rounded-pill bg-ground px-2 text-numeral font-bold text-ink tabular-nums"
                style={{ left: `clamp(48px, ${thumbLeft(t)}, calc(100% - 48px))`, boxShadow: `inset 0 0 0 1.5px ${hueVar(hue)}` }}
              >
                {pill}
              </button>
            )}
          </>
        ) : null}
        <input
          ref={input}
          id={id}
          type="range"
          min={min}
          max={max}
          step={1}
          value={clamped ?? Math.round((min + max) / 2)}
          disabled={disabled || typing}
          aria-label={mode === "wins" ? "Who wins, as the home side's chance in percent" : "By how much, home minus away"}
          aria-valuetext={touched && value !== null ? (mode === "wins" ? `${pill}, ${leanBand(value, away.name, home.name)}` : pill) : "not picked yet"}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-x-0 -bottom-[10px] h-11 w-full cursor-pointer opacity-0"
        />
      </div>
      <p aria-hidden="true" className="flex justify-between text-caption text-ink-3">
        <span>{mode === "wins" ? away.name : `${away.name} by ${reach}+`}</span>
        <span>{mode === "wins" ? "Even" : "Tie"}</span>
        <span>{mode === "wins" ? home.name : `${home.name} by ${reach}+`}</span>
      </p>
      {mode === "margin" ? (
        typing ? (
          <div className="flex flex-col gap-2" data-margin-typed="">
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Which team">
              {(["away", "home"] as const).map((side) => (
                <button key={side} type="button" aria-pressed={typedSide === side} onClick={() => setTypedSide(side)} className={`flex h-11 items-center justify-center gap-2 rounded-button border text-[15px] font-semibold ${typedSide === side ? "border-ink bg-ink text-ground" : "border-line-strong text-ink-2"}`}>
                  <TeamStamp team={side === "away" ? away : home} size={20} />
                  {side === "away" ? away.name : home.name} by
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                autoFocus
                value={typed}
                aria-label={`${typedSide === "away" ? away.name : home.name} by how many ${unit?.plural ?? "points"}`}
                onChange={(e) => setTyped(e.target.value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "").slice(0, 9))}
                className="h-12 min-w-0 flex-1 rounded-button border border-line bg-ground px-4 font-serif text-[28px] text-ink tabular-nums"
              />
              <button
                type="button"
                disabled={typedNumber() === null}
                onClick={() => {
                  const n = typedNumber();
                  if (n === null) return;
                  onChange(n);
                  setTyping(false);
                }}
                className="h-12 rounded-button bg-chalk px-5 text-[15px] font-bold text-on-chalk disabled:border disabled:border-line disabled:bg-transparent disabled:text-ink-3"
              >
                Use it
              </button>
              <button type="button" onClick={() => setTyping(false)} className="h-12 px-2 text-[15px] font-semibold text-ink-2">
                Never mind
              </button>
            </div>
          </div>
        ) : (
          <p className="text-caption text-ink-3">Any margin. Tap the number to type one.</p>
        )
      ) : null}
    </div>
  );
}

/** The line's header row (3.40): "Who wins?" or "By how much?" on the left, and the word band or "Slide to pick a side" on the right. */
export function TeamHeader({ mode, value, away, home }: { mode: "wins" | "margin"; value: number | null; away: TeamFace; home: TeamFace }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-body-strong text-ink">{mode === "wins" ? "Who wins?" : "By how much?"}</span>
      <span className="text-caption text-ink-2">{value === null ? "Slide to pick a side" : mode === "wins" ? leanBand(value, away.name, home.name) : ""}</span>
    </div>
  );
}
