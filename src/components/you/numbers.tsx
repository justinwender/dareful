import type { NumericRecord } from "@/lib/ledger/calibration";
import { NUMBERS_FLOOR, numbersCaption, numbersEarly, numbersHeadline } from "@/lib/ledger/you";
import { hueStrokeVar, type Hue } from "@/lib/ui/hue";

/**
 * Numbers (docs/design.md 3.34): the average distance from the answer as a fraction of each market's scoring
 * scale, which is the score's complement, so the payout and the record are one number. Only aggregates appear,
 * never one market's distance, because a scale is never shown and this must not become a way to see one. The
 * line runs from "spot on" to 50% (distances past it sit at the end): the middle half of the distances as a 6px
 * band in this person's hue at 0.45, the average as a 3px cream mark, and a dashed reference at 25%, "guessing
 * the middle". Under five markets, one line; with none, nothing.
 */
export function NumbersSection({ record, hue }: { record: NumericRecord; hue: Hue }) {
  if (record.resolved === 0) return null;
  const at = (bps: number) => `${Math.min(100, (bps / 10000) * 200)}%`;
  return (
    <section className="flex flex-col gap-3" data-you-numbers={record.resolved >= NUMBERS_FLOOR ? "line" : "early"}>
      <h2 className="text-label text-ink-3">Numbers</h2>
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
        {record.resolved >= NUMBERS_FLOOR && record.meanMissBps !== null ? (
          <>
            <p className="text-body-strong text-ink">{numbersHeadline(record.meanMissBps)}</p>
            <div className="flex flex-col gap-1">
              <div className="relative h-8" role="img" aria-label={`Your average distance is ${Math.round(record.meanMissBps / 100)}% of the range; guessing the middle would land at 25%`}>
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-strong" />
                {record.band ? <div className="absolute top-1/2 h-[6px] -translate-y-1/2 rounded-pill" style={{ left: at(record.band[0]), width: `calc(${at(record.band[1])} - ${at(record.band[0])})`, background: hueStrokeVar(hue), opacity: 0.45 }} data-numbers-band="" /> : null}
                <div className="absolute top-1/2 h-4 w-0 -translate-y-1/2 border-l border-dashed border-line-strong" style={{ left: "50%" }} aria-hidden="true" />
                <div className="absolute top-1/2 h-5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-[1.5px] bg-chalk" style={{ left: at(record.meanMissBps) }} data-numbers-mean="" />
              </div>
              <div className="relative flex justify-between text-caption text-ink-3">
                <span>spot on</span>
                <span className="absolute left-1/2 -translate-x-1/2">guessing the middle</span>
                <span>50%</span>
              </div>
            </div>
            <p className="text-caption text-ink-3">{numbersCaption(record.resolved)}</p>
          </>
        ) : (
          <p className="text-body-sm text-ink-2">{numbersEarly(record.resolved, NUMBERS_FLOOR)}</p>
        )}
      </div>
    </section>
  );
}
