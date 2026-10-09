import { TALLY_STROKES } from "@/lib/ui/opening";

/**
 * The one loader (the touch-ups round, section 3): the logo's five strokes counted in a loop, the crossing fifth
 * last, in the ink of whatever holds it, at a size. The loop is `pullTallyCss` (`[data-tally="loading"]`), placed once
 * in the root layout's head beside the opening's own style; under Reduce Motion that style draws it whole and still.
 * Everywhere a wait runs past about a third of a second shows it: a button's tap until the server answers, signing in,
 * joining, closing, the terms being written, a ruling being weighed, a section of a page still reading.
 */
export function TallyLoader({ size = 20, label, className }: { size?: number; /** Said to a screen reader; the strokes themselves are not. */ label?: string; className?: string }) {
  const scale = size / 120;
  return (
    <span role={label ? "status" : undefined} aria-label={label} aria-hidden={label ? undefined : true} data-tally="loading" data-tally-loader="" className={`relative inline-block shrink-0 ${className ?? ""}`} style={{ width: size, height: size }}>
      <span className="absolute top-0 left-0 origin-top-left" style={{ width: 120, height: 120, transform: `scale(${scale})` }}>
        {TALLY_STROKES.map((s, i) => (
          <span key={i} className={`absolute block t${i + 1}`} style={{ left: s.left, top: s.top, width: s.width, height: s.height, transform: `rotate(${s.rotate}deg)` }}>
            <svg viewBox={s.viewBox} width={s.width} height={s.height} className="block" aria-hidden="true">
              <path d={s.d} transform={s.transform ?? undefined} fill="currentColor" />
            </svg>
          </span>
        ))}
      </span>
    </span>
  );
}

/** A wait that holds a whole place (a screen, a section, a sheet): the loader in the middle of it, and a line under it when one is given. */
export function TallyWait({ line, size = 32, className }: { line?: string; size?: number; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-6 text-ink-2 ${className ?? ""}`} data-tally-wait="">
      <TallyLoader size={size} label={line ?? "Loading"} className="text-ink" />
      {line ? <p className="text-body-sm text-ink-2">{line}</p> : null}
    </div>
  );
}
