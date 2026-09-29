"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/ledger/avatar";
import { hueVar, type Hue } from "@/lib/ui/hue";
import { answerShares } from "@/lib/ledger/pick-one";
import { MOTION, staggerDelay, staggeredTotal } from "@/lib/ui/motion";

/** An answer as the screen draws it: the words, or the person with their avatar (docs/design.md 3.31). */
export type PickOneAnswer = { index: number; text: string; person: { name: string; hue: Hue } | null };
/** What is riding on one answer, as a decimal string so no float touches a stake, and the people on it with nothing riding. */
export type PickOneBar = { stake: string; noStake: number };

/**
 * Where the stake sits on a pick-one market (docs/design.md 3.31): one row per answer, in the asker's order, with
 * a 12px bar under it whose fill is the answer's share of everything riding. Each person's whole stake sits on
 * their pick; your own stake is drawn in your hue at the left end of your pick's bar, separated by a 2px gap in
 * the ground, with your 22px avatar on that row. Shares print from the third entry. No marker and no leader:
 * there is no aggregate of picks, only where the stake sits. Blind before lock: outlined tracks, your pick
 * marked with a 5px cap in your hue, the lock chip and the count, nothing else.
 */
export function PickOneBars({ answers, bars, entries, me, livePick = null, heading, caption, rise = false }: { answers: PickOneAnswer[]; bars: PickOneBar[]; entries: number; me: { name: string; hue: Hue; stake: string; pick: number } | null; /** While changing: where the pick is being moved to. The picture follows the tap; the server's copy follows the save. */ livePick?: number | null; heading: string; caption: string | null; /** The entering moment (3.30): the bars grow from the left, your stake fills in your hue, your avatar appears, the shares fade in last. */ rise?: boolean }) {
  const [risen, setRisen] = useState(!rise);
  useEffect(() => {
    if (!rise) return;
    const t = setTimeout(() => setRisen(true), 20);
    return () => clearTimeout(t);
  }, [rise]);
  const myStake = me ? BigInt(me.stake) : 0n;
  const from = me ? me.pick : null;
  const to = me && livePick !== null ? livePick : from;
  const stakes = answers.map((a) => {
    let s = BigInt(bars[a.index]?.stake ?? "0");
    if (me && myStake > 0n && from !== to) {
      if (a.index === from) s -= myStake;
      if (a.index === to) s += myStake;
    }
    return s < 0n ? 0n : s;
  });
  const total = stakes.reduce((a, s) => a + s, 0n);
  const permille = (part: bigint) => (total === 0n ? 0 : Number((part * 1000n) / total));
  const shares = answerShares(stakes);
  const showShares = entries >= 3;
  return (
    <figure className="flex flex-col gap-3" aria-label={heading}>
      <figcaption className="text-label text-ink-2">{heading}</figcaption>
      <ul className="flex flex-col gap-3" role="img" aria-label={caption ?? heading}>
        {answers.map((a, i) => {
          const mine = me !== null && a.index === to;
          const width = permille(stakes[i] ?? 0n) / 10;
          const myWidth = mine ? permille(myStake) / 10 : 0;
          return (
            <li key={a.index} className="flex flex-col gap-[6px]">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center">{a.person ? <Avatar name={a.person.name} hue={a.person.hue} size={28} /> : null}</span>
                <span className="min-w-0 flex-1 truncate text-body-strong text-ink">{a.text}</span>
                {mine && me ? (
                  <span className="ease-move motion-safe:transition-opacity" style={{ opacity: risen ? 1 : 0, transitionDuration: `${MOTION.base}ms`, transitionDelay: risen && rise ? `${staggerDelay(i) + MOTION.travel - MOTION.base}ms` : "0ms" }}>
                    <Avatar name={me.name} hue={me.hue} size={22} ring="var(--ground)" />
                  </span>
                ) : null}
                {showShares ? (
                  <span className="text-numeral-sm tabular-nums text-ink-2 ease-fade motion-safe:transition-opacity" style={{ opacity: risen ? 1 : 0, transitionDuration: `${MOTION.base}ms`, transitionDelay: risen && rise ? `${staggeredTotal(answers.length)}ms` : "0ms" }}>
                    {shares[i]}%
                  </span>
                ) : null}
              </div>
              <div className="relative h-3 overflow-hidden rounded-[6px] bg-surface" aria-hidden="true">
                <>
                    <span className="absolute inset-y-0 left-0 rounded-[6px] bg-market-ink ease-move motion-safe:transition-[width]" style={{ width: risen ? `${width}%` : 0, transitionDuration: `${rise ? MOTION.travel : MOTION.base}ms`, transitionDelay: risen && rise ? `${staggerDelay(i)}ms` : "0ms" }} />
                    {mine && me ? <span className="absolute inset-y-0 left-0 rounded-[6px] ease-move motion-safe:transition-[width]" style={{ width: risen ? `${myWidth}%` : 0, background: hueVar(me.hue), boxShadow: "2px 0 0 var(--ground)", transitionDuration: `${rise ? MOTION.travel : MOTION.base}ms`, transitionDelay: risen && rise ? `${staggerDelay(i)}ms` : "0ms" }} /> : null}
                    {Array.from({ length: Math.min(bars[a.index]?.noStake ?? 0, 3) }, (_, k) => (
                      <span key={k} className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-pill border border-ink-2 bg-ground" style={{ left: 2 + k * 10 }} />
                    ))}
                </>
              </div>
            </li>
          );
        })}
      </ul>
      {caption ? (
        <p className="text-caption text-ink-3">{caption}</p>
      ) : null}
    </figure>
  );
}
