"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { addStickerAction } from "@/lib/actions/media";
import { emojiInk, normaliseMark } from "@/lib/ui/emoji-ink";
import { hueStrokeVar, type Hue } from "@/lib/ui/hue";
import type { InkName } from "@/lib/ui/ink";
import { imageFromClipboard, imageFromPaste, NotACutoutHere, prepareCutout } from "@/lib/ui/cutout-clipboard";
import { stickerSrc, type PickedMark } from "@/lib/ui/mark";
import { cn } from "@/lib/utils";

import { CATEGORIES, matches, readRecent, readTones, remember, rememberTone, type CatalogRow as Row } from "@/lib/ui/mark-catalog";

const LONG_PRESS_MS = 500;

let catalog: Promise<Row[]> | null = null;
function loadCatalog(): Promise<Row[]> {
  catalog ??= import("@/lib/ui/emoji-catalog.json").then((m) => (m.default ?? m) as unknown as Row[]);
  return catalog;
}

export type Sticker = { id: string; ink: InkName | null; /** A cutout still on its way up (the field round, 2.5): shown from the device's own copy, not yet pickable. */ preview?: string };

/** What a sticker's cell draws: the device's copy while it is on its way, the stored one after. Pure. */
export function stickerCell(s: Sticker, src: (id: string) => string): { src: string; pending: boolean } {
  return s.preview ? { src: s.preview, pending: true } : { src: src(s.id), pending: false };
}

/**
 * The mark picker (docs/design.md 3.29, as amended 2026-10-08): a modal sheet on the current place's surface that
 * opens raised and drags up to full, as every sheet that covers the screen for a task does. Search, the hueless line
 * while it applies, "Your stickers" (3.28: a pasted cutout lands here, above Recent, in the same cell size), Recent
 * (with the dashed None cell first, the no-mark option), the category chips as words, which stay at the top and jump
 * to their category, and every category in one grid under its name (it showed one at a time, Food first, and people
 * found nothing else without searching): 8 columns of 44px cells, emoji at 28px. A tap sets the mark at once and the picker stays open so the
 * person can try another; seeing the colour arrive is how they learn what a mark does. It offers only what the
 * tile renderer can draw (the catalog is the ink table's keys), and the grid draws them with the phone's own
 * font while the ink always comes from the table.
 *
 * A sticker arrives by paste: the clipboard event anywhere in the sheet, or the cell that asks the clipboard.
 * The cutout is checked for transparency here, sent, and comes back as a sticker with the ink measured from
 * its own pixels, which the room retints to at once, the same as an emoji.
 *
 * `preview`: whether the picker sits on something that retints (a market's question step). For a unit's mark
 * there is no preview: nothing retints and the hueless line never shows, because units take no ink (1.7).
 */
export function MarkPicker({ open, onClose, value, onPick, hue, preview = true, stickers = [], canPaste = false }: { open: boolean; onClose: () => void; value: PickedMark | null; onPick: (mark: PickedMark | null) => void; hue: Hue; preview?: boolean; /** This person's stickers, newest first. */ stickers?: Sticker[]; /** Whether a cutout can be stored at all (the bucket is configured). */ canPaste?: boolean }) {
  const titleId = useId();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [query, setQuery] = useState("");
  // The category in view, which its chip shows; a chip jumps to its category (the touch-ups round).
  const [group, setGroup] = useState(CATEGORIES[0]?.group ?? 0);
  const sections = useRef(new Map<number, HTMLElement>());
  const [recent, setRecent] = useState<string[]>([]);
  const [tones, setTones] = useState<Record<string, number>>({});
  const [toneFor, setToneFor] = useState<Row | null>(null);
  const [mine, setMine] = useState<Sticker[]>(stickers);
  const [pasting, setPasting] = useState(false);
  const [pasteProblem, setPasteProblem] = useState<string | null>(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  // Each opening re-reads this device's recents and tones (derived state, in render); the catalog loads once, lazily.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setRecent(readRecent());
      setTones(readTones());
      setPasteProblem(null);
    }
  }
  useEffect(() => {
    if (!open || rows !== null) return;
    let live = true;
    void loadCatalog().then((r) => {
      if (live) setRows(r);
    });
    return () => {
      live = false;
    };
  }, [open, rows]);

  async function takeCutout(blob: Blob) {
    setPasteProblem(null);
    setPasting(true);
    // Shrunk on the device first, then shown at once from the device's copy while the upload runs behind it (the field round, 2.5).
    const pendingId = `pending-${Date.now()}`;
    let preview: string | null = null;
    try {
      const png = await prepareCutout(blob);
      preview = URL.createObjectURL(png);
      setMine((m) => [{ id: pendingId, ink: null, preview: preview as string }, ...m]);
      const form = new FormData();
      form.set("cutout", png, "cutout.png");
      form.set("source", "pasted");
      const r = await addStickerAction(form);
      if ("error" in r) {
        setMine((m) => m.filter((s) => s.id !== pendingId));
        return setPasteProblem(r.error);
      }
      const sticker: Sticker = { id: r.id, ink: r.ink };
      setMine((m) => m.map((s) => (s.id === pendingId ? sticker : s)));
      onPick({ kind: "sticker", id: sticker.id, ink: sticker.ink });
    } catch (err) {
      setMine((m) => m.filter((s) => s.id !== pendingId));
      setPasteProblem(err instanceof NotACutoutHere ? err.message : "That cutout couldn’t be read.");
    } finally {
      if (preview) URL.revokeObjectURL(preview);
      setPasting(false);
    }
  }
  // A paste anywhere while the picker is open is a cutout arriving (3.28, way 1).
  useEffect(() => {
    if (!open || !canPaste) return;
    const onPaste = (e: ClipboardEvent) => {
      const file = imageFromPaste(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      void takeCutout(file);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- takeCutout reads only fresh state through setters
  }, [open, canPaste]);
  async function askClipboard() {
    setPasteProblem(null);
    try {
      const blob = await imageFromClipboard();
      if (!blob) return setPasteProblem("Nothing to paste yet. Lift a subject out of a photo, copy it, then come back.");
      await takeCutout(blob);
    } catch (err) {
      setPasteProblem(err instanceof NotACutoutHere ? err.message : "Copy a cutout first, then paste it here.");
    }
  }

  const byGlyph = useMemo(() => new Map((rows ?? []).map((r) => [r[0], r])), [rows]);
  const shown = useMemo(() => (rows && query.trim() ? rows.filter((r) => matches(r, query)) : []), [rows, query]);
  const byCategory = useMemo(() => CATEGORIES.map((c) => ({ ...c, rows: (rows ?? []).filter((r) => r[2] === c.group) })), [rows]);
  // The chip follows the category under the row of chips as the grid scrolls.
  useEffect(() => {
    const first = sections.current.values().next().value;
    const box = first?.closest<HTMLElement>("[data-sheet-scroll]");
    if (!open || !box || query.trim() || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const g = top ? Number((top.target as HTMLElement).dataset.category) : NaN;
        if (Number.isFinite(g)) setGroup(g);
      },
      { root: box, rootMargin: "-56px 0px -60% 0px" },
    );
    for (const el of sections.current.values()) io.observe(el);
    return () => io.disconnect();
  }, [open, query, rows]);
  function jumpTo(g: number) {
    setGroup(g);
    const still = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    sections.current.get(g)?.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
  }
  const picked = value?.kind === "emoji" ? normaliseMark(value.value) : null;
  const hueless = preview && value !== null && (value.kind === "emoji" ? emojiInk(value.value) === null : value.ink === null);
  /** The glyph a cell shows and picks: the base, or the tone this device chose for it. */
  const toned = (row: Row): string => {
    const tone = tones[row[0]] ?? 0;
    return tone > 0 && row[4] ? (row[4][tone - 1] ?? row[0]) : row[0];
  };
  function pick(glyph: string | null, name: string | null = null) {
    onPick(glyph ? { kind: "emoji", value: glyph, name } : null);
    if (glyph) setRecent(remember(glyph));
  }
  function startPress(row: Row) {
    longPressed.current = false;
    if (!row[4]) return;
    press.current = setTimeout(() => {
      longPressed.current = true;
      setToneFor(row);
    }, LONG_PRESS_MS);
  }
  function endPress() {
    if (press.current) clearTimeout(press.current);
    press.current = null;
  }
  const ring = (on: boolean) => (on ? { boxShadow: `inset 0 0 0 1.5px ${hueStrokeVar(hue)}` } : undefined);

  const cell = (row: Row, key: string) => {
    const glyph = toned(row);
    const on = picked !== null && normaliseMark(glyph) === picked;
    return (
      <button
        key={key}
        type="button"
        aria-label={row[1]}
        aria-pressed={on}
        onPointerDown={() => startPress(row)}
        onPointerUp={endPress}
        onPointerLeave={endPress}
        onPointerCancel={endPress}
        onContextMenu={(e) => {
          if (row[4]) {
            e.preventDefault();
            setToneFor(row);
          }
        }}
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          pick(glyph, row[1]);
        }}
        data-press={on ? "fill" : "line"}
        className={cn("flex aspect-square h-11 w-full items-center justify-center rounded-stamp-28 text-[28px] leading-none", on ? "bg-field press-fill" : "press-line")}
        style={ring(on)}
      >
        {glyph}
      </button>
    );
  };

  return (
    <Sheet open={open} onClose={onClose} labelledBy={titleId} closeLabel="Done">
      <h2 id={titleId} className="sr-only">
        Pick a mark
      </h2>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search"
        aria-label="Search marks"
        autoComplete="off"
        className="h-11 w-full rounded-button bg-field px-4 text-body text-ink placeholder:text-ink-3"
      />
      {!query.trim() && (canPaste || mine.length > 0) ? (
        // Reserved for stickers (3.29), now in use (3.28): the paste cell first, then this person's stickers, newest first.
        <div className="flex flex-col gap-2" data-stickers="">
          <p className="text-label text-ink-3">Your stickers</p>
          <div className="grid grid-cols-8 gap-[2px]">
            {canPaste ? (
              <button type="button" aria-label="Paste a cutout" aria-busy={pasting || undefined} disabled={pasting} onClick={() => void askClipboard()} data-press="line" className="flex aspect-square h-11 w-full items-center justify-center rounded-stamp-28 border-[1.5px] border-dashed border-line-strong text-ink-2 press-line">
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6" y="5" width="12" height="16" rx="2" />
                  <path d="M9 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M12 10v6M9 13h6" />
                </svg>
              </button>
            ) : null}
            {mine.map((s) => {
              const on = value?.kind === "sticker" && value.id === s.id;
              const cell = stickerCell(s, (id) => stickerSrc(id, 44));
              return (
                <button key={s.id} type="button" aria-label={cell.pending ? "A sticker on its way" : "One of your stickers"} aria-busy={cell.pending || undefined} disabled={cell.pending} aria-pressed={on} onClick={() => onPick({ kind: "sticker", id: s.id, ink: s.ink })} data-press={on ? "fill" : "line"} className={cn("flex aspect-square h-11 w-full items-center justify-center rounded-stamp-28", on ? "bg-field press-fill" : "press-line")} style={ring(on)}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- behind the mark's own door */}
                  <img src={cell.src} alt="" width={35} height={35} className={cn("h-[35px] w-[35px] object-contain", cell.pending && "opacity-50")} />
                </button>
              );
            })}
          </div>
          {pasteProblem ? <p className="text-caption text-ink-2">{pasteProblem}</p> : null}
        </div>
      ) : null}
      {!query.trim() ? (
        <div className="flex flex-col gap-2">
          <p className="text-label text-ink-3">Recent</p>
          <div className="grid grid-cols-8 gap-[2px]">
            <button type="button" aria-label="No mark" aria-pressed={value === null} onClick={() => pick(null)} data-press={value === null ? "fill" : "line"} className={cn("flex aspect-square h-11 w-full items-center justify-center rounded-stamp-28 border-[1.5px] border-dashed border-line-strong text-label text-ink-3", value === null ? "bg-field press-fill" : "press-line")} style={ring(value === null)} data-no-mark="">
              None
            </button>
            {recent.map((g) => {
              const row = byGlyph.get(normaliseMark(g)) ?? byGlyph.get(g);
              return row ? cell(tones[row[0]] ? row : [g, row[1], row[2], row[3], row[4]], `r-${g}`) : null;
            })}
          </div>
        </div>
      ) : null}
      {!query.trim() ? (
        // The row of categories stays at the top of the sheet while it scrolls, whole across it, an icon for each, and
        // jumps to its category (the touch-ups round; the final round, section 7). It never shrinks: a row that scrolled
        // sideways in the sheet's column could be squeezed to a sliver under the recents.
        <div role="tablist" aria-label="Categories" className="sticky -top-3 z-10 -mx-4 flex shrink-0 items-center justify-between bg-surface px-4 py-2" data-category-jump="">
          {CATEGORIES.map((c) => (
            <button key={c.group} type="button" role="tab" aria-selected={group === c.group} aria-label={c.label} title={c.label} onClick={() => jumpTo(c.group)} data-press={group === c.group ? "fill" : "line"} className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-pill border text-[20px] leading-none", group === c.group ? "border-ink-3 bg-surface-2 press-fill" : "border-transparent press-line")}>
              <span aria-hidden="true">{c.icon}</span>
            </button>
          ))}
        </div>
      ) : null}
      {rows === null ? (
        <p className="text-caption text-ink-3">Loading the marks.</p>
      ) : query.trim() ? (
        <div className="flex flex-col gap-2">
          <p className="text-label text-ink-3">Matches</p>
          {shown.length === 0 ? <p className="text-caption text-ink-3">Nothing called that. Try a plainer word.</p> : <div className="grid grid-cols-8 gap-[2px]">{shown.map((r) => cell(r, r[0]))}</div>}
        </div>
      ) : (
        byCategory.map((c) => (
          <section
            key={c.group}
            ref={(el) => {
              if (el) sections.current.set(c.group, el);
              else sections.current.delete(c.group);
            }}
            data-category={c.group}
            aria-label={c.label}
            className="flex scroll-mt-14 flex-col gap-2"
          >
            <p className="text-label text-ink-3">{c.label}</p>
            <div className="grid grid-cols-8 gap-[2px]">{c.rows.map((r) => cell(r, r[0]))}</div>
          </section>
        ))
      )}
      {toneFor ? (
        <div role="dialog" aria-label={`Skin tone for ${toneFor[1]}`} data-fixed="bottom" className="fixed inset-x-4 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-[398px] items-center justify-between gap-1 rounded-card border border-line-strong bg-surface p-2">
          {[toneFor[0], ...(toneFor[4] || [])].map((g, i) => (
            <button
              key={g}
              type="button"
              aria-label={i === 0 ? `${toneFor[1]}, default` : `${toneFor[1]}, tone ${i}`}
              onClick={() => {
                rememberTone(toneFor[0], i);
                setTones((t) => ({ ...t, [toneFor[0]]: i }));
                pick(g, toneFor[1]);
                setToneFor(null);
              }}
              data-press="line"
              className="flex h-11 w-11 items-center justify-center rounded-stamp-28 text-[28px] leading-none press-line"
            >
              {g}
            </button>
          ))}
        </div>
      ) : null}
    </Sheet>
  );
}
