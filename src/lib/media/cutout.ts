/**
 * The pixel rules for a sticker (docs/design.md 1.7, 1.8, 3.28; docs/marks-and-memories.md). Pure: RGBA buffers in,
 * RGBA buffers or numbers out, so each rule has a test that draws its own pixels. sharp does the decoding,
 * resizing and encoding around these (sticker.ts).
 *
 * Three rules live here. The trim finds the box the opaque pixels sit in, so a pasted cutout loses its empty
 * margins. The die-cut edge is a cream band a fixed distance outside the opaque shape, baked into the derivative
 * (dilate the alpha, fill it cream, composite under) rather than drawn with chained CSS shadows, so the app and
 * the tile renderer draw the same edge. The ink measurement is the emoji table's, applied to a sticker's own
 * opaque pixels: transparent pixels never vote, which is why a sticker usually picks a truer ink than the photo
 * it was lifted from.
 */
import { nearestInk, type InkName } from "@/lib/ui/ink";

export type Box = { left: number; top: number; width: number; height: number };

/** A pixel counts as part of the shape from this alpha (of 255) up, for the trim and the edge. */
export const SHAPE_ALPHA = 128;
/** The cream of the die-cut edge (docs/design.md 1.7). */
export const CREAM = { r: 242, g: 237, b: 227 } as const;

/** The smallest box holding every pixel with alpha at or above `minAlpha`, or null when there is none. */
export function trimBounds(rgba: Uint8Array, width: number, height: number, minAlpha = 8): Box | null {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((rgba[(y * width + x) * 4 + 3] ?? 0) < minAlpha) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return null;
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** What fraction of the pixels are see-through (alpha under the shape threshold). A photo has none; a cutout has its background. */
export function transparentFraction(rgba: Uint8Array, width: number, height: number): number {
  const n = width * height;
  if (n === 0) return 0;
  let clear = 0;
  for (let i = 0; i < n; i++) if ((rgba[i * 4 + 3] ?? 0) < SHAPE_ALPHA) clear++;
  return clear / n;
}

/** One-dimensional squared distance transform (Felzenszwalb and Huttenlocher), in place over `out`. */
function edt1d(f: Float64Array, n: number, out: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = Number.NEGATIVE_INFINITY;
  z[1] = Number.POSITIVE_INFINITY;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] ?? 0) + q * q - ((f[v[k] ?? 0] ?? 0) + (v[k] ?? 0) * (v[k] ?? 0))) / (2 * q - 2 * (v[k] ?? 0));
    while (s <= (z[k] ?? 0)) {
      k--;
      s = ((f[q] ?? 0) + q * q - ((f[v[k] ?? 0] ?? 0) + (v[k] ?? 0) * (v[k] ?? 0))) / (2 * q - 2 * (v[k] ?? 0));
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Number.POSITIVE_INFINITY;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while ((z[k + 1] ?? 0) < q) k++;
    const d = q - (v[k] ?? 0);
    out[q] = d * d + (f[v[k] ?? 0] ?? 0);
  }
}

/** The distance from every pixel to the nearest pixel of the shape (alpha at or above the threshold), exact, in pixels. */
export function distanceToShape(rgba: Uint8Array, width: number, height: number): Float64Array {
  const INF = 1e12;
  const g = new Float64Array(width * height);
  for (let i = 0; i < width * height; i++) g[i] = (rgba[i * 4 + 3] ?? 0) >= SHAPE_ALPHA ? 0 : INF;
  const n = Math.max(width, height);
  const f = new Float64Array(n);
  const out = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  // Columns, then rows: the 2D transform is separable.
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = g[y * width + x] ?? INF;
    edt1d(f, height, out, v, z);
    for (let y = 0; y < height; y++) g[y * width + x] = out[y] ?? INF;
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) f[x] = g[y * width + x] ?? INF;
    edt1d(f, width, out, v, z);
    for (let x = 0; x < width; x++) g[y * width + x] = Math.sqrt(out[x] ?? INF);
  }
  return g;
}

/**
 * The die-cut edge: a cream band `radius` pixels wide outside the opaque shape, anti-aliased at its outer rim,
 * composited under the sticker. The sticker's own pixels are untouched; pixels farther than the radius from the
 * shape stay fully transparent, so the corners of a square derivative are still see-through.
 */
export function dieCut(rgba: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const dist = distanceToShape(rgba, width, height);
  const out = new Uint8Array(rgba.length);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const sa = (rgba[o + 3] ?? 0) / 255;
    const d = dist[i] ?? Number.POSITIVE_INFINITY;
    const ea = d <= 0 ? 1 : Math.max(0, Math.min(1, radius + 0.5 - d));
    // Source over cream: the cream shows only where the sticker does not cover it.
    const a = sa + ea * (1 - sa);
    if (a <= 0) {
      out[o] = 0;
      out[o + 1] = 0;
      out[o + 2] = 0;
      out[o + 3] = 0;
      continue;
    }
    const mix = (c: number, cream: number) => Math.round((c * sa + cream * ea * (1 - sa)) / a);
    out[o] = mix(rgba[o] ?? 0, CREAM.r);
    out[o + 1] = mix(rgba[o + 1] ?? 0, CREAM.g);
    out[o + 2] = mix(rgba[o + 2] ?? 0, CREAM.b);
    out[o + 3] = Math.round(a * 255);
  }
  return out;
}

/** sRGB (0 to 255) to OKLCH lightness, chroma and hue in degrees, as scripts/emoji-inks.py computes it. */
export function srgbToOklch(r8: number, g8: number, b8: number): { L: number; C: number; h: number } {
  const lin = (c8: number) => {
    const c = c8 / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = lin(r8);
  const g = lin(g8);
  const b = lin(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(a, bb);
  const h = ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  return { L, C, h };
}

export type InkMeasure = { ink: InkName | null; chromaticFraction: number; hue: number | null; chroma: number | null };

/**
 * The emoji table's measurement (docs/design.md 1.8), on a sticker's own pixels: keep pixels with alpha over 0.5,
 * call a pixel chromatic at OKLCH chroma over 0.04, and with fewer than a quarter chromatic the mark is hueless
 * (null: the market hashes). Otherwise a 10 degree hue histogram weighted by chroma, the heaviest bin, and the
 * chroma-weighted circular mean within 15 degrees of that bin's centre, snapped through the same folds.
 */
export function measureInk(rgba: Uint8Array, width: number, height: number): InkMeasure {
  const bins = new Float64Array(36);
  const chromatic: Array<[number, number]> = [];
  let opaque = 0;
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    if ((rgba[o + 3] ?? 0) <= 127) continue;
    opaque++;
    const { C, h } = srgbToOklch(rgba[o] ?? 0, rgba[o + 1] ?? 0, rgba[o + 2] ?? 0);
    if (C > 0.04) {
      chromatic.push([C, h]);
      bins[Math.floor(h / 10) % 36] = (bins[Math.floor(h / 10) % 36] ?? 0) + C;
    }
  }
  const fraction = opaque === 0 ? 0 : chromatic.length / opaque;
  if (opaque === 0 || fraction < 0.25) return { ink: null, chromaticFraction: fraction, hue: null, chroma: null };
  let k = 0;
  for (let i = 1; i < 36; i++) if ((bins[i] ?? 0) > (bins[k] ?? 0)) k = i;
  const centre = k * 10 + 5;
  let sx = 0;
  let sy = 0;
  let cs = 0;
  let n = 0;
  for (const [C, h] of chromatic) {
    const d = Math.min(Math.abs(h - centre), 360 - Math.abs(h - centre));
    if (d > 15) continue;
    sx += C * Math.cos((h * Math.PI) / 180);
    sy += C * Math.sin((h * Math.PI) / 180);
    cs += C;
    n++;
  }
  const hue = ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360;
  const chroma = cs / Math.max(1, n);
  return { ink: nearestInk(hue, chroma), chromaticFraction: fraction, hue, chroma };
}
