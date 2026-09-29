"use client";

import { useState } from "react";
import { PhotoView, type AlbumItem } from "@/components/ledger/photo-view";

/**
 * The claim card's 72px clip (docs/design.md 3.37): what the claimant attached, and a tap opens it full screen in
 * the album viewer, as any photo opens (3.38), never in a new tab. The rest of the claimant's attachments follow
 * it in the viewer.
 */
export function ClipView({ items, thumb, label, more, stickers = false }: { items: AlbumItem[]; thumb: string; label: string; /** How many more than the one shown. */ more: number; stickers?: boolean }) {
  const [viewing, setViewing] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setViewing(true)} className="relative shrink-0 rounded-button" aria-label={label} data-clip-open="">
        {/* eslint-disable-next-line @next/next/no-img-element -- behind the door, a signed URL that expires */}
        <img src={thumb} alt="" width={72} height={72} data-evidence={items[0]?.id ?? ""} className="h-[72px] w-[72px] rounded-button bg-surface-2 object-cover" />
        {more > 0 ? <span className="absolute right-1 bottom-1 rounded-pill bg-scrim px-1.5 text-caption text-ink">+{more}</span> : null}
      </button>
      {viewing ? <PhotoView items={items} index={0} onClose={() => setViewing(false)} stickers={stickers} /> : null}
    </>
  );
}
