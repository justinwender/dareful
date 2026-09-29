import type { CSSProperties, ReactNode } from "react";
import { Avatar } from "@/components/ledger/avatar";
import { MarkRefStamp } from "@/components/ledger/mark-stamp";
import { LiveDot, StateMark, type MarketMark } from "@/components/ledger/state-mark";
import type { Hue } from "@/lib/ui/hue";
import type { MarkRef } from "@/lib/ui/mark";

/**
 * The question band (docs/design.md 3.25): the stamp on the market's ground, the citron dot when it is waiting on
 * this person with a clock, the state mark and a clock, over the question and who asked. One component for the
 * market's own screen and for the shell a row draws in the frame after a tap (9.4), so the band a person sees
 * first and the band that arrives are the same geometry, and the market's ink opens out of a row's stamp into
 * it (9.7): the band's box carries `market-ink`, its words `market-words`, and its stamp's mark `market-mark`.
 * A draft's band has a dashed edge, reads "Not sent yet" after the dotted ring, and its asker line is the people
 * glyph and who it is for.
 */
export function QuestionBand({ state, clock, live = false, onWay = false, draft = false, mark, title, asker, forWhom, ink, hue, children }: { state: MarketMark; /** The clock's words, or a date on the memory view; none when nothing is waiting. */ clock: string | null; live?: boolean; onWay?: boolean; draft?: boolean; mark: MarkRef | null; title: string; /** Who asked, with their hue and the line ("Priya asked the Friday crew"); null holds the row empty until it arrives (9.4). */ asker: { name: string; hue: Hue; line: string } | null; /** A draft: "For the Friday crew". */ forWhom?: string; /** The market's ink for the open and resolved marks: a variable on the market's own screen, the ink's own elsewhere. */ ink: string; /** This person's hue, for the you're-in mark. */ hue?: Hue; children?: ReactNode }) {
  return (
    <section className={`-mx-2 flex flex-col gap-3 rounded-card bg-field p-4 pb-[18px] ${draft ? "outline outline-1 -outline-offset-1 outline-dashed outline-line-strong" : ""}`} data-band-state={state} data-band="" style={{ viewTransitionName: "market-ink" } as CSSProperties}>
      <div className="flex flex-col gap-3" data-band-words="" style={{ viewTransitionName: "market-words" } as CSSProperties}>
        <div className="flex items-center justify-between gap-3">
          {mark ? <MarkRefStamp mark={mark} size={44} onGround travels /> : <span />}
          <span className="flex items-center gap-2 text-label text-ink-2">
            {live ? <LiveDot /> : null}
            <StateMark state={onWay ? "onway" : state} hue={!onWay && state === "in" ? hue : undefined} ink={ink} />
            {onWay ? <span>On its way</span> : draft ? <span>Not sent yet</span> : clock ? <span>{clock}</span> : null}
          </span>
        </div>
        <h1 className="text-serif-l text-ink">{title}</h1>
        {/* The asker line's 22px row holds its room even while empty, so nothing moves when it arrives (9.4). */}
        <p className="flex min-h-[22px] items-center gap-2 text-caption text-ink-2">
          {draft ? (
            <>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <circle cx="9" cy="9" r="3.4" />
                <path d="M3.5 19.5c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5" />
                <path d="M16 6.4a3.2 3.2 0 0 1 0 5.9" />
                <path d="M17.6 14.9c2 .6 3.4 2.2 3.9 4.6" />
              </svg>
              <span>{forWhom ?? "For whoever you send it to"}</span>
            </>
          ) : asker ? (
            <>
              <Avatar name={asker.name} hue={asker.hue} size={22} />
              <span>{asker.line}</span>
            </>
          ) : null}
        </p>
        {children}
      </div>
    </section>
  );
}
