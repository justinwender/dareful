"use client";

import { useState } from "react";
import { strip } from "@/lib/media/roles";
import { firstName } from "@/lib/ui/copy";
import type { Hue } from "@/lib/ui/hue";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { PhotoView } from "./photo-view";
import { ScrimChip } from "./scrim-chip";
import { usePhotoAdding } from "@/components/markets/photo-adding";
import { withViewTransition } from "@/lib/ui/transitions";
import type { CSSProperties } from "react";

export type FrameItem = { id: string; author: { name: string; hue: Hue }; /** Whether the viewer added it as a memory, so its full-screen view offers "Remove" (3.8). */ removable?: boolean };

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
 * is still shown, and a tap on the card goes to the story. Interactive, a tap on the photo opens it full screen
 * (3.8, 3.39), with "Save to your phone" and, for whoever added a memory, "Remove".
 */
export function MediaFrame({ items, height, interactive = true, inset = false, add = null, stickers = false, className }: { items: FrameItem[]; height: 180 | 200 | 240 | 260; interactive?: boolean; /** "Make a sticker" in the full-screen view (3.28): a cutout can be stored and the viewer is signed in. */ stickers?: boolean; /** 12px from the screen's edges, radius 12 (3.8); otherwise edge to edge inside a card. */ inset?: boolean; /** The add tile at the end of the strip (3.8), for someone who can add: its name says the night. Never pushed off the row: three squares and "+N" before it. */ add?: { night: string } | null; className?: string }) {
  const [current, setCurrent] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [state, setState] = useState<Record<string, "loading" | "ok" | "failed">>({});
  const [tries, setTries] = useState<Record<string, number>>({});
  const [viewing, setViewing] = useState(false);
  if (items.length === 0) return null;
  const shown = items[Math.min(current, items.length - 1)] ?? items[0];
  if (!shown) return null;
  const rest = items.filter((i) => i.id !== shown.id);
  const { squares, more } = showAll ? { squares: rest, more: 0 } : strip(rest, add ? 3 : 4);
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
            style={interactive ? ({ viewTransitionName: "photo" } as CSSProperties) : undefined}
            onLoad={() => setState((x) => ({ ...x, [shown.id]: "ok" }))}
            onError={() => setState((x) => ({ ...x, [shown.id]: "failed" }))}
          />
        ) : null}
        {interactive && s === "ok" ? (
          <button type="button" aria-label={`Open photo ${current + 1} of ${items.length}`} onClick={() => withViewTransition(() => setViewing(true))} data-press="fill" className="absolute inset-0 rounded-none press-fill" />
        ) : null}
        {s === "failed" ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-2">
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.2-2h6.2l1.2 2h2.2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" />
              <circle cx="12" cy="13" r="3.4" />
            </svg>
            <span className="text-caption">Couldn’t load,</span>
            {interactive ? (
              <button
                type="button"
                data-press="line"
                className="inline-flex h-11 items-center rounded-button px-3 text-body-sm font-semibold text-ink press-line"
                onClick={() => {
                  setTries((t) => ({ ...t, [shown.id]: (t[shown.id] ?? 0) + 1 }));
                  setState((x) => ({ ...x, [shown.id]: "loading" }));
                }}
              >
                Try again
              </button>
            ) : null}
          </div>
        ) : null}
        <figcaption className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-between gap-2">
          <ScrimChip className="h-7 gap-[6px] pr-3 pl-1 text-label">
            <Avatar name={shown.author.name} hue={shown.author.hue} size={20} />
            <span className="truncate">{firstName(shown.author.name)}</span>
          </ScrimChip>
          <ScrimChip className="h-7 px-3 text-caption tabular-nums" data-media-counter="">
            {current + 1} / {items.length}
          </ScrimChip>
        </figcaption>
      </div>
      {viewing ? <PhotoView items={items.map((item, i) => ({ id: item.id, alt: `Photo ${i + 1} of ${items.length}, added by ${firstName(item.author.name)}`, removable: item.removable === true }))} index={Math.min(current, items.length - 1)} onClose={() => setViewing(false)} stickers={stickers} /> : null}
      {rest.length > 0 || add ? (
        <div className={cn("flex gap-[6px] overflow-x-auto [scrollbar-width:none]", inset && "px-0")} role={interactive ? "group" : undefined} aria-label={interactive ? "The rest of the photos" : undefined}>
          {squares.map((item) => {
            const index = items.findIndex((i) => i.id === item.id);
            const square = (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/media/${item.id}?size=thumb`} alt={interactive ? "" : `Photo ${index + 1} of ${items.length}, added by ${firstName(item.author.name)}`} width={60} height={60} loading="lazy" className="h-[60px] w-[60px] rounded-button bg-surface-2 object-cover" />
            );
            return interactive ? (
              <button key={item.id} type="button" aria-label={`Show photo ${index + 1} of ${items.length}`} onClick={() => setCurrent(index)} data-press="fill" className="shrink-0 rounded-button press-fill">
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
              <button type="button" aria-label={`Show ${more} more`} onClick={() => setShowAll(true)} data-press="fill" className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-button bg-surface-2 text-label text-ink press-fill">
                +{more}
              </button>
            ) : (
              <span className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-button bg-surface-2 text-label text-ink">+{more}</span>
            )
          ) : null}
          {add ? <AddTile night={add.night} /> : null}
        </div>
      ) : null}
    </figure>
  );
}

/**
 * The add tile (3.8): a 60px square at the end of the strip, a 1.5px dashed border and no fill, a 22px plus in
 * ink, named for the night ("Add photos from Friday"). It opens the same picker as the empty slot: the library
 * once the market has ended, the camera while it is open (3.39). While photos are going up it carries the runner.
 */
function AddTile({ night }: { night: string }) {
  const { pick, pending } = usePhotoAdding();
  return (
    <button type="button" onClick={pick} aria-label={`Add photos from ${night}`} aria-busy={pending > 0 || undefined} data-add-tile="" data-press="line" className="relative flex h-[60px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-button border-[1.5px] border-dashed border-line-strong text-ink press-line aria-busy:opacity-[0.88]">
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
      {pending > 0 ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] overflow-hidden bg-surface-2">
          <span className="absolute inset-y-0 w-1/3 motion-loop-runner bg-ink" />
        </span>
      ) : null}
    </button>
  );
}
