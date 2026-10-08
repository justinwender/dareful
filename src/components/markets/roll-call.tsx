"use client";

import { useState } from "react";
import { Avatar } from "@/components/ledger/avatar";
import { Button } from "@/components/ui/button";
import { firstName } from "@/lib/ui/copy";
import { hueRing, type Hue } from "@/lib/ui/hue";

/** One person in the roll call: what they said, and on a game the side they leaned to. */
export type RollCallCell = { id: string; name: string; hue: Hue; ghost: boolean; said: string; side: string | null; you: boolean };

/** The roll call shows ten, then "Show all" (docs/design.md 3.6). */
export const ROLL_CALL_SHOWN = 10;

/**
 * The roll call (docs/design.md 3.6), under the picture from the close (calls are in, 3.22 and 3.24): each person's
 * exact number, which the picture shows only as where the stake sits. Five across, 4px apart, a cell each on the
 * second surface: the 28px avatar, the first name, the number, and on a game the side they leaned to, since nothing
 * has happened yet to be off from. Your own cell wears your ring. More than ten: the first ten, then "Show all".
 */
export function RollCall({ cells }: { cells: RollCallCell[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? cells : cells.slice(0, ROLL_CALL_SHOWN);
  return (
    <div className="flex flex-col gap-2">
      <ul className="grid grid-cols-5 gap-1" aria-label="Who said what" data-roll-call="">
        {shown.map((c) => (
          <li key={c.id} className="flex min-w-0 flex-col items-center gap-1 rounded-button bg-surface-2 px-1 py-[10px]" style={c.you ? { boxShadow: hueRing(c.hue) } : undefined} data-roll-call-cell={c.you ? "you" : ""}>
            <Avatar name={c.name} hue={c.hue} size={28} ghost={c.ghost} />
            <span className="max-w-full truncate text-label text-ink">{c.you ? "You" : firstName(c.name)}</span>
            <span className="text-body-strong tabular-nums text-ink">{c.said}</span>
            {c.side ? <span className="max-w-full truncate text-caption text-ink-3">{c.side}</span> : null}
          </li>
        ))}
      </ul>
      {cells.length > ROLL_CALL_SHOWN && !all ? (
        <Button variant="tertiary" className="self-start" onClick={() => setAll(true)}>
          Show all
        </Button>
      ) : null}
    </div>
  );
}
