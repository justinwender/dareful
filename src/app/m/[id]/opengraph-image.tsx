import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { marketTile } from "@/lib/ledger/share";
import {
  plainCard,
  renderShareCard,
  shareCardContentType,
  shareCardSize,
} from "@/lib/ui/share-card";
import { renderTile, type TileFonts } from "@/lib/ui/tiles";

export const alt = "A question between friends";
export const size = shareCardSize;
export const contentType = shareCardContentType;

// The two faces the tiles use, read from disk once per instance (both OFL, in src/lib/ui/fonts; next.config.ts
// traces them into the deployed function). Read lazily, so a missing file fails one request, never the module.
let fonts: Promise<TileFonts> | null = null;
function loadFonts(): Promise<TileFonts> {
  fonts ??= (async () => {
    const dir = join(process.cwd(), "src", "lib", "ui", "fonts");
    const [serif, sans] = await Promise.all([
      readFile(join(dir, "YoungSerif-Regular.ttf")),
      readFile(join(dir, "HankenGrotesk-SemiBold.woff")),
    ]);
    return {
      serif: serif.buffer.slice(
        serif.byteOffset,
        serif.byteOffset + serif.byteLength,
      ) as ArrayBuffer,
      sans: sans.buffer.slice(
        sans.byteOffset,
        sans.byteOffset + sans.byteLength,
      ) as ArrayBuffer,
    };
  })().catch((err) => {
    fonts = null;
    throw err;
  });
  return fonts;
}

/**
 * The tile for a question (docs/design.md 3.27): the asking tile while it runs, the result tile once it has
 * settled. Never anyone's number, never what is on it, never who is in. A draft, or an id that matches
 * nothing, gets the plain card; a tile that cannot be drawn (a font missing on the instance) falls back to the
 * plain card too, and says so in the log, rather than breaking the link's preview.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tile = await marketTile(id);
  if (!tile) return renderShareCard(plainCard);
  try {
    return renderTile(tile, await loadFonts());
  } catch (err) {
    console.error("the link tile could not be drawn", { id, err });
    return renderShareCard(plainCard);
  }
}
