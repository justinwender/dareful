import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TileFonts } from "./tiles";

/**
 * The two faces the tiles and the public numbers are drawn with, read from disk once per instance (both OFL, in
 * src/lib/ui/fonts; next.config.ts traces them into each function that draws). Read lazily, so a missing file fails
 * one drawing and never the module. For the health checks, which draw both (the ops round, section 2).
 */
let fonts: Promise<TileFonts> | null = null;
export function loadTileFonts(): Promise<TileFonts> {
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
