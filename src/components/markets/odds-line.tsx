"use client";

import { useId, useRef } from "react";
import { hueVar, type Hue } from "@/lib/ui/hue";
import { band } from "./probability-entry";

/** The thumb travels from 12px to the width minus 12px (3.13), so its centre sits over the segment it fills. */
const thumbLeft = (v: number) => `calc(12px + (100% - 24px) * ${v / 100})`;

/**
 * The odds line (docs/design.md 3.13): the entry control for a yes-or-no market, and the first state of the
 * weight line (3.22). Ten segments, which are the ten buckets the weight line grows into; a thumb only once
 * touched, because a thumb parked at 50% anchors everyone on a coin flip; the riding percent above the thumb so
 * a finger never covers the number being chosen; and the mark riding with it, small and faded at low odds, big
 * and bright at high, before anyone reads a digit.
 *
 * The header row ("What are the odds?" and the word band) is the sheet's drag handle, so the sheet renders it
 * (`OddsHeader`) above this and this is the plot alone. The value is chosen by pointer here, on the drawn line,
 * because a native range does not place its thumb where a finger taps on every phone; the native range is still
 * there, over the line at opacity 0, for the keyboard and the screen reader.
 */
export function OddsLine({
  value,
  onChange,
  mark,
  hue,
  disabled = false,
}: {
  value: number | null;
  onChange: (v: number) => void;
  mark: string | null;
  hue: Hue;
  disabled?: boolean;
}) {
  const id = useId();
  const plot = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const touched = value !== null;
  const v = value ?? 0;
  const t = v / 100;

  function place(clientX: number) {
    const el = plot.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = clientX - r.left - 12;
    const w = Math.max(1, r.width - 24);
    onChange(Math.round(Math.min(100, Math.max(0, (x / w) * 100))));
  }

  return (
    <div className="flex flex-col gap-1 px-1">
      <div
        ref={plot}
        className="relative h-[120px] touch-none select-none"
        onPointerDown={(e) => {
          if (disabled || e.button !== 0) return;
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
          if (disabled || !e.currentTarget.hasPointerCapture?.(e.pointerId))
            return;
          place(e.clientX);
        }}
      >
        {/* The track: ten segments, bottom-aligned 9px above the base, each filling from the left in your hue by its share. */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-[9px] grid grid-cols-10 gap-[3px]"
        >
          {Array.from({ length: 10 }, (_, i) => {
            const fill = Math.max(0, Math.min(1, v / 10 - i));
            return (
              <span
                key={i}
                className="relative h-[6px] overflow-hidden rounded-[3px] bg-line"
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-[3px]"
                  style={{ width: `${fill * 100}%`, background: hueVar(hue) }}
                />
              </span>
            );
          })}
        </div>
        {!touched && mark ? (
          <>
            <span
              aria-hidden="true"
              className="absolute bottom-[30px] left-0 leading-none"
              style={{ fontSize: 18, opacity: 0.35, filter: "saturate(0.1)" }}
            >
              {mark}
            </span>
            <span
              aria-hidden="true"
              className="absolute right-0 bottom-[30px] leading-none"
              style={{ fontSize: 60 }}
            >
              {mark}
            </span>
          </>
        ) : null}
        {touched ? (
          <>
            {mark ? (
              <span
                aria-hidden="true"
                className="absolute bottom-[30px] -translate-x-1/2 leading-none"
                style={{
                  left: thumbLeft(v),
                  fontSize: 18 + 42 * t,
                  opacity: 0.35 + 0.65 * t,
                  filter: `saturate(${0.1 + 0.9 * t})`,
                }}
              >
                {mark}
              </span>
            ) : null}
            <span
              aria-hidden="true"
              className="absolute bottom-0 h-6 w-6 -translate-x-1/2 rounded-pill bg-chalk"
              style={{
                left: thumbLeft(v),
                boxShadow: "0 0 0 3px var(--surface)",
              }}
            />
            <span
              aria-hidden="true"
              className="absolute top-0 flex h-7 -translate-x-1/2 items-center rounded-pill bg-ground px-2 text-numeral font-bold text-ink tabular-nums"
              style={{
                left: thumbLeft(v),
                boxShadow: `inset 0 0 0 1.5px ${hueVar(hue)}`,
              }}
            >
              {v}%
            </span>
          </>
        ) : null}
        <input
          ref={input}
          id={id}
          type="range"
          min={0}
          max={100}
          step={1}
          value={v}
          disabled={disabled}
          aria-label="What are the odds, in percent"
          aria-valuetext={touched ? `${v}%, ${band(v)}` : "not picked yet"}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-x-0 -bottom-[10px] h-11 w-full cursor-pointer opacity-0"
        />
      </div>
      <p
        aria-hidden="true"
        className="flex justify-between text-caption text-ink-3"
      >
        <span>0%</span>
        <span>100%</span>
      </p>
    </div>
  );
}

/** The odds line's header row: the question on the left, the word for the number on the right. */
export function OddsHeader({ value }: { value: number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-body-strong text-ink">What are the odds?</span>
      <span className="text-caption text-ink-2">
        {value === null ? "Slide to answer" : band(value)}
      </span>
    </div>
  );
}
