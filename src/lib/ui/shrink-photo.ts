/**
 * The phone shrinks a photo over 3.5MB to 2048px on its long edge before sending it, because the platform's own
 * cap on a request is 4.5MB (docs/decisions.md 2026-09-25, the photo pipeline). Client-only: it draws on a
 * canvas. Shared by every control that sends a photo.
 */
export const SHRINK_OVER = 3.5 * 1024 * 1024;
export const SHRINK_EDGE = 2048;

export async function shrinkPhoto(file: File): Promise<Blob> {
  if (file.size <= SHRINK_OVER) return file;
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, SHRINK_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("could not shrink the photo"))), "image/jpeg", 0.86));
}
