/**
 * What happens to a photo between the phone and the bucket (docs/marks-and-memories.md, PLANNING.md 5b). Two
 * derivatives and nothing else are kept: the frame, 1080px on its long edge, and a 256px square for thumbnails
 * and marks. Both are re-encoded, which is what strips every field of EXIF (GPS above all), XMP and the rest;
 * only the colour profile is carried across, and only when it was taken is read first (`capturedAtFrom`). The
 * camera's orientation flag is applied to the pixels before it is thrown away, so nothing arrives sideways.
 */
import sharp, { type Metadata, type Sharp } from "sharp";
import { capturedAtFrom } from "./exif";

export const FRAME_EDGE = 1080;
export const THUMB_EDGE = 256;
/** What the phone may send, after the client has already shrunk anything larger (Vercel's request cap is 4.5MB). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export type Derivative = { bytes: Buffer; width: number; height: number };
export type ProcessedPhoto = { frame: Derivative; thumb: Derivative; capturedAt: Date | null };

export class NotAPhoto extends Error {
  constructor(message = "That doesn't look like a photo.") {
    super(message);
    this.name = "NotAPhoto";
  }
}

async function derivative(image: Sharp): Promise<Derivative> {
  const { data, info } = await image.jpeg({ quality: 82, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return { bytes: data, width: info.width, height: info.height };
}

export async function processPhoto(input: Buffer, viewerZone: string | null): Promise<ProcessedPhoto> {
  if (input.length === 0 || input.length > MAX_UPLOAD_BYTES) throw new NotAPhoto(input.length === 0 ? "That doesn't look like a photo." : "That photo is too big to send.");
  let meta: Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new NotAPhoto();
  }
  if (!meta.format || !["jpeg", "png", "webp", "heif", "avif", "tiff", "gif"].includes(meta.format)) throw new NotAPhoto();
  const capturedAt = capturedAtFrom(meta.exif, viewerZone);
  // `rotate()` with no angle applies the EXIF orientation; `keepIccProfile()` keeps the colour profile and only
  // that, so every other field is gone from the output.
  const oriented = () => sharp(input).rotate().keepIccProfile();
  const frame = await derivative(oriented().resize({ width: FRAME_EDGE, height: FRAME_EDGE, fit: "inside", withoutEnlargement: true }));
  const thumb = await derivative(oriented().resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: "cover", position: "attention" }));
  return { frame, thumb, capturedAt };
}
