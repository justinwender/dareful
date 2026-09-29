import { CREAM_RGB } from "./palette";
/**
 * Cutting a subject inside the app (docs/design.md 3.28, frame 5; Round C, pre-approved). MediaPipe's interactive
 * segmenter runs in the browser and returns a confidence mask for the point tapped; the mask is thresholded near
 * 0.5, feathered a pixel or two, applied as alpha, cropped to the subject and sent through the same paste path a
 * lifted cutout takes (cutout-clipboard.ts), so the server trims, squares, measures and bakes the edge as before.
 * It is what lets stickers work on Android and laptops, where the iPhone's lift does not exist; where the runtime
 * or the model cannot load, the lift path (frames 2 and 3) stands in.
 *
 * The runtime (about 11MB of wasm) and the model (about 6MB) load only when someone opens the sheet, once per
 * page, and the browser keeps both: the runtime from the CDN under immutable headers, the model in the Cache API
 * by hand, since its host allows an hour and the service worker caches nothing (it has no fetch handler). The
 * pixel rules are pure functions, tested with their own pixels; the browser part is the last third of the file.
 */
import { trimBounds, type Box } from "@/lib/media/cutout";

/** The runtime's files, pinned to the installed package's version. */
export const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
/** The interactive segmenter's published model (magic touch, float32). */
export const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite";
/** The long edge the photo is cut at: the paste path's own bound, so a cutout is never larger than a pasted one. */
export const CUT_EDGE = 1024;
/** A pixel is the subject from this confidence up (the doc: near 0.5). */
export const CUT_THRESHOLD = 0.5;
/** How far the edge is softened, in pixels (the doc: 1 to 2). */
export const FEATHER_PX = 1;
/** The dashed cream outline's width outside the subject, in source pixels. */
export const OUTLINE_PX = 2;

/** Opaque where the confidence reaches the threshold, clear elsewhere. Pure. */
export function maskFromConfidence(conf: Float32Array, threshold = CUT_THRESHOLD): Uint8Array {
  const out = new Uint8Array(conf.length);
  for (let i = 0; i < conf.length; i++) out[i] = (conf[i] ?? 0) >= threshold ? 255 : 0;
  return out;
}

/** A mask the model returned at its own size, brought to the image's by nearest neighbour. Pure. */
export function resampleMask(conf: Float32Array, fromW: number, fromH: number, toW: number, toH: number): Float32Array {
  if (fromW === toW && fromH === toH) return conf;
  const out = new Float32Array(toW * toH);
  for (let y = 0; y < toH; y++) {
    const sy = Math.min(fromH - 1, Math.floor((y * fromH) / toH));
    for (let x = 0; x < toW; x++) {
      const sx = Math.min(fromW - 1, Math.floor((x * fromW) / toW));
      out[y * toW + x] = conf[sy * fromW + sx] ?? 0;
    }
  }
  return out;
}

/** The mask softened by a box blur `radius` pixels wide, so the cut edge is a ramp rather than a stair. Pure. */
export function feather(mask: Uint8Array, width: number, height: number, radius = FEATHER_PX): Uint8ClampedArray {
  if (radius <= 0) return Uint8ClampedArray.from(mask);
  const span = radius * 2 + 1;
  const rows = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += mask[y * width + Math.min(width - 1, Math.max(0, x))] ?? 0;
    for (let x = 0; x < width; x++) {
      rows[y * width + x] = sum / span;
      const leaving = Math.max(0, x - radius);
      const arriving = Math.min(width - 1, x + radius + 1);
      sum += (mask[y * width + arriving] ?? 0) - (mask[y * width + leaving] ?? 0);
    }
  }
  const out = new Uint8ClampedArray(width * height);
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += rows[Math.min(height - 1, Math.max(0, y)) * width + x] ?? 0;
    for (let y = 0; y < height; y++) {
      out[y * width + x] = Math.round(sum / span);
      const leaving = Math.max(0, y - radius);
      const arriving = Math.min(height - 1, y + radius + 1);
      sum += (rows[arriving * width + x] ?? 0) - (rows[leaving * width + x] ?? 0);
    }
  }
  return out;
}

/** The alpha written into the image's pixels, in place. Pure. */
export function applyAlpha(rgba: Uint8ClampedArray, alpha: Uint8ClampedArray): void {
  for (let i = 0, p = 3; i < alpha.length; i++, p += 4) rgba[p] = alpha[i] ?? 0;
}

/**
 * The pixels within `px` outside the subject (alpha under 128 next to alpha at or over it): the band the dashed
 * cream outline is drawn in (3.28, frame 5). Pure.
 */
export function edgeBand(alpha: Uint8ClampedArray, width: number, height: number, px = OUTLINE_PX): Uint8Array {
  let inside = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) inside[i] = (alpha[i] ?? 0) >= 128 ? 1 : 0;
  const start = inside;
  for (let step = 0; step < px; step++) {
    const grown = new Uint8Array(inside);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (inside[y * width + x]) continue;
        if ((x > 0 && inside[y * width + x - 1]) || (x < width - 1 && inside[y * width + x + 1]) || (y > 0 && inside[(y - 1) * width + x]) || (y < height - 1 && inside[(y + 1) * width + x])) grown[y * width + x] = 1;
      }
    }
    inside = grown;
  }
  const band = new Uint8Array(width * height);
  for (let i = 0; i < band.length; i++) band[i] = inside[i] && !start[i] ? 1 : 0;
  return band;
}

/** Whether a mask keeps anything at all: a tap on the background cuts nothing, and says so. Pure. */
export function keepsSomething(alpha: Uint8ClampedArray, minPixels = 64): boolean {
  let n = 0;
  for (let i = 0; i < alpha.length; i++) if ((alpha[i] ?? 0) >= 128 && ++n >= minPixels) return true;
  return false;
}

// ------------------------------------------------------------------------------------- the browser part

type Legacy = import("@mediapipe/tasks-vision").InteractiveSegmenterLegacy;
export type Segmenter = { seg: Legacy; /** How long the runtime and the model took to arrive and start, once per page. */ loadMs: number };

let loading: Promise<Segmenter> | null = null;

/** The model's bytes, kept in the Cache API after the first fetch (the host allows an hour; a sticker wants it for good). */
async function modelBytes(): Promise<Uint8Array<ArrayBuffer>> {
  const read = async (r: Response) => new Uint8Array(await r.arrayBuffer());
  try {
    if (typeof caches !== "undefined") {
      const cache = await caches.open("dareful-cut-model");
      const hit = await cache.match(MODEL_URL);
      if (hit) return read(hit);
      const fresh = await fetch(MODEL_URL);
      if (!fresh.ok) throw new Error(`model ${fresh.status}`);
      await cache.put(MODEL_URL, fresh.clone()).catch(() => undefined);
      return read(fresh);
    }
  } catch (err) {
    // A cache that refuses (private windows) is not a reason to fail: fetch it plainly.
    console.warn("cut model: cache unavailable", err instanceof Error ? err.message : err);
  }
  const r = await fetch(MODEL_URL);
  if (!r.ok) throw new Error(`model ${r.status}`);
  return read(r);
}

/** The segmenter, loaded once per page on first use and shared after; a failure clears the promise so a later open tries again. */
export function loadSegmenter(): Promise<Segmenter> {
  if (!loading) {
    const started = performance.now();
    loading = (async () => {
      const [{ FilesetResolver, InteractiveSegmenterLegacy }, bytes] = await Promise.all([import("@mediapipe/tasks-vision"), modelBytes()]);
      const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
      // The runtime takes the model by path (the legacy class refused the bytes outright, found in the real session): the cached bytes go in as a blob URL, revoked once read.
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
      try {
        const seg = await InteractiveSegmenterLegacy.createFromOptions(fileset, { baseOptions: { modelAssetPath: url }, outputConfidenceMasks: true, outputCategoryMask: false, runningMode: "IMAGE" });
        return { seg, loadMs: Math.round(performance.now() - started) };
      } finally {
        URL.revokeObjectURL(url);
      }
    })().catch((err: unknown) => {
      loading = null;
      throw err;
    });
  }
  return loading;
}

export type Cut = { blob: Blob; /** The alpha over the whole source at the cut size, for the outline. */ alpha: Uint8ClampedArray; width: number; height: number; box: Box; cutMs: number };

/**
 * One cut: the photo drawn at the cut size, the model asked about the point tapped (normalised, 0 to 1), the
 * confidence mask turned into a feathered alpha, the subject cropped to its box and encoded as a PNG with alpha.
 * Null when the tap kept nothing (the background).
 */
export async function cutAt(segmenter: Segmenter, bitmap: ImageBitmap, nx: number, ny: number): Promise<Cut | null> {
  const started = performance.now();
  const scale = Math.min(1, CUT_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(bitmap, 0, 0, width, height);
  const result = segmenter.seg.segment(canvas, { keypoint: { x: Math.min(1, Math.max(0, nx)), y: Math.min(1, Math.max(0, ny)) } });
  const mask = result.confidenceMasks?.[0];
  if (!mask) {
    result.close();
    throw new Error("no mask");
  }
  const conf = resampleMask(Float32Array.from(mask.getAsFloat32Array()), mask.width, mask.height, width, height);
  result.close();
  const alpha = feather(maskFromConfidence(conf), width, height);
  if (!keepsSomething(alpha)) return null;
  const image = ctx.getImageData(0, 0, width, height);
  applyAlpha(image.data, alpha);
  const box = trimBounds(new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength), width, height);
  if (!box) return null;
  const out = document.createElement("canvas");
  out.width = box.width;
  out.height = box.height;
  const octx = out.getContext("2d");
  if (!octx) throw new Error("no 2d context");
  ctx.putImageData(image, 0, 0);
  octx.drawImage(canvas, box.left, box.top, box.width, box.height, 0, 0, box.width, box.height);
  const blob = await new Promise<Blob>((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error("no png"))), "image/png"));
  return { blob, alpha, width, height, box, cutMs: Math.round(performance.now() - started) };
}

/** The cream of the outline (docs/design.md 1.7). */
const CREAM = `rgb(${CREAM_RGB})`;

/**
 * The dashed cream outline around the subject (3.28, frame 5), drawn onto a canvas the size of the cut: the edge
 * band filled cream, then cut into dashes by a diagonal stripe pattern, so a raster edge reads as a dashed line.
 */
export function drawOutline(target: HTMLCanvasElement, cut: Pick<Cut, "alpha" | "width" | "height">): void {
  target.width = cut.width;
  target.height = cut.height;
  const ctx = target.getContext("2d");
  if (!ctx) return;
  const band = edgeBand(cut.alpha, cut.width, cut.height);
  const image = ctx.createImageData(cut.width, cut.height);
  for (let i = 0, p = 0; i < band.length; i++, p += 4) {
    if (!band[i]) continue;
    image.data[p] = 242;
    image.data[p + 1] = 237;
    image.data[p + 2] = 227;
    image.data[p + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const tile = document.createElement("canvas");
  tile.width = 12;
  tile.height = 12;
  const tctx = tile.getContext("2d");
  if (!tctx) return;
  tctx.strokeStyle = CREAM;
  tctx.lineWidth = 5;
  tctx.beginPath();
  tctx.moveTo(-3, 9);
  tctx.lineTo(9, -3);
  tctx.moveTo(3, 15);
  tctx.lineTo(15, 3);
  tctx.stroke();
  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) return;
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, cut.width, cut.height);
  ctx.globalCompositeOperation = "source-over";
}
