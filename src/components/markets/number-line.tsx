"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/ledger/avatar";
import type { NumberLineAxis } from "@/lib/ledger/number-axis";
import { hueVar, type Hue } from "@/lib/ui/hue";

/**
 * The weight line for a number market (docs/design.md 3.22 "Number markets"): the same row of columns, on an
 * axis taken from what people entered. A narrow spread gets a column per whole number, a wide one ten slices;
 * one far-off entry becomes an overflow column 6px past the end, labelled with its value and an arrow; the
 * marker is the group's number, the stake-weighted median, which is always one of the entries and so always
 * stands on a column, an off-axis one included. The scoring scale never draws anything here.
 *
 * Blind (3.22): a blind number market draws no axis before the reveal, because the ends alone would say what
 * range everyone else picked. This component is not rendered for one; the stage shows the entry line, the lock
 * chip and the count instead.
 */
export function NumberLine({ axis, me, heading, caption, rise = false }: { axis: NumberLineAxis; me: { name: string; hue: Hue; value: string; stake: string } | null; heading: string; caption: string; rise?: boolean }) {
  const [risen, setRisen] = useState(!rise);
  useEffect(() => {
    if (!rise) return;
    const t = setTimeout(() => setRisen(true), 20);
    return () => clearTimeout(t);
  }, [rise]);
  const myValue = me ? BigInt(me.value) : null;
  const myStake = me ? BigInt(me.stake) : 0n;
  const tallest = [...axis.columns, ...(axis.offLow ? [axis.offLow] : []), ...(axis.offHigh ? [axis.offHigh] : [])].reduce((m, c) => (BigInt(c.stake) > m ? BigInt(c.stake) : m), 0n);
  const myShare = tallest === 0n || myStake <= 0n ? 0 : Number((myStake * 1000n) / tallest) / 10;
  // Which column is mine: the per-value column of my number, the slice it falls in, or an off-axis column.
  const mineOff: "low" | "high" | null = myValue !== null && axis.offHigh && BigInt(axis.offHigh.value) === myValue ? "high" : myValue !== null && axis.offLow && BigInt(axis.offLow.value) === myValue ? "low" : null;
  const myColumn = myValue === null || mineOff ? -1 : axis.mode === "values" ? axis.columns.findIndex((c) => c.value !== null && BigInt(c.value) === myValue) : sliceIndex(myValue, axis);

  const marker = (
    <div aria-hidden="true" className="pointer-events-none absolute -top-[50px] bottom-[22px] z-10 flex -translate-x-1/2 flex-col items-center duration-200 motion-safe:transition-opacity" style={{ left: `${Math.min(98, Math.max(2, (axis.marker?.xPermille ?? 0) / 10))}%`, opacity: risen ? 1 : 0, transitionDelay: risen ? "900ms" : "0ms" }}>
      <span className="flex h-[22px] items-center whitespace-nowrap rounded-pill bg-ink px-2 text-label text-ground tabular-nums">{axis.marker?.chip}</span>
      <span className="w-[2px] flex-1 bg-ink" />
    </div>
  );
  const column = (c: { heightPermille: number; noStake: number; label: string | null }, i: number, mine: boolean, key: string, withMarker = false) => (
    <div key={key} className="relative flex min-w-0 flex-col items-center gap-1">
      {withMarker ? marker : null}
      <div className="relative h-[100px] w-full rounded-column bg-surface">
        {mine && me ? (
          <span className="absolute left-1/2 z-[2] -translate-x-1/2 duration-[400ms] ease-out motion-safe:transition-[bottom]" style={{ bottom: risen ? "calc(100% + 28px)" : 6 }}>
            <Avatar name={me.name} hue={me.hue} size={22} ring="var(--ground)" />
          </span>
        ) : null}
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 rounded-column bg-market-ink ease-out motion-safe:transition-[height]" style={{ height: risen ? `${c.heightPermille / 10}%` : 6, transitionDuration: "700ms", transitionDelay: risen && !mine ? `${120 + i * 30}ms` : "0ms" }} />
        {mine && me ? <span aria-hidden="true" className="absolute inset-x-0 bottom-0 rounded-column duration-[400ms] ease-out motion-safe:transition-[height]" style={{ height: risen ? `${myShare}%` : 0, background: hueVar(me.hue), boxShadow: "0 -2px 0 var(--ground)", transitionDelay: risen ? "300ms" : "0ms" }} /> : null}
        {Array.from({ length: Math.min(c.noStake, 3) }, (_, k) => (
          <span key={k} aria-hidden="true" className="absolute left-1/2 h-2 w-2 -translate-x-1/2 rounded-pill border border-ink-2 bg-ground" style={{ bottom: 2 + k * 10 }} />
        ))}
      </div>
      <span aria-hidden="true" className="h-[18px] max-w-full truncate text-caption text-ink-3 tabular-nums">
        {c.label ?? ""}
      </span>
    </div>
  );

  const n = axis.columns.length;
  return (
    <figure className="flex flex-col gap-3" aria-label={heading}>
      <figcaption className="text-label text-ink-2">{heading}</figcaption>
      <div role="img" aria-label={caption} className="flex items-end gap-[3px] pt-[50px]">
        {axis.offLow ? <div className="mr-[3px] flex min-w-0 flex-1">{column(axis.offLow, -1, mineOff === "low", "off-low", axis.marker?.at === "offLow")}</div> : null}
        {/* The marker is the median, one of the entries: it stands in the row of on-axis columns, or over the off-axis column whose entry it is. */}
        <div className="relative grid min-w-0 gap-[3px]" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, flex: n }}>
          {axis.marker?.at === "axis" ? marker : null}
          {axis.columns.map((c, i) => column(c, i, i === myColumn, `c${c.n}`))}
        </div>
        {axis.offHigh ? <div className="ml-[3px] flex min-w-0 flex-1">{column(axis.offHigh, n, mineOff === "high", "off-high", axis.marker?.at === "offHigh")}</div> : null}
      </div>
      <p className="text-caption text-ink-3">{caption}</p>
    </figure>
  );
}

/** Which of ten slices a value falls in, from the columns' own layout (the server decided lo and hi; this only places a value). */
function sliceIndex(v: bigint, axis: NumberLineAxis): number {
  const lo = axis.columns[0]?.label ? BigInt(axis.columns[0].label.replace(/,/g, "")) : null;
  const hiLabel = axis.columns[axis.columns.length - 1]?.label ?? null;
  const hi = hiLabel ? BigInt(hiLabel.replace(/,/g, "").split(" ")[0] ?? "0") : null;
  if (lo === null || hi === null || hi <= lo) return 0;
  const d = v - lo;
  if (d <= 0n) return 0;
  const b = Number((d * 10n + (hi - lo) - 1n) / (hi - lo));
  return Math.min(9, Math.max(0, b - 1));
}
