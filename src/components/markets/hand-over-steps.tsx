"use client";

import { useId } from "react";
import { Avatar } from "@/components/ledger/avatar";
import { Problem } from "@/components/ledger/problem";
import { Button } from "@/components/ui/button";
import { PinnedSheet } from "@/components/ui/pinned-sheet";
import type { Hue } from "@/lib/ui/hue";
import { cn } from "@/lib/utils";

export type HandOverCandidate = { id: string; name: string; hue: Hue; ready: boolean };
const PIN_LENGTH = 4;

/** "Who's joining?" (3.45, frame 4): the entry's summary on the right, "Pick yourself" over the people not in yet, the ones not set up at 0.45, and the way to the code for someone with no account. */
export function WhosJoining({ candidates, words, onPick, onScan }: { candidates: HandOverCandidate[]; words: string; onPick: (c: HandOverCandidate) => void; onScan: () => void }) {
  return (
    <PinnedSheet
      label="Who’s joining?"
      raised
      header={
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-body-strong text-ink">Who’s joining?</p>
          <span className="text-caption text-ink-2">{words}</span>
        </div>
      }
      low={null}
      high={
        <div className="flex flex-col gap-3" data-whos-joining="">
          <p className="text-label text-ink-3">Pick yourself</p>
          <ul className="flex flex-col">
            {candidates.map((c) => (
              <li key={c.id}>
                <button type="button" disabled={!c.ready} onClick={() => onPick(c)} data-candidate={c.ready ? "ready" : "not-set-up"} data-press="row" className={cn("flex min-h-14 w-full items-center gap-3 rounded-button text-left press-row", !c.ready && "opacity-45")}>
                  <Avatar name={c.name} hue={c.hue} size={36} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body-strong text-ink">{c.name}</span>
                    {!c.ready ? <span className="text-caption text-ink-3">Not set up for this yet</span> : null}
                  </span>
                </button>
              </li>
            ))}
            {candidates.length === 0 ? <li className="py-2 text-body-sm text-ink-2">Everyone this was sent to is in already.</li> : null}
          </ul>
          <Button variant="tertiary" className="self-start" onClick={onScan} data-scan-instead="">
            No account? Scan the code with your own phone
          </Button>
        </div>
      }
    />
  );
}

/** The friend's PIN (3.45, frame 5): their 56px avatar and name, "Your PIN", four 14px dots and a keypad of 56px keys on the field colour. The fourth digit sends. */
export function PinStep({ friend, pin, problem, sending, onKey }: { friend: HandOverCandidate; pin: string; problem: string | null; sending: boolean; onKey: (k: string) => void }) {
  const id = useId();
  return (
    <PinnedSheet
      label="Your PIN"
      raised
      header={
        <div className="flex items-center gap-3">
          <Avatar name={friend.name} hue={friend.hue} size={56} />
          <p className="text-body-strong text-ink">{friend.name}</p>
        </div>
      }
      low={null}
      high={
        <div className="flex flex-col gap-4" data-pin-step="">
          <p className="text-label text-ink-3" id={`${id}-pin`}>
            Your PIN
          </p>
          <div className="flex justify-center gap-4" role="img" aria-labelledby={`${id}-pin`} aria-label={`${pin.length} of ${PIN_LENGTH} digits`} data-pin-dots={pin.length}>
            {Array.from({ length: PIN_LENGTH }, (_, i) => (
              <span key={i} aria-hidden="true" data-pin-dot="" className={cn("h-[14px] w-[14px] rounded-pill", i < pin.length ? "bg-ink" : "border border-line-strong")} />
            ))}
          </div>
          <Problem id={`${id}-pin-problem`} message={problem} />
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Keypad" aria-busy={sending || undefined}>
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"].map((k, i) =>
              k === "" ? (
                <span key={i} />
              ) : (
                <button key={i} type="button" disabled={sending} aria-label={k === "back" ? "Delete" : k} onClick={() => onKey(k)} data-press="fill" data-type-exempt="" data-pin-key={k} className="flex h-14 items-center justify-center rounded-button bg-field text-body-strong text-ink press-fill">
                  {k === "back" ? (
                    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7z" />
                      <path d="M12.5 9.5l5 5M17.5 9.5l-5 5" />
                    </svg>
                  ) : (
                    k
                  )}
                </button>
              ),
            )}
          </div>
        </div>
      }
    />
  );
}
