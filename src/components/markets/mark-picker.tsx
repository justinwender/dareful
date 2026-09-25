"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { emojiInk, normaliseMark } from "@/lib/ui/emoji-ink";
import { hueVar, type Hue } from "@/lib/ui/hue";
import { cn } from "@/lib/utils";

import { CATEGORIES, matches, readRecent, readTones, remember, rememberTone, type CatalogRow as Row } from "@/lib/ui/mark-catalog";

const LONG_PRESS_MS = 500;

let catalog: Promise<Row[]> | null = null;
function loadCatalog(): Promise<Row[]> {
  catalog ??= import("@/lib/ui/emoji-catalog.json").then((m) => (m.default ?? m) as unknown as Row[]);
  return catalog;
}

/**
 * The mark picker (docs/design.md 3.29): a modal sheet 560px tall on the current place's surface. Search, the
 * hueless line while it applies, Recent (with the dashed None cell first, the no-mark option), the category
 * chips as words, and the grid: 8 columns of 44px cells, emoji at 28px. A tap sets the mark at once and the
 * picker stays open so the person can try another; seeing the colour arrive is how they learn what a mark
 * does. It offers only what the tile renderer can draw (the catalog is the ink table's keys), and the grid
 * draws them with the phone's own font while the ink always comes from the table.
 *
 * `preview`: whether the picker sits on something that retints (a market's question step). For a unit's mark
 * there is no preview: nothing retints and the hueless line never shows, because units take no ink (1.7).
 */
export function MarkPicker({ open, onClose, value, onPick, hue, preview = true }: { open: boolean; onClose: () => void; value: string | null; /** The glyph and its CLDR name, or null for no mark. */ onPick: (glyph: string | null, name: string | null) => void; hue: Hue; preview?: boolean }) {
  const titleId = useId();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [tones, setTones] = useState<Record<string, number>>({});
  const [toneFor, setToneFor] = useState<Row | null>(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  // Each opening re-reads this device's recents and tones (derived state, in render); the catalog loads once, lazily.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setRecent(readRecent());
      setTones(readTones());
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

  const byGlyph = useMemo(() => new Map((rows ?? []).map((r) => [r[0], r])), [rows]);
  const shown = useMemo(() => {
    if (!rows) return [];
    if (query.trim()) return rows.filter((r) => matches(r, query));
    return rows.filter((r) => r[2] === group);
  }, [rows, query, group]);
  const picked = value ? normaliseMark(value) : null;
  const hueless = preview && value !== null && emojiInk(value) === null;
  /** The glyph a cell shows and picks: the base, or the tone this device chose for it. */
  const toned = (row: Row): string => {
    const tone = tones[row[0]] ?? 0;
    return tone > 0 && row[4] ? (row[4][tone - 1] ?? row[0]) : row[0];
  };
  function pick(glyph: string | null, name: string | null = null) {
    onPick(glyph, name);
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
        className={cn("flex aspect-square h-11 w-full items-center justify-center rounded-stamp-28 text-[28px] leading-none", on && "bg-field")}
        style={on ? { boxShadow: `inset 0 0 0 1.5px ${hueVar(hue)}` } : undefined}
      >
        {glyph}
      </button>
    );
  };

  return (
    <Sheet open={open} onClose={onClose} labelledBy={titleId} closeLabel="Done" tall>
      <h2 id={titleId} className="sr-only">
        Pick a mark
      </h2>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search: moon, beer, dog"
        aria-label="Search marks"
        autoComplete="off"
        className="h-11 w-full rounded-button bg-field px-4 text-[15px] leading-[20px] text-ink placeholder:text-ink-3"
      />
      {hueless ? <p className="text-caption text-ink-2">Faces, people and grey marks don’t set a colour, so this market gets one of its own.</p> : null}
      {!query.trim() ? (
        <div className="flex flex-col gap-2">
          <p className="text-label text-ink-3">Recent</p>
          <div className="grid grid-cols-8 gap-[2px]">
            <button type="button" aria-label="No mark" aria-pressed={value === null} onClick={() => pick(null)} className={cn("flex aspect-square h-11 w-full items-center justify-center rounded-stamp-28 border-[1.5px] border-dashed border-line-strong text-ink-3", value === null && "bg-field")} style={value === null ? { boxShadow: `inset 0 0 0 1.5px ${hueVar(hue)}` } : undefined}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            {recent.map((g) => {
              const row = byGlyph.get(normaliseMark(g)) ?? byGlyph.get(g);
              return row ? cell(tones[row[0]] ? row : [g, row[1], row[2], row[3], row[4]], `r-${g}`) : null;
            })}
          </div>
        </div>
      ) : null}
      {!query.trim() ? (
        <div role="tablist" aria-label="Categories" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          {CATEGORIES.map((c) => (
            <button key={c.group} type="button" role="tab" aria-selected={group === c.group} onClick={() => setGroup(c.group)} className={cn("inline-flex h-9 shrink-0 items-center rounded-pill border px-3 chip-text", group === c.group ? "border-ink bg-ink text-ground" : "border-line-strong text-ink-2")}>
              {c.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <p className="text-label text-ink-3">{query.trim() ? "Matches" : (CATEGORIES.find((c) => c.group === group)?.label ?? "")}</p>
        {rows === null ? (
          <p className="text-caption text-ink-3">Loading the marks.</p>
        ) : shown.length === 0 ? (
          <p className="text-caption text-ink-3">Nothing called that. Try a plainer word.</p>
        ) : (
          <div className="grid grid-cols-8 gap-[2px]">{shown.map((r) => cell(r, r[0]))}</div>
        )}
      </div>
      {toneFor ? (
        <div role="dialog" aria-label={`Skin tone for ${toneFor[1]}`} className="fixed inset-x-4 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-[398px] items-center justify-between gap-1 rounded-card border border-line-strong bg-surface p-2">
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
              className="flex h-11 w-11 items-center justify-center rounded-stamp-28 text-[28px] leading-none"
            >
              {g}
            </button>
          ))}
        </div>
      ) : null}
    </Sheet>
  );
}
