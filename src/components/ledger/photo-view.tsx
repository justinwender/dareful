"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProblemSummary } from "@/components/ledger/problem";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { addStickerAction, removeMarketPhotoAction } from "@/lib/actions/media";
import { imageFromClipboard, imageFromPaste, NotACutoutHere, prepareCutout } from "@/lib/ui/cutout-clipboard";
import { StickerMade, StickerSheet } from "./sticker-from-photo";

/**
 * A photo full screen (docs/design.md 3.8, 3.38, 3.39): the frame's derivative on the ground, a 13px counter at
 * the top left and the 48px close at the top right, and under the photo 44px icon buttons with their words in
 * caption: "Make a sticker" (3.28), "Save" (named "Save to your phone", through the share sheet, because a photo
 * taken by the camera inside a web app on an iPhone is not in the phone's own photos; where there is no share
 * sheet the browser saves the file) and, for whoever added a memory, "Remove", which is destructive (3.12) and
 * asks once in a sheet. The bytes come through the app's own door, which checks who is asking. Long-press on the
 * photo is left to the phone: the sticker path depends on it (the phone's own Copy Subject).
 */
export type AlbumItem = { id: string; alt: string; removable: boolean };

/**
 * The album (docs/decisions.md 2026-09-27): every photo on the market, swipeable, opened at the one that was
 * tapped. Native scroll snapping does the swiping, so a flick, a drag and the arrow keys all work, and the counter
 * and the controls follow whichever photo is in view.
 */
export function PhotoView({ items, index = 0, onClose, stickers = false }: { items: AlbumItem[]; index?: number; onClose: () => void; /** Whether "Make a sticker" is offered (3.28): a cutout can be stored, and the viewer is signed in. */ stickers?: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [asking, setAsking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Making a sticker (3.28, frames 2 and 3): the guided sheet over the photo, then the result in the viewer's place.
  const [making, setMaking] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [made, setMade] = useState<{ id: string } | null>(null);
  const [stickerProblem, setStickerProblem] = useState<string | null>(null);
  const [current, setCurrent] = useState(Math.min(Math.max(index, 0), Math.max(items.length - 1, 0)));
  const rowRef = useRef<HTMLDivElement>(null);
  const shown = items[current] ?? items[0];
  const id = shown?.id ?? "";
  const alt = shown?.alt ?? "";
  const removable = shown?.removable === true;
  async function takeCutout(blob: Blob) {
    setStickerProblem(null);
    setPasting(true);
    try {
      const png = await prepareCutout(blob);
      const form = new FormData();
      form.set("cutout", png, "cutout.png");
      const r = await addStickerAction(form);
      if ("error" in r) return setStickerProblem(r.error);
      setMade({ id: r.id });
      setMaking(false);
    } catch (err) {
      setStickerProblem(err instanceof NotACutoutHere ? err.message : "That cutout couldn’t be read.");
    } finally {
      setPasting(false);
    }
  }
  // A paste anywhere while the sticker sheet is up is the cutout arriving (3.28): the phone's own Copy did the lift.
  useEffect(() => {
    if (!making) return;
    const onPaste = (e: ClipboardEvent) => {
      const file = imageFromPaste(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      void takeCutout(file);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [making]);
  async function askClipboard() {
    setStickerProblem(null);
    try {
      const blob = await imageFromClipboard();
      if (!blob) return setStickerProblem("Nothing to paste yet. Hold the photo, tap Copy Subject, then come back.");
      await takeCutout(blob);
    } catch (err) {
      setStickerProblem(err instanceof NotACutoutHere ? err.message : "Copy the subject first, then paste it here.");
    }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !asking && !making) onClose();
      if (e.key === "ArrowRight") rowRef.current?.scrollBy({ left: rowRef.current.clientWidth, behavior: "smooth" });
      if (e.key === "ArrowLeft") rowRef.current?.scrollBy({ left: -rowRef.current.clientWidth, behavior: "smooth" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, asking, making]);
  // Open at the photo that was tapped: scrolled there before the first paint, so nothing slides.
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (row) row.scrollLeft = row.clientWidth * current;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, at open
  }, []);
  const onScroll = () => {
    const row = rowRef.current;
    if (!row || row.clientWidth === 0) return;
    const i = Math.round(row.scrollLeft / row.clientWidth);
    if (i !== current && i >= 0 && i < items.length) setCurrent(i);
  };
  if (!shown) return null;

  async function save() {
    setProblem(null);
    setSaving(true);
    try {
      const r = await fetch(`/api/media/${id}`);
      if (!r.ok) throw new Error(`door ${r.status}`);
      const blob = await r.blob();
      const file = new File([blob], `dareful-${id.slice(0, 8)}.jpg`, { type: blob.type || "image/jpeg" });
      if (typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (err) {
      // Closing the share sheet is not a failure.
      if (!(err instanceof DOMException && err.name === "AbortError")) setProblem("Couldn’t save it. Try again.");
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    setProblem(null);
    setRemoving(true);
    try {
      const r = await removeMarketPhotoAction(id);
      if ("error" in r) return setProblem(r.error);
      setAsking(false);
      onClose();
      router.refresh();
    } finally {
      setRemoving(false);
    }
  }

  if (made) return <StickerMade id={made.id} onDone={() => setMade(null)} onClose={onClose} />;

  return (
    <div role="dialog" aria-modal="true" aria-label={alt} data-photo-view={id} className="fixed inset-0 z-40 flex flex-col bg-ground pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 shrink-0 items-center justify-between px-2">
        {items.length > 1 ? (
          <p className="ml-2 flex h-7 items-center rounded-pill bg-scrim px-3 text-caption tabular-nums text-ink" data-album-counter="">
            {current + 1} / {items.length}
          </p>
        ) : (
          <span />
        )}
        <button type="button" aria-label="Close" onClick={onClose} className="inline-flex h-12 w-12 items-center justify-center rounded-pill text-ink">
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div ref={rowRef} onScroll={onScroll} className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none]" data-album="" aria-roledescription="album">
        {items.map((item, i) => (
          <div key={item.id} className="flex h-full w-full shrink-0 snap-center items-center justify-center px-2" aria-hidden={i !== current}>
            {/* A signed URL that expires; next/image would need a loader for one. The phone's long-press stays on: the sticker path is the phone's own Copy Subject (3.28). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/media/${item.id}`} alt={item.alt} loading={Math.abs(i - current) <= 1 ? "eager" : "lazy"} className="max-h-full max-w-full object-contain" data-photo-image="" />
          </div>
        ))}
      </div>
      <div className="mx-auto flex w-full max-w-[430px] shrink-0 flex-col gap-2 px-5 pt-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <ProblemSummary messages={[problem]} />
        <div className="flex items-start justify-center gap-6" data-photo-actions="">
          {stickers ? (
            <IconAction label="Make a sticker" onClick={() => setMaking(true)} disabled={saving} data-make-sticker="">
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 4h9l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
                <path d="M15 4v5h5" />
                <path d="M9 14c1 1.5 2.5 2 3.5 2s2.5-.5 3.5-2" />
              </svg>
            </IconAction>
          ) : null}
          <IconAction label="Save" name="Save to your phone" onClick={save} loading={saving} data-save-photo="">
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" />
              <path d="M5 16v2.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V16" />
            </svg>
          </IconAction>
          {removable ? (
            <IconAction label="Remove" onClick={() => setAsking(true)} disabled={saving} data-remove-photo="">
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
              </svg>
            </IconAction>
          ) : null}
        </div>
      </div>
      <StickerSheet open={making} pasting={pasting} problem={stickerProblem} onPaste={() => void askClipboard()} onClose={() => (pasting ? undefined : setMaking(false))} />
      <Sheet open={asking} labelledBy="remove-photo-title" onClose={() => (removing ? undefined : setAsking(false))}>
        <h2 id="remove-photo-title" className="text-serif-l text-ink">
          Remove this photo?
        </h2>
        <p className="text-body-sm text-ink-2">It comes off this question for good. Nothing else changes.</p>
        <ProblemSummary messages={[problem]} />
        <div className="flex flex-col gap-1">
          <Button variant="primary" data-autofocus onClick={remove} loading={removing}>
            Remove
          </Button>
          <Button variant="tertiary" onClick={() => setAsking(false)} disabled={removing}>
            Keep it
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

/** A 44px icon button with its word in caption under it (3.38, the full-screen photo). A control, outside the type budget. */
function IconAction({ label, name, onClick, loading = false, disabled = false, children, ...rest }: { label: string; /** The accessible name when it says more than the word ("Save to your phone"). */ name?: string; onClick: () => void; loading?: boolean; disabled?: boolean; children: React.ReactNode; [k: `data-${string}`]: string }) {
  return (
    <button type="button" aria-label={name ?? label} aria-busy={loading || undefined} disabled={disabled || loading} onClick={onClick} className="flex w-[84px] flex-col items-center gap-1 rounded-button text-ink disabled:opacity-60" {...rest}>
      <span className="flex h-11 w-11 items-center justify-center rounded-pill border border-line bg-surface">{children}</span>
      <span className="text-caption text-ink-2">{label}</span>
    </button>
  );
}
