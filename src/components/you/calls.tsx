import { MarkRefStamp } from "@/components/ledger/mark-stamp";
import { MIN_CALIBRATION, type CalibrationRecord } from "@/lib/ledger/calibration";
import { callLine, callsCaption, callsHeadline, earlyTitle, pickOneCaption, plotDots } from "@/lib/ledger/you";
import { hueVar, type Hue } from "@/lib/ui/hue";

/** The plot's box (docs/design.md 3.34): 318 by 236 inside its card, with room on the left for the y labels and under it for the x ticks. */
const W = 318;
const H = 236;
const PAD = { left: 30, right: 10, top: 10, bottom: 22 };
const px = (fraction: number) => PAD.left + fraction * (W - PAD.left - PAD.right);
const py = (fraction: number) => H - PAD.bottom - fraction * (H - PAD.top - PAD.bottom);

/**
 * How your calls land (docs/design.md 3.34): the reliability plot once ten yes-or-no calls have resolved, and
 * before that the same frame with only the diagonal, the count as a fact, and the calls themselves as rows.
 * Each bin with a call is a dot in this person's hue at (mean said, share that happened), sized by how much it
 * rests on, over a whisker spanning the bin's 80% Wilson interval; there is no floor per bin, since hiding a thin
 * bin would hide part of the record. The headline names the fullest bin in counts.
 */
export function CallsSection({ record, hue, now, zone }: { record: CalibrationRecord; hue: Hue; now: Date; zone: string }) {
  const { binary, calls, pickOne, firstAt } = record;
  const enough = binary.enough;
  const dots = enough ? plotDots(binary.bins) : [];
  const headline = enough ? callsHeadline(binary.bins) : null;
  const pick = pickOneCaption(pickOne);
  return (
    <section className="flex flex-col gap-3" data-you-calls={enough ? "plot" : "early"}>
      <h2 className="text-label text-ink-3">How your calls land</h2>
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
        {headline ? <p className="text-serif-l text-ink">{headline}</p> : <p className="text-body-strong text-ink">{earlyTitle(binary.resolved, MIN_CALIBRATION)}</p>}
        <figure className="flex flex-col gap-1" aria-label={enough ? "How often it happened, against what you said" : "The frame your picture draws in, at ten resolved calls"}>
          <figcaption className="text-caption text-ink-3">How often it happened</figcaption>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-hidden={!enough} className="block w-full" data-calls-plot={enough ? "" : undefined} style={{ maxWidth: W }}>
            {/* Gridlines at 0, 50 and 100 on y; ticks at 0%, 50% and 100% on x. */}
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={px(0)} x2={px(1)} y1={py(f)} y2={py(f)} stroke="var(--line)" strokeWidth="1" />
                <text x={px(0) - 6} y={py(f) + 4} textAnchor="end" className="text-caption" fill="var(--ink-3)">
                  {Math.round(f * 100)}%
                </text>
                <text x={px(f)} y={H - 6} textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"} className="text-caption" fill="var(--ink-3)">
                  {Math.round(f * 100)}%
                </text>
              </g>
            ))}
            {/* The diagonal, "right on": dashed, at 0.6 while the picture waits. */}
            <line x1={px(0)} y1={py(0)} x2={px(1)} y2={py(1)} stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="4 4" opacity={enough ? 1 : 0.6} data-diagonal="" />
            <text x={px(1) - 4} y={py(1) + 14} textAnchor="end" className="text-caption" fill="var(--ink-3)" opacity={enough ? 1 : 0.6}>
              right on
            </text>
            {dots.map((d) => (
              <g key={d.bucket} data-bin={d.bucket} data-count={d.count}>
                <line x1={px(d.x)} x2={px(d.x)} y1={py(d.low)} y2={py(d.high)} stroke={hueVar(hue)} strokeWidth="2" opacity="0.45" strokeLinecap="round" />
                <circle cx={px(d.x)} cy={py(d.y)} r={d.r} fill={hueVar(hue)} stroke="var(--surface)" strokeWidth="2" />
              </g>
            ))}
          </svg>
          <figcaption className="text-center text-caption text-ink-3">What you said</figcaption>
        </figure>
        {enough ? (
          <>
            <p className="text-caption text-ink-3">{callsCaption(binary.resolved, firstAt, now, zone)}</p>
            {pick ? <p className="text-caption text-ink-3">{pick}</p> : null}
          </>
        ) : (
          <>
            {pick ? <p className="text-caption text-ink-3">{pick}</p> : null}
            {calls.length > 0 ? (
              <ul className="flex flex-col" data-you-call-rows="">
                {calls.map((c) => (
                  <li key={c.dareId} className="flex items-center gap-3 border-t border-line py-2">
                    <MarkRefStamp mark={c.mark} size={28} ink={c.ink} />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-body-sm text-ink">{callLine(c.valueBps, c.happened)}</span>
                      <span className="truncate text-caption text-ink-3">{c.title}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

/** Nothing yet (3.34, `YouEarly` frame A): one card with one line, no empty chart and no zeros. */
export function NothingYet() {
  return (
    <section className="rounded-card border border-line bg-surface p-4" data-you-nothing="">
      <p className="text-body-sm text-ink-2">Nothing has resolved yet.</p>
    </section>
  );
}
