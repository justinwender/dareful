/**
 * The mark picker's catalog and its rules (docs/design.md 3.29), apart from the sheet that draws them: what a
 * search matches, the category chips, and this device's recents and tones. The catalog itself
 * (src/lib/ui/emoji-catalog.json, made by scripts/emoji-catalog.mjs) is exactly the ink table's keys, which is
 * exactly what the tile renderer can draw, so a mark can never turn into a blank box in a group chat.
 */

/** One row of the catalog: the glyph, its CLDR name, its group, its tags, and its skin-tone variants or 0. */
export type CatalogRow = [glyph: string, name: string, group: number, tags: string, skins: string[] | 0];

/** The category chips as words (3.29), in the order the design gives them, over emojibase's group numbers. */
export const CATEGORIES: Array<{ label: string; group: number }> = [
  { label: "Smileys", group: 0 },
  { label: "People", group: 1 },
  { label: "Animals", group: 3 },
  { label: "Food", group: 4 },
  { label: "Activities", group: 6 },
  { label: "Travel", group: 5 },
  { label: "Objects", group: 7 },
  { label: "Symbols", group: 8 },
  { label: "Flags", group: 9 },
];
const RECENT_KEY = "dareful_marks_recent";
const TONE_KEY = "dareful_mark_tones";
export const RECENT_MAX = 7;

/** Search (3.29): any word of the name or the tags that starts with what was typed. */
export function matches(row: CatalogRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${row[1]} ${row[3]}`.toLowerCase().split(/[\s:,]+/).some((w) => w.startsWith(q));
}

/** The last seven marks picked on this device, most recent first. A device preference, never anything about a market. */
export function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}
export function remember(glyph: string): string[] {
  const next = [glyph, ...readRecent().filter((g) => g !== glyph)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: recents simply do not persist.
  }
  return next;
}
/** The tone picked last for each emoji, per device (3.29). Tone never changes the ink (1.8). */
export function readTones(): Record<string, number> {
  try {
    const raw = localStorage.getItem(TONE_KEY);
    const v: unknown = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
}
export function rememberTone(base: string, tone: number): void {
  try {
    const t = readTones();
    if (tone === 0) delete t[base];
    else t[base] = tone;
    localStorage.setItem(TONE_KEY, JSON.stringify(t));
  } catch {
    // Storage blocked.
  }
}
