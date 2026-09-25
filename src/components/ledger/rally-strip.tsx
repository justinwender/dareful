import type { RallyRow } from "@/lib/ledger/person";
import { hueVar, type Hue } from "@/lib/ui/hue";
import { Avatar } from "./avatar";

/**
 * The rally strip (docs/design.md 2.1, 3.11): parity that nobody expects to settle, shown as a sequence rather
 * than a count. Two rows, a 24px avatar first, then one slot per recent unsettled pick-up: a 12px dot in that
 * person's hue when they picked it up, a 4px `--line-strong` dot when they did not. Fewer than twelve leaves
 * the rest as small dots, left-aligned; fewer than four and the caller renders nothing. The sentence under it
 * carries the nuance; no count, no ratio.
 */
export function RallyStrip({ rows, people, sentence }: { rows: RallyRow[]; people: Map<string, { name: string; hue: Hue }>; sentence: string | null }) {
  const slots = 12;
  return (
    <figure data-rally="" className="flex flex-col gap-3">
      <div className="grid grid-cols-[24px_repeat(12,minmax(0,1fr))] gap-1" role="img" aria-label={sentence ?? "Who picked up the last few"}>
        {rows.map((row) => {
          const person = people.get(row.userId);
          return (
            <RowCells key={row.userId} name={person?.name ?? ""} hue={person?.hue ?? "stone"} slots={Array.from({ length: slots }, (_, i) => row.slots[i] ?? false)} />
          );
        })}
      </div>
      {sentence ? <figcaption className="text-body-sm text-ink-2">{sentence}</figcaption> : null}
    </figure>
  );
}

function RowCells({ name, hue, slots }: { name: string; hue: Hue; slots: boolean[] }) {
  return (
    <>
      <span className="flex h-6 items-center">
        <Avatar name={name} hue={hue} size={22} />
      </span>
      {slots.map((picked, i) => (
        <span key={i} className="flex h-6 items-center justify-center">
          <span aria-hidden="true" className="rounded-pill" style={picked ? { width: 12, height: 12, background: hueVar(hue) } : { width: 4, height: 4, background: "var(--line-strong)" }} />
        </span>
      ))}
    </>
  );
}
