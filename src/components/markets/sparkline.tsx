/**
 * docs/design.md 3.22: a slow question's group's number over time, 56px tall. The aggregate only, never an
 * individual entry, because plotting entries would out people's timing. Whether it is drawn at all is decided by
 * `sparkEligible`, at render, from both conditions.
 */
export function Sparkline({ points, openedLabel, currentPercent }: { points: Array<{ at: number; percent: number }>; openedLabel: string; currentPercent: number }) {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || points.length < 2) return null;
  const span = Math.max(1, last.at - first.at);
  const xy = points.map((p) => `${(((p.at - first.at) / span) * 300).toFixed(1)},${(52 - (p.percent / 100) * 48).toFixed(1)}`).join(" ");
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-label text-ink-2">The group’s number since {openedLabel}</figcaption>
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 300 56" preserveAspectRatio="none" className="h-14 min-w-0 flex-1" role="img" aria-label={`The group's number since ${openedLabel}, now ${currentPercent}%`}>
          <line x1="0" y1="28" x2="300" y2="28" stroke="var(--line-strong)" strokeWidth="1" />
          <polyline points={xy} fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="text-numeral-sm text-ink">{currentPercent}%</span>
      </div>
      <p className="flex justify-between text-caption text-ink-3">
        <span>{openedLabel}</span>
        <span>now</span>
      </p>
    </figure>
  );
}
