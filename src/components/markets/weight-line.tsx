"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/ledger/avatar";
import { hueVar, type Hue } from "@/lib/ui/hue";
import { leanPill } from "@/lib/ui/team";
import { MOTION, staggerDelay, staggeredTotal } from "@/lib/ui/motion";

/** One of the ten buckets, with what is riding there as a decimal string so no float touches a stake. */
export type WeightBucket = { n: number; stake: string; noStake: number };

export type WeightLineProps = {
  buckets: WeightBucket[];
  /** This person's entry: their share of their bucket is drawn in their hue, with their avatar over the column. */
  me: { name: string; hue: Hue; stake: string; percent: number } | null;
  /** While changing: where the number is being dragged to. The picture follows the finger; the server's copy follows the save. */
  liveValue?: number | null;
  /** The group's number, from the third entry. Never the market's ink and never citron: it has not happened. */
  group: { percent: number } | null;
  /** Blind until lock: outlined columns with no heights, no group's number, and a count of who is in. */
  heading: string;
  /** Only when one stake is more than half of everything riding (4.9); otherwise the picture speaks alone. */
  caption: string | null;
  /** The entering moment (3.13): columns grow from segments, your share fills, your avatar rises, the marker draws last. */
  rise?: boolean;
  /** Between two teams (3.40): the columns labelled with the two names and "Even", and the marker chip naming the team the group leans to ("Bills 62%"). */
  ends?: { away: string; home: string } | null;
};

/** `bucket(v) = ceil(v / 10)`, with 0 joining the first bucket (3.22). */
export const bucketOfPercent = (p: number) =>
  Math.max(1, Math.ceil(Math.min(100, Math.max(0, p)) / 10));

/**
 * The weight line (docs/design.md 3.22): the odds line (3.13) in its second state, not a second component. The
 * same ten buckets, grown into ten columns 100px tall on the market's surface, filled in the market's ink by how
 * much is riding there, with this person's own share at the bottom of their column in their hue. Height is
 * stake, never headcount: a number with nothing on it is a hollow dot, a person and no weight.
 */
export function WeightLine({
  buckets,
  me,
  liveValue = null,
  group,
  heading,
  caption,
  rise = false,
  ends = null,
}: WeightLineProps) {
  // The rise plays once, from the resting geometry of the odds line: 6px segments become columns.
  const [risen, setRisen] = useState(!rise);
  useEffect(() => {
    if (!rise) return;
    const t = setTimeout(() => setRisen(true), 20);
    return () => clearTimeout(t);
  }, [rise]);

  // Integer arithmetic on the stakes as they travelled: my stake moves with the live value while changing.
  const myStake = me ? BigInt(me.stake) : 0n;
  const from = me ? bucketOfPercent(me.percent) : null;
  const to = me && liveValue !== null ? bucketOfPercent(liveValue) : from;
  const stakes = buckets.map((b) => {
    let s = BigInt(b.stake);
    if (me && myStake > 0n && from !== to) {
      if (b.n === from) s -= myStake;
      if (b.n === to) s += myStake;
    }
    return s < 0n ? 0n : s;
  });
  const tallest = stakes.reduce((m, s) => (s > m ? s : m), 0n);
  const heightOf = (i: number) =>
    tallest === 0n ? 0 : Number(((stakes[i] as bigint) * 1000n) / tallest) / 10;
  const myShare =
    tallest === 0n || myStake <= 0n
      ? 0
      : Number((myStake * 1000n) / tallest) / 10;
  const myBucket = to;
  const said = caption ?? heading;

  return (
    <figure className="flex flex-col gap-3" aria-label={heading}>
      <figcaption className="text-label text-ink-2">{heading}</figcaption>
      <div className="relative" role="img" aria-label={said}>
        {group ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 bottom-0 z-10 flex -translate-x-1/2 flex-col items-center motion-safe:transition-[opacity,left]"
            style={{
              left: `${Math.min(98, Math.max(2, group.percent))}%`,
              opacity: risen ? 1 : 0,
              transitionDuration: `${MOTION.base}ms`,
              transitionTimingFunction: "var(--ease-fade), var(--ease-move)",
              transitionDelay: risen && rise ? `${staggeredTotal(buckets.length)}ms` : "0ms",
            }}
          >
            <span className="flex h-[22px] items-center whitespace-nowrap rounded-pill bg-ink px-2 text-label text-ground">
              {ends ? leanPill(group.percent, ends.away, ends.home) : `${group.percent}%`}
            </span>
            <span className="w-[2px] flex-1 bg-ink" />
          </div>
        ) : null}
        <div className="grid grid-cols-10 gap-[3px] pt-[50px]">
          {buckets.map((b, i) => {
            const isMine = me !== null && b.n === myBucket;
            const height = heightOf(i);
            return (
              <div
                key={b.n}
                className="relative h-[100px] rounded-column bg-surface"
              >
                {isMine && me ? (
                  <span
                    className="absolute left-1/2 z-[2] -translate-x-1/2 ease-move motion-safe:transition-[bottom]"
                    style={{
                      bottom: risen ? "calc(100% + 28px)" : 6,
                      transitionDuration: `${MOTION.base}ms`,
                      transitionDelay: risen && rise ? `${staggerDelay(i) + MOTION.travel - MOTION.base}ms` : "0ms",
                    }}
                  >
                    <Avatar
                      name={me.name}
                      hue={me.hue}
                      size={22}
                      ring="var(--ground)"
                    />
                  </span>
                ) : null}
                <>
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 rounded-column bg-market-ink ease-move motion-safe:transition-[height]"
                      style={{
                        height: risen ? `${height}%` : 6,
                        transitionDuration: `${rise ? MOTION.travel : MOTION.base}ms`,
                        transitionDelay: risen && rise ? `${staggerDelay(i)}ms` : "0ms",
                      }}
                    />
                    {isMine && me ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 bottom-0 rounded-column ease-move motion-safe:transition-[height]"
                        style={{
                          height: risen ? `${myShare}%` : 0,
                          background: hueVar(me.hue),
                          boxShadow: "0 -2px 0 var(--ground)",
                          transitionDuration: `${rise ? MOTION.travel : MOTION.base}ms`,
                          transitionDelay: risen && rise ? `${staggerDelay(i)}ms` : "0ms",
                        }}
                      />
                    ) : null}
                    {Array.from({ length: Math.min(b.noStake, 3) }, (_, k) => (
                      <span
                        key={k}
                        aria-hidden="true"
                        className="absolute left-1/2 h-2 w-2 -translate-x-1/2 rounded-pill border border-ink-2 bg-ground"
                        style={{ bottom: 2 + k * 10 }}
                      />
                    ))}
                  </>
              </div>
            );
          })}
        </div>
      </div>
      <p
        aria-hidden="true"
        className="flex justify-between text-caption text-ink-3 tabular-nums"
      >
        <span>{ends ? ends.away : "0%"}</span>
        <span>{ends ? "Even" : "50%"}</span>
        <span>{ends ? ends.home : "100%"}</span>
      </p>
      {caption ? <p className="text-caption text-ink-3">{caption}</p> : null}
    </figure>
  );
}
