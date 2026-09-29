import type { ReactNode } from "react";

/**
 * The number vote's raised sheet (docs/design.md 3.24; Round C part 2): "What was it?" over the number field, the
 * same job "What happened?" does elsewhere, then the line a person may add. The buttons under it are the call
 * sheet's own; this holds the words and the fields, so they render without the sheet's signer.
 */
export function NumberDissentHead({ panel, line, onLine, disabled = false }: { panel: ReactNode; line: string; onLine: (line: string) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-3" data-number-dissent="">
      <p className="text-label text-ink-3">What was it?</p>
      {panel}
      <div className="flex flex-col gap-2">
        <label htmlFor="what-happened-2" className="text-label text-ink-3">
          What happened?
        </label>
        <input id="what-happened-2" value={line} disabled={disabled} onChange={(e) => onLine(e.target.value)} maxLength={280} className="h-12 rounded-button border border-line bg-ground px-4 text-body text-ink" />
      </div>
    </div>
  );
}
