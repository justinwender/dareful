"use client";

import { useEffect, useId, useRef, useState } from "react";
import { withSeparators } from "@/lib/ledger/number-axis";
import { hueVar, type Hue } from "@/lib/ui/hue";

/** Whole numbers from 0 to 999,999,999 (docs/design.md 3.26). */
export const MAX_DIGITS = 9;
const HOLD_AFTER_MS = 400;
const HOLD_EVERY_MS = 100;

/** The numeral shrinks to fit as digits are added, from 60px to a floor of 28px; past that the unit drops beneath. */
export function numeralSize(digits: number): { px: number; unitBelow: boolean } {
  const px = digits <= 4 ? 60 : Math.max(28, 60 - (digits - 4) * 8);
  return { px, unitBelow: digits > 8 };
}

/**
 * Number entry (docs/design.md 3.26): a 48px stepper, an 84px field and a 48px stepper, in the sheet. The field
 * is the market's ground with a 1.5px inset ring in your hue and the number in `numeral-hero`, the unit beside
 * it, baseline-aligned. A text input with `inputmode="numeric"`, never `type="number"`, which accepts decimals
 * and exponents and changes value under a scroll wheel. Nothing is prefilled, for the reason the odds line has
 * no thumb until it is touched: before any input the field shows a cream caret and no number, minus is
 * disabled, and plus from empty starts at 1. Holding a stepper repeats after 400ms, ten steps a second.
 *
 * The field is a control, so its sizes are literal here and do not count toward the screen's budget (1.2).
 */
export function NumberEntry({ value, onChange, unit, hue, disabled = false, header = "What’s your number?", label }: { value: bigint | null; onChange: (v: bigint | null) => void; unit: { singular: string; plural: string }; hue: Hue; disabled?: boolean; header?: string | null; label?: string }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const hold = useRef<{ start: ReturnType<typeof setTimeout> | null; every: ReturnType<typeof setInterval> | null }>({ start: null, every: null });
  const [text, setText] = useState(value === null ? "" : value.toString());
  // The number comes back from the server as the saved value; the field follows it when it changes underneath (derived state, in render).
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value === null ? text !== "" : text === "" || BigInt(text) !== value) setText(value === null ? "" : value.toString());
  }

  const digits = text.length;
  const { px, unitBelow } = numeralSize(digits);
  const shown = text === "" ? "" : withSeparators(BigInt(text));
  const unitWord = value === 1n ? unit.singular : unit.plural;

  function set(next: bigint | null) {
    if (next !== null && next < 0n) next = 0n;
    if (next !== null && next.toString().length > MAX_DIGITS) return;
    setText(next === null ? "" : next.toString());
    onChange(next);
  }
  const step = (by: 1n | -1n) => set(value === null ? (by > 0n ? 1n : null) : value + by);
  function stopHold() {
    if (hold.current.start) clearTimeout(hold.current.start);
    if (hold.current.every) clearInterval(hold.current.every);
    hold.current = { start: null, every: null };
  }
  function startHold(by: 1n | -1n) {
    stopHold();
    step(by);
    hold.current.start = setTimeout(() => {
      hold.current.every = setInterval(() => step(by), HOLD_EVERY_MS);
    }, HOLD_AFTER_MS);
  }
  useEffect(() => stopHold, []);

  const stepper = (by: 1n | -1n) => (
    <button
      type="button"
      aria-label={by > 0n ? "One more" : "One fewer"}
      disabled={disabled || (by < 0n && (value === null || value <= 0n))}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        startHold(by);
      }}
      onPointerUp={stopHold}
      onPointerLeave={stopHold}
      onPointerCancel={stopHold}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          step(by);
        }
      }}
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-button border border-line-strong text-ink-2 disabled:border-line disabled:text-ink-3"
    >
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M4 10h12" />
        {by > 0n ? <path d="M10 4v12" /> : null}
      </svg>
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      {header ? (
        <label htmlFor={id} className="text-[17px] font-semibold leading-[22px] text-ink">
          {header}
        </label>
      ) : null}
      <div className="flex items-center gap-3">
        {stepper(-1n)}
        <div className={`flex min-h-[84px] min-w-0 flex-1 items-baseline gap-2 rounded-button bg-ground px-4 py-3 ${unitBelow ? "flex-col gap-0" : ""}`} style={{ boxShadow: `inset 0 0 0 1.5px ${hueVar(hue)}` }}>
          <div className="relative min-w-0 flex-1">
            {/* What is seen: the number with its separators. The input beneath carries the digits and the caret. */}
            <span aria-hidden="true" className="pointer-events-none block truncate font-serif tabular-nums text-ink" style={{ fontSize: px, lineHeight: 1, minHeight: px }}>
              {shown}
            </span>
            <input
              ref={input}
              id={id}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              value={text}
              disabled={disabled}
              aria-label={label ?? header ?? "Your number"}
              onChange={(e) => {
                const t = e.target.value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "").slice(0, MAX_DIGITS);
                setText(t);
                onChange(t === "" ? null : BigInt(t));
              }}
              className="absolute inset-0 w-full bg-transparent font-serif tabular-nums text-transparent caret-ink outline-none"
              style={{ fontSize: px, lineHeight: 1, caretColor: "var(--ink)" }}
            />
          </div>
          <span className="shrink-0 text-[17px] leading-[22px] text-ink-2">{unitWord}</span>
        </div>
        {stepper(1n)}
      </div>
      <p className="text-[13px] leading-[18px] text-ink-3">Any whole number. Tap it to type.</p>
    </div>
  );
}
