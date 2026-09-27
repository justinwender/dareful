import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gameTile } from "@/lib/ledger/share";
import { plainCard, renderShareCard, shareCardContentType, shareCardSize } from "@/lib/ui/share-card";
import { renderTile, type TileFonts } from "@/lib/ui/tiles";

export const alt = "A game between friends";
export const size = shareCardSize;
export const contentType = shareCardContentType;

let fonts: Promise<TileFonts> | null = null;
function loadFonts(): Promise<TileFonts> {
  fonts ??= (async () => {
    const dir = join(process.cwd(), "src", "lib", "ui", "fonts");
    const [serif, sans] = await Promise.all([readFile(join(dir, "YoungSerif-Regular.ttf")), readFile(join(dir, "HankenGrotesk-SemiBold.woff"))]);
    return { serif: serif.buffer.slice(serif.byteOffset, serif.byteOffset + serif.byteLength) as ArrayBuffer, sans: sans.buffer.slice(sans.byteOffset, sans.byteOffset + sans.byteLength) as ArrayBuffer };
  })().catch((err) => {
    fonts = null;
    throw err;
  });
  return fonts;
}

/**
 * The tile for a game page (docs/design.md 3.27): the link sent when a game is started with more than one
 * question, drawn with the game where the question would be. Which set of people it is for is the link's second
 * segment; a game nobody has started with them gets the plain card, as does one that cannot be drawn.
 */
export default async function Image({ params }: { params: Promise<{ id: string; g: string }> }) {
  const { id, g } = await params;
  const tile = await gameTile(id, g);
  if (!tile) return renderShareCard(plainCard);
  try {
    return renderTile(tile, await loadFonts());
  } catch (err) {
    console.error("the game tile could not be drawn", { id, err });
    return renderShareCard(plainCard);
  }
}
