"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { ProblemSummary } from "@/components/ledger/problem";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { InfoIcon } from "@/components/ui/info";
import { addStickerAction, removeMarketPhotoAction } from "@/lib/actions/media";
import { imageFromClipboard, imageFromPaste, NotACutoutHere, prepareCutout } from "@/lib/ui/cutout-clipboard";
import { cutAt, drawOutline, loadSegmenter, type Cut, type Segmenter } from "@/lib/ui/cut-subject";
import { CREAM } from "@/lib/ui/palette";
import { ScrimChip } from "./scrim-chip";
import { CutSheet, PHOTO_ROOM, StickerMade, StickerSheet } from "./sticker-from-photo";

/**
 * A photo full screen (docs/design.md 3.8, 3.38, 3.39): the frame's derivative on black in both themes (the dark
 * theme's ground, `PHOTO_ROOM`, with the close and the controls in cream, 10.2), a 13px counter at the top left
 * and the 48px close at the top right, and under the photo 44px icon buttons with their words in caption: "Make
 * a sticker" (3.28), "Save" (named "Save to your phone", through the share sheet, because a photo taken by the
 * camera inside a web app on an iPhone is not in the phone's own photos; where there is no share sheet the
 * browser saves the file) and, for whoever added a memory, "Remove", which is destructive (3.12) and asks once
 * in a sheet. The bytes come through the app's own door, which checks who is asking. Long-press on the
 * photo is left to the phone: the lift path depends on it (the phone's own Copy Subject).
 *
 * Making a sticker (3.28): the cut path first (frame 5, Round C), where a tap on the photo asks the model in the
 * browser for the subject and the chalk keeps it; the lift path (frames 2 and 3) wherever the runtime or the model
 * cannot load. Both end in the same upload and the same result screen.
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
  // Making a sticker (3.28): the guided sheet over the photo, then the result in the viewer's place.
  const [making, setMaking] = useState(false);
  const [pasting, setPasting] = useState(false);
  // The cut path (frame 5): the model, loaded once per page; the cut for the photo on screen; the timings for the phone check.
  const [mode, setMode] = useState<"cut" | "lift">("cut");
  const [segmenter, setSegmenter] = useState<Segmenter | null>(null);
  const [cutting, setCutting] = useState(false);
  const [cutState, setCutState] = useState<{ photoId: string; cut: Cut | null; cutMs: number | null } | null>(null);
  const bitmaps = useRef(new Map<string, Promise<ImageBitmap>>());
  const outline = useRef<HTMLCanvasElement>(null);
  const pendingTap = useRef<{ nx: number; ny: number } | null>(null);
  // A phone with the lift (an iPhone or iPad): while the model loads, the sheet offers the lift in the meantime.
  // Read once on the client; the sheet it steers is never open at the first render, so the server's false costs nothing.
  const [lift] = useState(() => typeof navigator !== "undefined" && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent))));
  const [made, setMade] = useState<{ id: string } | null>(null);
  const [stickerProblem, setStickerProblem] = useState<string | null>(null);
  const [current, setCurrent] = useState(Math.min(Math.max(index, 0), Math.max(items.length - 1, 0)));
  const rowRef = useRef<HTMLDivElement>(null);
  const shown = items[current] ?? items[0];
  const id = shown?.id ?? "";
  const alt = shown?.alt ?? "";
  const removable = shown?.removable === true;
  async function takeCutout(blob: Blob, source: "pasted" | "cut") {
    setStickerProblem(null);
    setPasting(true);
    try {
      const png = await prepareCutout(blob);
      const form = new FormData();
      form.set("cutout", png, "cutout.png");
      form.set("source", source);
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
  /** The photo's pixels, through the door, decoded once per photo. */
  const bitmapOf = useCallback((photoId: string): Promise<ImageBitmap> => {
    const had = bitmaps.current.get(photoId);
    if (had) return had;
    const made = fetch(`/api/media/${photoId}`)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`door ${r.status}`))))
      .then((b) => createImageBitmap(b));
    bitmaps.current.set(photoId, made);
    made.catch(() => bitmaps.current.delete(photoId));
    return made;
  }, []);
  const runCut = useCallback(
    async (seg: Segmenter, photoId: string, nx: number, ny: number) => {
      setCutting(true);
      setStickerProblem(null);
      try {
        const c = await cutAt(seg, await bitmapOf(photoId), nx, ny);
        setCutState({ photoId, cut: c, cutMs: c ? c.cutMs : null });
        if (!c) setStickerProblem("Nothing there to keep. Tap the thing itself.");
      } catch (err) {
        console.warn("cut failed", err instanceof Error ? err.message : err);
        setStickerProblem("That tap didn’t cut anything. Try another spot.");
      } finally {
        setCutting(false);
      }
    },
    [bitmapOf],
  );
  // Opening the sheet loads the model once per page; where it cannot load, the sheet becomes the lift path.
  useEffect(() => {
    if (!making || mode !== "cut" || segmenter) return;
    let gone = false;
    loadSegmenter()
      .then((s) => {
        if (gone) return;
        setSegmenter(s);
        const tap = pendingTap.current;
        pendingTap.current = null;
        if (tap) void runCut(s, id, tap.nx, tap.ny);
      })
      .catch((err: unknown) => {
        if (gone) return;
        console.warn("cut model unavailable; the lift path stands in", err instanceof Error ? err.message : err);
        setMode("lift");
      });
    return () => {
      gone = true;
    };
  }, [making, mode, segmenter, id, runCut]);
  // The cut belongs to the photo it was made on: another photo in view reads as no cut, and closing the sheet drops it.
  const cut = cutState && cutState.photoId === id && making ? cutState.cut : null;
  const cutMs = cutState && cutState.photoId === id && making ? cutState.cutMs : null;
  // The outline follows the cut, and clears with it.
  useEffect(() => {
    const canvas = outline.current;
    if (!canvas) return;
    if (cut) drawOutline(canvas, cut);
    else canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }, [cut]);
  function tapPhoto(e: React.MouseEvent<HTMLElement>) {
    if (!making || mode !== "cut" || cutting || pasting) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    if (segmenter) void runCut(segmenter, id, nx, ny);
    else pendingTap.current = { nx, ny };
  }
  // A paste anywhere while the sticker sheet is up is the cutout arriving (3.28): the phone's own Copy did the lift.
  useEffect(() => {
    if (!making) return;
    const onPaste = (e: ClipboardEvent) => {
      const file = imageFromPaste(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      void takeCutout(file, "pasted");
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [making]);
  async function askClipboard() {
    setStickerProblem(null);
    try {
      const blob = await imageFromClipboard();
      if (!blob) return setStickerProblem("Nothing to paste yet. Hold the photo, tap Copy Subject, then come back.");
      await takeCutout(blob, "pasted");
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
    <div role="dialog" aria-modal="true" aria-label={alt} data-photo-view={id} data-fixed="top" className="fixed inset-0 z-40 flex flex-col bg-ground pt-[env(safe-area-inset-top)]" style={PHOTO_ROOM}>
      <div className="grid h-14 shrink-0 grid-cols-[48px_minmax(0,1fr)_48px] items-center px-2" data-photo-header="">
        {/* For the hackathon the close sits at the top left, the counter in the centre and the information icon at the top right (10.3). */}
        <button type="button" aria-label="Close" onClick={onClose} data-press="line" className="inline-flex h-12 w-12 items-center justify-center rounded-pill press-line" style={{ color: CREAM }}>
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        {items.length > 1 ? (
          <ScrimChip className="mx-auto h-7 px-3 text-caption tabular-nums" data-album-counter="">
            {current + 1} / {items.length}
          </ScrimChip>
        ) : (
          <span />
        )}
        <InfoIcon sheet="photo" onPhoto />
      </div>
      <div ref={rowRef} onScroll={onScroll} className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none]" data-album="" aria-roledescription="album">
        {items.map((item, i) => (
          <div key={item.id} className="flex h-full w-full shrink-0 snap-center items-center justify-center px-2" aria-hidden={i !== current}>
            {/* The wrapper shrinks to the drawn image, so a tap's place on it is a place on the photo and the outline canvas lies over it exactly. The phone's long-press stays on: the lift path is the phone's own Copy Subject (3.28). */}
            <span className="relative inline-flex max-h-full max-w-full" onClick={i === current ? tapPhoto : undefined} data-photo-tap={i === current && making && mode === "cut" ? "" : undefined}>
              {/* A signed URL that expires; next/image would need a loader for one. The photo opens from the frame as `photo` (9.7): the one on screen carries the name the frame's image travels to. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/media/${item.id}`} alt={item.alt} loading={Math.abs(i - current) <= 1 ? "eager" : "lazy"} className="max-h-full max-w-full object-contain" data-photo-image="" style={i === current ? ({ viewTransitionName: "photo" } as CSSProperties) : undefined} />
              {i === current && making && mode === "cut" ? <canvas ref={outline} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" data-cut-outline={cut ? "" : undefined} /> : null}
            </span>
          </div>
        ))}
      </div>
      <div className="mx-auto flex w-full max-w-[430px] shrink-0 flex-col gap-2 px-5 pt-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <ProblemSummary messages={[problem]} />
        <div className="flex items-start justify-center gap-6" data-photo-actions="">
          {stickers ? (
            <IconAction label="Make a sticker" onClick={() => (setCutState(null), setStickerProblem(null), setMaking(true))} disabled={saving} data-make-sticker="">
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
      {mode === "cut" ? (
        <CutSheet
          open={making}
          busy={pasting || cutting || (making && !segmenter)}
          cut={cut !== null}
          problem={stickerProblem}
          timing={{ loadMs: segmenter?.loadMs ?? null, cutMs }}
          loading={making && !segmenter}
          lift={lift}
          onPaste={() => void askClipboard()}
          onKeep={() => (cut ? void takeCutout(cut.blob, "cut") : undefined)}
          onStartOver={() => {
            setCutState(null);
            setStickerProblem(null);
          }}
          onClose={() => (pasting || cutting ? undefined : setMaking(false))}
        />
      ) : (
        <StickerSheet open={making} pasting={pasting} problem={stickerProblem} onPaste={() => void askClipboard()} onClose={() => (pasting ? undefined : setMaking(false))} />
      )}
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

/**
 * A 44px icon button with its word in caption under it (3.38, the full-screen photo): the glyph in cream and the
 * word in the dark theme's second ink, as the export draws them, with nothing behind either, since the screen is
 * black in both themes (10.2). A control, outside the type budget.
 */
function IconAction({ label, name, onClick, loading = false, disabled = false, children, ...rest }: { label: string; /** The accessible name when it says more than the word ("Save to your phone"). */ name?: string; onClick: () => void; loading?: boolean; disabled?: boolean; children: React.ReactNode; [k: `data-${string}`]: string }) {
  return (
    <button type="button" aria-label={name ?? label} aria-busy={loading || undefined} disabled={disabled || loading} onClick={onClick} data-press="line" className="flex w-[84px] flex-col items-center gap-1 rounded-button press-line disabled:opacity-60" style={{ color: CREAM }} {...rest}>
      <span className="flex h-11 w-11 items-center justify-center">{children}</span>
      <span className="text-caption text-ink-2">{label}</span>
    </button>
  );
}
