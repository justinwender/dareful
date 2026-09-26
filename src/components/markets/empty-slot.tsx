"use client";

import { Avatar } from "@/components/ledger/avatar";
import { firstName } from "@/lib/ui/copy";
import { usePhotoAdding } from "./photo-adding";

/**
 * The empty slot (docs/design.md 3.8): where the frame would be on an ended market for someone who can add, a
 * 120px button with a dashed border and no fill, a 44px ring around a plus, and "Add the first photo" under it.
 * It is drawn as the place photos go and it is a control, so its words sit outside the type budget. It opens
 * the same picker as the sheet's chalk; once the first photo lands it becomes the frame. While the first photo
 * is still going up, the slot is the hatched placeholder with the viewer's credit chip.
 */
export function EmptySlot() {
  const { pick, pending, night, viewer } = usePhotoAdding();
  if (pending > 0) {
    return (
      <div className="relative w-full overflow-hidden rounded-card bg-surface motion-safe:animate-[placeholder-pulse_1.2s_ease-in-out_infinite]" style={{ height: 200, backgroundImage: "repeating-linear-gradient(135deg, var(--field) 0 10px, var(--surface) 10px 20px)" }} aria-busy="true" aria-label="Your photo is going up">
        <span className="absolute bottom-2 left-2 inline-flex h-7 items-center gap-[6px] rounded-pill bg-scrim pr-3 pl-1 text-label text-ink">
          <Avatar name={viewer.name} hue={viewer.hue} size={20} />
          <span>{firstName(viewer.name)}</span>
        </span>
      </div>
    );
  }
  return (
    <button type="button" onClick={pick} aria-label={`Add the first photo from ${night}`} data-empty-slot="" className="flex h-[120px] w-full flex-col items-center justify-center gap-2 rounded-card border-[1.5px] border-dashed border-line-strong text-body-strong text-ink">
      <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-pill border-[1.5px] border-ink">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
      <span>Add the first photo</span>
    </button>
  );
}
