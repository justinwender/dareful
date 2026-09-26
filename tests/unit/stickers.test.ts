/**
 * Stickers (docs/design.md 1.7, 3.28; docs/marks-and-memories.md) as rules: a pasted cutout keeps its alpha, loses
 * its empty margins, is padded square at 512, and gets a 256 derivative with the cream die-cut edge baked in
 * around the opaque shape and nothing else; the ink is measured from its own opaque pixels, so a coloured
 * cutout picks its ink and a grey one hashes; a photo with no transparency is refused as not a cutout. The
 * inputs are drawn by sharp (libvips), never typed by hand, the way the photo tests draw theirs.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { CREAM, dieCut, distanceToShape, measureInk, srgbToOklch, transparentFraction, trimBounds } from "@/lib/media/cutout";
import { DIE_CUT_PX, NotACutout, processSticker, STAMP_EDGE, STICKER_EDGE } from "@/lib/media/sticker";

/** A cutout as the clipboard hands it over: a disc of one colour on a transparent 800 by 600 canvas, off centre, with empty margins. */
async function cutout(colour: { r: number; g: number; b: number }, radius = 150): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><circle cx="300" cy="250" r="${radius}" fill="rgb(${colour.r},${colour.g},${colour.b})"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const raw = async (png: Buffer) => {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { rgba: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), width: info.width, height: info.height };
};
const px = (r: { rgba: Uint8Array; width: number }, x: number, y: number) => {
  const o = (y * r.width + x) * 4;
  return { r: r.rgba[o] ?? 0, g: r.rgba[o + 1] ?? 0, b: r.rgba[o + 2] ?? 0, a: r.rgba[o + 3] ?? 0 };
};

test("the trim finds the opaque box and the transparent share says whether a background is gone", async () => {
  const c = await raw(await cutout({ r: 200, g: 40, b: 60 }));
  const box = trimBounds(c.rgba, c.width, c.height);
  assert.ok(box);
  assert.ok(Math.abs(box.left - 150) <= 1 && Math.abs(box.top - 100) <= 1 && Math.abs(box.width - 301) <= 2 && Math.abs(box.height - 301) <= 2, `the disc's box, not the canvas: ${JSON.stringify(box)}`);
  assert.ok(transparentFraction(c.rgba, c.width, c.height) > 0.8, "most of a cutout's canvas is see-through");
  const photo = await raw(await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 10, g: 20, b: 30 } } }).png().toBuffer());
  assert.equal(transparentFraction(photo.rgba, photo.width, photo.height), 0, "a photo has no see-through pixel");
  assert.equal(trimBounds(new Uint8Array(16), 2, 2), null, "nothing opaque, no box");
});

test("the die-cut edge is a cream band a fixed distance outside the shape, and the corners stay see-through", () => {
  // A 7 by 7 opaque square in the middle of a 31 by 31 transparent field.
  const w = 31;
  const rgba = new Uint8Array(w * w * 4);
  for (let y = 12; y < 19; y++) for (let x = 12; x < 19; x++) rgba.set([30, 90, 200, 255], (y * w + x) * 4);
  const dist = distanceToShape(rgba, w, w);
  assert.equal(dist[15 * w + 15], 0, "inside the shape the distance is nought");
  assert.equal(dist[15 * w + 19], 1, "one pixel outside, one away");
  assert.equal(Math.round((dist[0] ?? 0) * 100) / 100, Math.round(Math.hypot(12, 12) * 100) / 100, "the corner is a diagonal away, exactly");
  const cut = dieCut(rgba, w, w, 4);
  const at = (x: number, y: number) => ({ r: cut[(y * w + x) * 4], g: cut[(y * w + x) * 4 + 1], b: cut[(y * w + x) * 4 + 2], a: cut[(y * w + x) * 4 + 3] });
  assert.deepEqual(at(15, 15), { r: 30, g: 90, b: 200, a: 255 }, "the sticker's own pixels are untouched");
  assert.deepEqual(at(21, 15), { r: CREAM.r, g: CREAM.g, b: CREAM.b, a: 255 }, "three pixels out is cream and opaque");
  assert.ok((at(22, 15).a ?? 0) > 0 && (at(22, 15).a ?? 0) < 255 && at(22, 15).r === CREAM.r, "four out, on the rim itself, the cream is anti-aliased");
  assert.equal(at(23, 15).a, 0, "past the rim, see-through");
  assert.equal(at(25, 15).a, 0, "and further out, still nothing");
  assert.equal(at(0, 0).a, 0, "the corner of the field stays transparent");
});

test("the ink is measured from the opaque pixels only, with the emoji table's rule: a coloured cutout picks its ink, a grey one hashes", async () => {
  const { C, h } = srgbToOklch(200, 40, 60);
  assert.ok(C >= 0.14 && (h < 40 || h >= 345), `a red reads as red in OKLCH, in the band the folds send to Rose: chroma ${C.toFixed(3)}, hue ${h.toFixed(1)}`);
  const red = await raw(await cutout({ r: 200, g: 40, b: 60 }));
  assert.equal(measureInk(red.rgba, red.width, red.height).ink, "rose", "a red cutout on a transparent canvas is Rose: the canvas does not vote");
  const teal = await raw(await cutout({ r: 40, g: 170, b: 165 }));
  assert.equal(measureInk(teal.rgba, teal.width, teal.height).ink, "sea");
  const grey = await raw(await cutout({ r: 120, g: 120, b: 120 }));
  const m = measureInk(grey.rgba, grey.width, grey.height);
  assert.equal(m.ink, null, "a grey cutout sets no colour: the market hashes");
  assert.ok(m.chromaticFraction < 0.25);
  assert.equal(measureInk(new Uint8Array(16), 2, 2).ink, null, "nothing opaque, nothing to measure");
});

test("a pasted cutout becomes the 512 source with its alpha and the 256 stamp with the edge baked in, and its ink", async () => {
  const s = await processSticker(await cutout({ r: 200, g: 40, b: 60 }));
  assert.equal(s.ink, "rose");
  assert.deepEqual([s.source.width, s.source.height], [STICKER_EDGE, STICKER_EDGE], "square at 512");
  const src = await raw(s.source.bytes);
  assert.equal((await sharp(s.source.bytes).metadata()).hasAlpha, true, "the alpha channel is kept");
  assert.equal(px(src, 0, 0).a, 0, "the corner is see-through");
  assert.ok(px(src, 256, 256).a === 255 && px(src, 256, 256).r > 150, "the disc fills the square: the empty margins were trimmed");
  assert.ok(px(src, 256, 2).a === 255, "trimmed to the disc's own box, so the disc touches the top edge");
  assert.deepEqual([s.stamp.width, s.stamp.height], [STAMP_EDGE, STAMP_EDGE]);
  const st = await raw(s.stamp.bytes);
  assert.equal(px(st, 0, 0).a, 0, "the stamp's corner is see-through too");
  const top = px(st, 128, DIE_CUT_PX - 4);
  assert.ok(top.a === 255 && Math.abs(top.r - CREAM.r) <= 2 && Math.abs(top.g - CREAM.g) <= 2, `above the disc, inside the band, is cream: ${JSON.stringify(top)}`);
  assert.ok(px(st, 128, 1).a === 255 && Math.abs(px(st, 128, 1).r - CREAM.r) <= 2, "the band is exactly as wide as the room left for it, so it reaches the top edge");
  assert.ok(px(st, 128, 128).r > 150 && px(st, 128, 128).a === 255, "the disc itself, inside, keeps its colour");
  assert.equal(px(st, 20, 20).a, 0, "off the disc's diagonal, past the band, nothing");
});

test("a photo with no transparency is not a cutout, and neither is an empty canvas", async () => {
  const photo = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 120, g: 90, b: 60 } } }).jpeg().toBuffer();
  await assert.rejects(() => processSticker(photo), NotACutout, "a JPEG has no alpha channel at all");
  const opaquePng = await sharp({ create: { width: 400, height: 300, channels: 4, background: { r: 120, g: 90, b: 60, alpha: 1 } } }).png().toBuffer();
  await assert.rejects(() => processSticker(opaquePng), NotACutout, "a PNG whose alpha is all 255 is a photo in disguise");
  const empty = await sharp({ create: { width: 400, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  await assert.rejects(() => processSticker(empty), NotACutout, "nothing in it but empty space");
  await assert.rejects(() => processSticker(Buffer.from("hello")), NotACutout);
});
