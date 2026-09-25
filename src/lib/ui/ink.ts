/**
 * Market inks (docs/design.md 1.8). Every market is its own place: one of eight colour families at matched
 * lightness and chroma, so no market can shout louder than another. Each ink has six layers. On a market's own
 * screen the four structural tokens (ground, surface, line, and the question band's field) are swapped for its
 * layers; everywhere else the ink shows only as the stamp behind the mark, on `field`.
 *
 * How a mark picks its ink, in the specification's order: the creator's pick; otherwise the mark's dominant hue
 * snapped to the nearest of the eight; hueless marks and markets with no mark fall through to a hash of the
 * market id; and balance last, so that among markets open between the same people no two share an ink while
 * fewer than eight are open. The chosen ink is stored on the row, so balance can be checked without pixels.
 */
export const INK_NAMES = ["clay", "ochre", "olive", "sea", "slate", "iris", "plum", "rose"] as const;
export type InkName = (typeof INK_NAMES)[number];
export type InkSource = "pick" | "mark" | "hash";

export type InkLayers = { hue: number; ground: string; surface: string; field: string; line: string; ink: string; hi: string; inkRgb: string };

export const INKS: Record<InkName, InkLayers> = {
  clay: { hue: 45, ground: "#18110E", surface: "#221916", field: "#3C281F", line: "#3F322C", ink: "#C69078", hi: "#E4BAA7", inkRgb: "198,144,120" },
  ochre: { hue: 85, ground: "#15120C", surface: "#1F1B13", field: "#362D19", line: "#3B3529", ink: "#B49B68", hi: "#D5C29C", inkRgb: "180,155,104" },
  olive: { hue: 112, ground: "#13130D", surface: "#1C1D14", field: "#2E301B", line: "#35372A", ink: "#9FA36D", hi: "#C4C8A0", inkRgb: "159,163,109" },
  sea: { hue: 192, ground: "#0C1514", surface: "#131E1E", field: "#173332", line: "#283938", ink: "#63AEAA", hi: "#9BD0CD", inkRgb: "99,174,170" },
  slate: { hue: 248, ground: "#0E1318", surface: "#161D23", field: "#202F3E", line: "#2D3740", ink: "#79A3CB", hi: "#A9C8E7", inkRgb: "121,163,203" },
  iris: { hue: 288, ground: "#121218", surface: "#1B1B23", field: "#2D2B3E", line: "#353440", ink: "#9C97CB", hi: "#C2BFE7", inkRgb: "156,151,203" },
  plum: { hue: 330, ground: "#161115", surface: "#20191F", field: "#382836", line: "#3C313B", ink: "#BA8EB5", hi: "#D9B8D5", inkRgb: "186,142,181" },
  rose: { hue: 8, ground: "#181012", surface: "#23191A", field: "#3D272A", line: "#403133", ink: "#C88B95", hi: "#E5B6BD", inkRgb: "200,139,149" },
};

export function isInkName(v: unknown): v is InkName {
  return typeof v === "string" && (INK_NAMES as readonly string[]).includes(v);
}

/** The shorter way round the wheel between two hues, in degrees. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

/** The mark's own lightness and chroma are thrown away: only the hue snaps, to the nearest of the eight. */
export function nearestInk(hue: number): InkName {
  let best: InkName = "clay";
  let bestD = Number.POSITIVE_INFINITY;
  for (const name of INK_NAMES) {
    const d = hueDistance(hue, INKS[name].hue);
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}

/** A hueless mark, or no mark at all: an ink from the market id, stable for the market's life. */
export function hashInk(id: string): InkName {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return INK_NAMES[h % INK_NAMES.length] ?? "ochre";
}

/**
 * Balance among the markets open between the same people: while fewer than eight are open no two share an ink.
 * A collision moves the newcomer to the nearest free neighbour on the wheel, the clockwise one on a tie.
 */
export function balanceInk(wanted: InkName, taken: readonly InkName[]): InkName {
  const used = new Set(taken);
  if (!used.has(wanted) || used.size >= INK_NAMES.length) return wanted;
  const free = INK_NAMES.filter((n) => !used.has(n));
  let best: InkName | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const n of free) {
    const d = hueDistance(INKS[wanted].hue, INKS[n].hue);
    const clockwise = (INKS[n].hue - INKS[wanted].hue + 360) % 360 === d;
    if (d < bestD || (d === bestD && clockwise && best !== null && (INKS[best].hue - INKS[wanted].hue + 360) % 360 !== d)) {
      bestD = d;
      best = n;
    }
  }
  return best ?? wanted;
}

/**
 * The ink a market gets, and why. A creator's pick is honoured as picked: balance is for inks nobody chose.
 * `markHue` is the mark's dominant hue in degrees, or null for a hueless mark or no mark.
 */
export function inkFor(input: { pick?: InkName | null; markHue: number | null; id: string; takenInGroup: readonly InkName[] }): { ink: InkName; source: InkSource } {
  if (input.pick) return { ink: input.pick, source: "pick" };
  if (input.markHue !== null && Number.isFinite(input.markHue)) return { ink: balanceInk(nearestInk(input.markHue), input.takenInGroup), source: "mark" };
  return { ink: balanceInk(hashInk(input.id), input.takenInGroup), source: "hash" };
}

/** A row written before inks existed has none stored; it reads as the hash, which is what it would have been given. */
export function inkOf(d: { id: string; ink: string | null }): InkName {
  return isInkName(d.ink) ? d.ink : hashInk(d.id);
}

/**
 * The CSS custom properties a market's own screen sets on its root, so every `bg-ground`, `bg-surface` and
 * `border-line` inside it reads the market's layers without knowing they did (1.1, 1.8). Type colours, the
 * chalk button, the citron dot and person hues are never tinted, and none of them read these.
 */
export function inkVars(name: InkName): Record<string, string> {
  const ink = INKS[name];
  return {
    "--ground": ink.ground,
    "--surface": ink.surface,
    "--line": ink.line,
    "--field": ink.field,
    "--market-ink": ink.ink,
    "--market-ink-hi": ink.hi,
    "--market-wash": `rgba(${ink.inkRgb.replace(/,/g, ", ")}, 0.40)`,
  };
}
