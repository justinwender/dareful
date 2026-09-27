"use client";

import { useEffect, useState } from "react";
import { PhotoView } from "@/components/ledger/photo-view";
import { strip } from "@/lib/media/roles";
import { cn } from "@/lib/utils";
import { usePhotoAdding } from "./photo-adding";

const camera = (
  <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.2-2h6.2l1.2 2h2.2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" />
    <circle cx="12" cy="13" r="3.4" />
  </svg>
);

/**
 * "Yours from tonight" (docs/design.md 3.39): under the participant stack, once this person has taken a photo
 * while the market is open, their photos as 60px squares, four and then "+N", and one caption, "Everyone sees
 * these once it's over." A photo still going up is its square at 0.88 with the 2px runner along its bottom edge;
 * one that failed keeps its square with the camera glyph, and a tap retries it. A stored one opens full screen
 * with "Remove" and "Save to your phone". Nobody else sees any of this before the market ends: the server hands
 * this component the viewer's own photos and nobody else's, and the door refuses everyone else too.
 */
export function OpenPhotos({ photos }: { photos: Array<{ id: string }> }) {
  const { queue, retryOne, settle } = usePhotoAdding();
  const [viewing, setViewing] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  // A photo that landed keeps its square, as the preview, until the server's copy is on the screen; then the preview goes.
  const stored = photos.map((p) => p.id).join(",");
  useEffect(() => {
    settle(stored ? stored.split(",") : []);
  }, [stored, settle]);
  const items: Array<{ key: string; kind: "stored"; id: string } | { key: string; kind: "queued"; preview: string; status: "pending" | "failed" }> = [
    ...photos.map((p) => ({ key: p.id, kind: "stored" as const, id: p.id })),
    ...queue.filter((q) => !(q.status === "landed" && q.id !== undefined && photos.some((p) => p.id === q.id))).map((q) => ({ key: q.key, kind: "queued" as const, preview: q.preview, status: q.status === "failed" ? ("failed" as const) : ("pending" as const) })),
  ];
  if (items.length === 0) return null;
  const { squares, more } = showAll ? { squares: items, more: 0 } : strip(items);
  return (
    <section className="flex flex-col gap-2" aria-label="Yours from tonight" data-yours-from-tonight="">
      <h2 className="text-label text-ink-3">Yours from tonight</h2>
      <ul className="flex gap-[6px] overflow-x-auto [scrollbar-width:none]">
        {squares.map((item, i) =>
          item.kind === "stored" ? (
            <li key={item.key} className="shrink-0">
              <button type="button" aria-label={`Open your photo ${i + 1}`} onClick={() => setViewing(item.id)} className="block rounded-button">
                {/* eslint-disable-next-line @next/next/no-img-element -- behind the door, a signed URL that expires */}
                <img src={`/api/media/${item.id}?size=thumb`} alt="" width={60} height={60} loading="lazy" className="h-[60px] w-[60px] rounded-button bg-surface-2 object-cover" />
              </button>
            </li>
          ) : (
            <li key={item.key} className="shrink-0">
              {item.status === "pending" ? (
                <span className="relative block h-[60px] w-[60px] overflow-hidden rounded-button bg-surface-2" aria-busy="true" aria-label="Going up">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a preview of the file still on the phone */}
                  <img src={item.preview} alt="" width={60} height={60} className="h-full w-full object-cover opacity-[0.88]" />
                  <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] overflow-hidden bg-surface-2">
                    <span className="absolute inset-y-0 w-1/3 animate-[button-runner_1.2s_linear_infinite] bg-ink" />
                  </span>
                </span>
              ) : (
                <button type="button" aria-label="This one didn’t go up. Try again" onClick={() => retryOne(item.key)} className="relative flex h-[60px] w-[60px] items-center justify-center overflow-hidden rounded-button bg-surface-2 text-ink">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the file that didn't go up */}
                  <img src={item.preview} alt="" width={60} height={60} className={cn("absolute inset-0 h-full w-full object-cover opacity-40")} />
                  <span className="relative">{camera}</span>
                </button>
              )}
            </li>
          ),
        )}
        {more > 0 ? (
          <li className="shrink-0">
            <button type="button" aria-label={`Show ${more} more`} onClick={() => setShowAll(true)} className="flex h-[60px] w-[60px] items-center justify-center rounded-button bg-surface-2 text-label text-ink">
              +{more}
            </button>
          </li>
        ) : null}
      </ul>
      <p className="text-caption text-ink-3">Everyone sees these once it’s over.</p>
      {viewing ? <PhotoView items={photos.map((p, i) => ({ id: p.id, alt: `Your photo ${i + 1} of ${photos.length} from tonight`, removable: true }))} index={Math.max(0, photos.findIndex((p) => p.id === viewing))} onClose={() => setViewing(null)} /> : null}
    </section>
  );
}
