/**
 * The clipboard side of pasting a cutout (docs/design.md 3.28, way 1). On a recent iPhone a person lifts a
 * subject out of a photo and copies it; what lands on the clipboard is a PNG with an alpha channel. Two ways
 * in: the `paste` event, which fires when the person pastes anywhere in the picker, and the async clipboard
 * read behind the "Paste a cutout" cell, which iOS answers with its own Paste prompt. Either way the image is
 * decoded here, checked for transparency (a plain photo is refused before it is sent), bounded to 1024px on
 * its long edge, and re-encoded as PNG; the server trims, squares, scales and bakes the edge. Client-only.
 */
export const PASTE_EDGE = 1024;

export class NotACutoutHere extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotACutoutHere";
  }
}

/** The first image on a clipboard event, or null. */
export function imageFromPaste(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of Array.from(data.items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) return item.getAsFile();
  }
  return null;
}

/** The first image from the async clipboard, or null when there is none; throws when the browser refuses to read it. */
export async function imageFromClipboard(): Promise<Blob | null> {
  if (typeof navigator === "undefined" || !navigator.clipboard || typeof navigator.clipboard.read !== "function") throw new NotACutoutHere("Copy a cutout first, then paste it here.");
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith("image/"));
    if (type) return item.getType(type);
  }
  return null;
}

/** The pasted image as a bounded PNG with its alpha kept; refuses an image with no see-through pixel at all. */
export async function prepareCutout(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, PASTE_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new NotACutoutHere("This browser can’t read the cutout.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let clear = 0;
  for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 255) < 128) clear++;
  if (clear / (canvas.width * canvas.height) < 0.005) throw new NotACutoutHere("That’s a photo, not a cutout. Lift the subject out of it first, then copy that.");
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new NotACutoutHere("The cutout couldn’t be read."))), "image/png"));
}
