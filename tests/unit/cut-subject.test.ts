/**
 * Cutting a subject inside the app (docs/design.md 3.28, frame 5): the pixel rules the model's mask goes through
 * before it becomes a cutout. Pure functions drawn with their own pixels: the threshold, the resampling, the
 * feather, the alpha, the outline's band and the empty-tap refusal. The model itself runs only in a browser.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAlpha, CUT_THRESHOLD, edgeBand, feather, keepsSomething, maskFromConfidence, resampleMask } from "@/lib/ui/cut-subject";

/** A width by height canvas of confidences with a solid block inside it. */
function block(width: number, height: number, box: { left: number; top: number; width: number; height: number }, inside = 0.9, outside = 0.1): Float32Array {
  const conf = new Float32Array(width * height).fill(outside);
  for (let y = box.top; y < box.top + box.height; y++) for (let x = box.left; x < box.left + box.width; x++) conf[y * width + x] = inside;
  return conf;
}

test("a pixel is the subject from half confidence up, and the threshold sits near 0.5 as the doc says", () => {
  const conf = Float32Array.from([0, 0.49, 0.5, 0.51, 0.9, 1]);
  assert.deepEqual(Array.from(maskFromConfidence(conf)), [0, 0, 255, 255, 255, 255]);
  assert.ok(CUT_THRESHOLD >= 0.4 && CUT_THRESHOLD <= 0.6, "near 0.5");
  assert.deepEqual(Array.from(maskFromConfidence(conf, 0.95)), [0, 0, 0, 0, 0, 255], "the threshold is the parameter, not a constant in the loop");
});

test("a mask the model returned at its own size is brought to the image's, and one already at it comes back as is", () => {
  const small = Float32Array.from([1, 0, 0, 1]);
  const big = resampleMask(small, 2, 2, 4, 4);
  assert.equal(big.length, 16);
  assert.deepEqual(Array.from(big.slice(0, 4)), [1, 1, 0, 0], "the top-left quarter is the first pixel");
  assert.deepEqual(Array.from(big.slice(12, 16)), [0, 0, 1, 1], "the bottom-right quarter is the last");
  assert.equal(resampleMask(small, 2, 2, 2, 2), small, "the same size is the same array");
  // A mask that is not square: each axis scales by its own ratio.
  const wide = resampleMask(Float32Array.from([1, 0, 0, 1]), 4, 1, 4, 2);
  assert.deepEqual(Array.from(wide), [1, 0, 0, 1, 1, 0, 0, 1], "four across stays four across, doubled down");
});

test("the feather softens the edge a pixel wide: a hard step becomes a ramp, and the inside and the far outside stay whole", () => {
  const w = 8;
  const h = 3;
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 4; x < w; x++) mask[y * w + x] = 255;
  const soft = feather(mask, w, h, 1);
  const row = Array.from(soft.slice(w, 2 * w));
  assert.equal(row[0], 0, "far outside stays clear");
  assert.equal(row[7], 255, "far inside stays opaque");
  assert.ok((row[3] ?? 0) > 0 && (row[3] ?? 0) < 128, `just outside the edge is a little opaque: ${row[3]}`);
  assert.ok((row[4] ?? 0) > 128 && (row[4] ?? 0) < 255, `just inside is a little clear: ${row[4]}`);
  assert.deepEqual(Array.from(feather(mask, w, h, 0)), Array.from(mask), "no radius, no change");
});

test("the alpha is written into the image's fourth channel and nothing else", () => {
  const rgba = Uint8ClampedArray.from([10, 20, 30, 255, 40, 50, 60, 255]);
  applyAlpha(rgba, Uint8ClampedArray.from([0, 200]));
  assert.deepEqual(Array.from(rgba), [10, 20, 30, 0, 40, 50, 60, 200]);
});

test("the outline's band is the pixels just outside the subject, as wide as asked, and never the subject itself", () => {
  const w = 9;
  const h = 9;
  const alpha = new Uint8ClampedArray(w * h);
  for (let y = 3; y < 6; y++) for (let x = 3; x < 6; x++) alpha[y * w + x] = 255;
  const band = edgeBand(alpha, w, h, 1);
  assert.equal(band[4 * w + 4], 0, "the middle of the subject is not the band");
  assert.equal(band[3 * w + 3], 0, "the subject's own edge pixel is not the band");
  assert.equal(band[4 * w + 2], 1, "one pixel outside is");
  assert.equal(band[4 * w + 1], 0, "two pixels outside is not, at width one");
  assert.equal(edgeBand(alpha, w, h, 2)[4 * w + 1], 1, "at width two it is");
  assert.equal(edgeBand(alpha, w, h, 2)[4 * w + 0], 0);
});

test("a tap on the background keeps nothing, and says so before anything is sent", () => {
  const conf = block(16, 16, { left: 3, top: 3, width: 10, height: 10 });
  assert.equal(keepsSomething(feather(maskFromConfidence(conf), 16, 16)), true, "a subject sixty-four pixels or more once feathered");
  assert.equal(keepsSomething(feather(maskFromConfidence(block(16, 16, { left: 0, top: 0, width: 0, height: 0 })), 16, 16)), false, "nothing above the threshold");
  assert.equal(keepsSomething(feather(maskFromConfidence(block(16, 16, { left: 4, top: 4, width: 3, height: 3 })), 16, 16)), false, "a speck under the floor is not a subject");
});
