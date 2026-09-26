"use client";

import { useState } from "react";
import { strip } from "@/lib/media/roles";
import { firstName } from "@/lib/ui/copy";
import type { Hue } from "@/lib/ui/hue";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";

export type FrameItem = { id: string; author: { name: string; hue: Hue } };

/**
 * The media frame (docs/design.md 3.8): full card width, a credit chip bottom left (who added it, on the scrim)
 * and a counter bottom right ("1 / 7"), and under it the strip of 60px squares for the rest, with "+N" past four
 * (4.3). Tapping a square brings that photo into the frame, which is what the counter counts. Every photo is
 * fetched through the app's own door, which checks who is asking before it signs a URL for a minute.
 *
 * States: photo; loading, the hatched placeholder in the market's field and surface until the bytes arrive;
 * failed, the placeholder with "Couldn't load," and a 44px "Try again". None: the caller renders nothing at all,
 * because an empty frame is worse than no frame (3.8, 4.3).
 *
 * `interactive` false draws the same frame with no controls, for a card that is itself a link (3.4): the strip
 * is still shown, and a tap on the card goes to the story.
 */
export function MediaFrame({ items, height, interactive = true, inset = false, className }: { items: FrameItem[]; height: 180 | 200 | 240 | 260; interactive?: boolean; /** 12px from the screen's edges, radius 12 (3.8); otherwise edge to edge inside a card. */ inset?: boolean; className?: string }) {
  const [current, setCurrent] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [state, setState] = useState<Record<string, "loading" | "ok" | "failed">>({});
  const [tries, setTries] = useState<Record<string, number>>({});
  if (items.length === 0) return null;
  const shown = items[Math.min(current, items.length - 1)] ?? items[0];
  if (!shown) return null;
  const rest = items.filter((i) => i.id !== shown.id);
  const { squares, more } = showAll ? { squares: rest, more: 0 } : strip(rest);
  const src = (id: string) => `/api/media/${id}${tries[id] ? `&try=${tries[id]}` : ""}`.replace("&try", "?try");
  const s = state[shown.id] ?? "loading";
  return (
    <figure className={cn("flex flex-col gap-[6px]", className)} data-media-frame="">
      <div className={cn("relative w-full overflow-hidden bg-surface", inset && "rounded-card")} style={{ height, backgroundImage: s === "ok" ? undefined : "repeating-linear-gradient(135deg, var(--field) 0 10px, var(--surface) 10px 20px)" }}>
        {s !== "failed" ? (
          // A signed URL that expires; next/image would need a loader for one.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${shown.id}-${tries[shown.id] ?? 0}`}
            src={src(shown.id)}
            alt={`Photo ${current + 1} of ${items.length}, added by ${firstName(shown.author.name)}`}
            className={cn("h-full w-full object-cover", s !== "ok" && "opacity-0")}
            onLoad={() => setState((x) => ({ ...x, [shown.id]: "ok" }))}
            onError={() => setState((x) => ({ ...x, [shown.id]: "failed" }))}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-2">
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.2-2h6.2l1.2 2h2.2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" />
              <circle cx="12" cy="13" r="3.4" />
            </svg>
            <span className="text-caption">Couldn’t load,</span>
            {interactive ? (
              <button
                type="button"
                className="inline-flex h-11 items-center rounded-button px-3 text-body-sm font-semibold text-ink"
                onClick={() => {
                  setTries((t) => ({ ...t, [shown.id]: (t[shown.id] ?? 0) + 1 }));
                  setState((x) => ({ ...x, [shown.id]: "loading" }));
                }}
              >
                Try again
              </button>
            ) : null}
          </div>
        )}
        <figcaption className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-between gap-2">
          <span className="inline-flex h-7 items-center gap-[6px] rounded-pill bg-scrim pr-3 pl-1 text-label text-ink">
            <Avatar name={shown.author.name} hue={shown.author.hue} size={20} />
            <span className="truncate">{firstName(shown.author.name)}</span>
          </span>
          <span className="inline-flex h-7 items-center rounded-pill bg-scrim px-3 text-caption tabular-nums text-ink" data-media-counter="">
            {current + 1} / {items.length}
          </span>
        </figcaption>
      </div>
      {rest.length > 0 ? (
        <div className={cn("flex gap-[6px] overflow-x-auto [scrollbar-width:none]", inset && "px-0")} role={interactive ? "group" : undefined} aria-label={interactive ? "The rest of the photos" : undefined}>
          {squares.map((item) => {
            const index = items.findIndex((i) => i.id === item.id);
            const square = (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/media/${item.id}?size=thumb`} alt={interactive ? "" : `Photo ${index + 1} of ${items.length}, added by ${firstName(item.author.name)}`} width={60} height={60} loading="lazy" className="h-[60px] w-[60px] rounded-button bg-surface-2 object-cover" />
            );
            return interactive ? (
              <button key={item.id} type="button" aria-label={`Show photo ${index + 1} of ${items.length}`} onClick={() => setCurrent(index)} className="shrink-0 rounded-button">
                {square}
              </button>
            ) : (
              <span key={item.id} className="shrink-0">
                {square}
              </span>
            );
          })}
          {more > 0 ? (
            interactive ? (
              <button type="button" aria-label={`Show ${more} more`} onClick={() => setShowAll(true)} className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-button bg-surface-2 text-label text-ink">
                +{more}
              </button>
            ) : (
              <span className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-button bg-surface-2 text-label text-ink">+{more}</span>
            )
          ) : null}
        </div>
      ) : null}
    </figure>
  );
}
