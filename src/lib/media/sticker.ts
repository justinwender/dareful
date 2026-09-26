/**
 * A sticker between the clipboard and the bucket (docs/design.md 3.28; docs/marks-and-memories.md, "Pipeline
 * notes"). What arrives is a pasted cutout: on a recent iPhone a person lifts a subject out of a photo and copies
 * it, which puts a PNG with an alpha channel on the clipboard. Two objects are kept, as the specification says:
 * the 512px source with its alpha, trimmed of empty margins and padded to a square, and a 256px derivative with
 * the cream die-cut edge baked in. The ink is measured from the source's own opaque pixels (cutout.ts).
 *
 * The edge is baked at one width, for the 40px stamp: a sticker fits 80% of its stamp (1.7), so at 40px the 256
 * derivative is drawn at 32px, eight derivative pixels to one on screen, and a 2px edge is sixteen of them. The
 * same derivative reads 1.4px at the 28px stamp and 3.2px at 64; the 20px stamp draws the source, with no edge.
 */
import sharp from "sharp";
import { dieCut, measureInk, trimBounds, transparentFraction } from "./cutout";
import type { InkName } from "@/lib/ui/ink";

export const STICKER_EDGE = 512;
export const STAMP_EDGE = 256;
/** The die-cut band, in derivative pixels: 2px on a 40px stamp. */
export const DIE_CUT_PX = 16;
/** A pasted cutout can be large (a subject lifted from a 12MP photo); it is read at this size at most. */
const READ_EDGE = 1024;
/** What may arrive: the platform's request cap is 4.5MB, and the phone shrinks anything larger first. */
export const MAX_STICKER_BYTES = 4 * 1024 * 1024;
/** A cutout has its background gone: at least this share of its pixels are see-through. A photo has none. */
export const MIN_TRANSPARENT = 0.005;

export type StickerDerivative = { bytes: Buffer; width: number; height: number };
export type ProcessedSticker = { source: StickerDerivative; stamp: StickerDerivative; ink: InkName | null };

export class NotACutout extends Error {
  constructor(message = "That doesn’t look like a cutout.") {
    super(message);
    this.name = "NotACutout";
  }
}

export async function processSticker(input: Buffer): Promise<ProcessedSticker> {
  if (input.length === 0) throw new NotACutout();
  if (input.length > MAX_STICKER_BYTES) throw new NotACutout("That cutout is too big to send.");
  let meta;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new NotACutout();
  }
  if (!meta.format || !["png", "webp", "gif", "tiff", "avif", "heif"].includes(meta.format) || !meta.hasAlpha) {
    throw new NotACutout("That’s a photo, not a cutout. Lift the subject out of it first, then copy that.");
  }
  const read = await sharp(input).resize({ width: READ_EDGE, height: READ_EDGE, fit: "inside", withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = new Uint8Array(read.data.buffer, read.data.byteOffset, read.data.byteLength);
  const { width, height } = read.info;
  if (transparentFraction(rgba, width, height) < MIN_TRANSPARENT) throw new NotACutout("That’s a photo, not a cutout. Lift the subject out of it first, then copy that.");
  const box = trimBounds(rgba, width, height);
  if (!box) throw new NotACutout("There’s nothing in that but empty space.");
  const clear = { r: 0, g: 0, b: 0, alpha: 0 };
  // The source: the trimmed shape, fit inside 512 and centred on a transparent square.
  const source = await sharp(read.data, { raw: { width, height, channels: 4 } })
    .extract(box)
    .resize({ width: STICKER_EDGE, height: STICKER_EDGE, fit: "contain", background: clear, withoutEnlargement: false })
    .png()
    .toBuffer({ resolveWithObject: true });
  const sourceRaw = await sharp(source.data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ink = measureInk(new Uint8Array(sourceRaw.data.buffer, sourceRaw.data.byteOffset, sourceRaw.data.byteLength), sourceRaw.info.width, sourceRaw.info.height).ink;
  // The stamp: the shape fit inside the square left after the edge, then the edge grown outward from it.
  const inner = STAMP_EDGE - 2 * DIE_CUT_PX;
  const placed = await sharp(source.data)
    .resize({ width: inner, height: inner, fit: "contain", background: clear })
    .extend({ top: DIE_CUT_PX, bottom: DIE_CUT_PX, left: DIE_CUT_PX, right: DIE_CUT_PX, background: clear })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const cut = dieCut(new Uint8Array(placed.data.buffer, placed.data.byteOffset, placed.data.byteLength), placed.info.width, placed.info.height, DIE_CUT_PX);
  const stamp = await sharp(Buffer.from(cut.buffer, cut.byteOffset, cut.byteLength), { raw: { width: placed.info.width, height: placed.info.height, channels: 4 } })
    .png()
    .toBuffer({ resolveWithObject: true });
  return {
    source: { bytes: source.data, width: source.info.width, height: source.info.height },
    stamp: { bytes: stamp.data, width: stamp.info.width, height: stamp.info.height },
    ink,
  };
}
