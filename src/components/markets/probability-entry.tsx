"use client";

import { Avatar } from "@/components/ledger/avatar";

/** The word for a number (docs/design.md 3.13). A band, never a verdict. */
export function band(percent: number): string {
  if (percent <= 0) return "Not a chance";
  if (percent <= 15) return "Doubt it";
  if (percent <= 40) return "Probably not";
  if (percent <= 59) return "Coin flip";
  if (percent <= 84) return "Probably";
  if (percent <= 99) return "Almost surely";
  return "Every single time";
}

/**
 * docs/design.md 3.13. Ten tiles filled left to right in the viewer's lilac, a native range under them for the
 * fine tune, and a readout above: "about 6 in 10", the band word, and the percent. The suggested number is a
 * card with its own "Start at N" button, never a default; the group's average shows only once the person has
 * picked, and never in a blind market.
 */
export function ProbabilityEntry({ value, onChange, touched, locked = false, mark, suggestion, average }: {
  value: number;
  onChange: (v: number) => void;
  /** Whether the person has moved the number themselves yet. */
  touched: boolean;
  locked?: boolean;
  mark?: string | null;
  suggestion?: { percent: number; rationale: string | null } | null;
  /** `hidden`: people are in, and their average shows once this person picks. `shown`: the number. */
  average?: { kind: "hidden"; names: string[] } | { kind: "shown"; percent: number; names: string[] } | null;
}) {
  const tens = value / 10;
  const whole = Math.round(tens);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-2">
          {value % 10 !== 0 ? <span className="text-body-sm text-ink-2">about</span> : null}
          <span className="text-numeral-hero text-ink">{whole}</span>
          <span className="font-serif text-[26px] leading-none text-ink-2">in 10</span>
        </div>
        <div className="text-right">
          <p className="text-body-strong text-ink">{band(value)}</p>
          <p className="text-caption text-ink-3">{value}%</p>
        </div>
      </div>

      <div className="relative grid grid-cols-5 gap-2" style={{ opacity: locked ? 0.6 : 1 }}>
        {Array.from({ length: 10 }, (_, i) => {
          const fill = Math.max(0, Math.min(1, tens - i));
          return (
            <button
              key={i}
              type="button"
              disabled={locked}
              aria-label={`${(i + 1) * 10} percent`}
              onClick={() => onChange((i + 1) * 10)}
              className="relative h-14 overflow-hidden rounded-[12px] border border-line-strong bg-surface"
            >
              <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-person-lilac" style={{ width: `${fill * 100}%` }} />
              <span className="relative z-10 flex h-full items-center justify-center">
                {mark ? <span style={{ fontSize: 22, opacity: fill > 0 ? 1 : 0.4 }}>{mark}</span> : <span className="text-numeral-sm" style={{ color: fill >= 0.5 ? "#1D1608" : "var(--ink-3)" }}>{i + 1}</span>}
              </span>
            </button>
          );
        })}
        {average?.kind === "shown" ? (
          <span aria-hidden="true" className="pointer-events-none absolute -bottom-1.5 h-3 w-3 -translate-x-1/2 rounded-pill border border-line-strong bg-ground" style={{ left: `${average.percent}%` }} />
        ) : null}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-label text-ink-3">{locked ? "Numbers are locked" : "Fine-tune"}</span>
        <input type="range" min={0} max={100} step={1} value={value} disabled={locked} onChange={(e) => onChange(Number(e.target.value))} className="h-11 w-full" style={{ accentColor: "#B9A5F3" }} />
        <span className="flex justify-between text-caption text-ink-3">
          <span>Not once</span>
          <span>Every time</span>
        </span>
      </label>

      {suggestion && !touched && !locked ? (
        <div className="flex items-center justify-between gap-3 rounded-card border border-dashed border-line-strong px-4 py-3">
          <p className="text-body-sm text-ink-2">
            <span className="text-body-strong text-ink">The app says {suggestion.percent}.</span> {suggestion.rationale ?? ""} Argue with it.
          </p>
          <button type="button" onClick={() => onChange(suggestion.percent)} className="h-11 shrink-0 px-2 text-[15px] font-semibold text-ink-2">
            Start at {suggestion.percent}
          </button>
        </div>
      ) : null}

      {average && average.names.length > 0 ? (
        <div className="flex items-center gap-3">
          <span className="flex -space-x-2">
            {average.names.slice(0, 3).map((n, i) => (
              <Avatar key={i} name={n} hue={(["aqua", "orchid", "sky"] as const)[i % 3] ?? "stone"} size={24} ring="var(--ground)" />
            ))}
          </span>
          <p className="text-body-sm text-ink-2">
            {average.kind === "hidden"
              ? `${average.names.length === 1 ? "1 friend is" : `${average.names.length} friends are`} in. Their average shows once you pick.`
              : `${average.names.length === 1 ? "1 friend is" : `${average.names.length} friends are`} in, averaging `}
            {average.kind === "shown" ? <span className="text-numeral-sm text-ink">{average.percent}</span> : null}
          </p>
        </div>
      ) : null}
    </div>
  );
}
