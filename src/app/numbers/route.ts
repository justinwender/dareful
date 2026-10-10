import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { unstable_cache } from "next/cache";
import { renderNumbersCard } from "@/lib/ui/numbers-card";
import type { TileFonts } from "@/lib/ui/tiles";
import { publicNumbers } from "@/lib/usage/public-numbers";
import { redactKeys } from "@/lib/redact";

/**
 * The public numbers as an image (the submission round, section 2), for the README. GitHub's image proxy fetches it fresh
 * on every view of the README, and every drawing costs the function's time (the ops round, section 0), so it is drawn at
 * most once every five minutes however often it is asked for: the drawing itself is kept in the data cache every
 * instance shares (`unstable_cache`, numbers and picture together), and the platform's edge keeps the response five
 * minutes too (`Vercel-CDN-Cache-Control`), while `no-cache` still has GitHub's proxy and every browser ask again each
 * time. A failed read is drawn as a line saying so, and never kept anywhere.
 */
export const dynamic = "force-dynamic";

/** How long the numbers and their picture are kept before they are read and drawn again, in seconds. */
export const READ_EVERY_S = 300;

/** Fresh to every viewer and every proxy, from a drawing the edge keeps as long as the numbers are kept. */
export const FRESH = { "cache-control": "no-cache, max-age=0, must-revalidate", "vercel-cdn-cache-control": `max-age=${READ_EVERY_S}`, "content-type": "image/png" };
const NEVER_KEPT = { "cache-control": "no-store, max-age=0", "content-type": "image/png" };

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

/** The numbers read and drawn, as the picture's bytes in base64 (the cache keeps text) and the moment it was drawn: a read that throws is never kept. */
const drawing = unstable_cache(
  async () => {
    const png = await renderNumbersCard(await publicNumbers(), await loadFonts(), FRESH).arrayBuffer();
    return { png: Buffer.from(png).toString("base64"), drawnAt: new Date().toISOString() };
  },
  ["public-numbers-png-v1"],
  { revalidate: READ_EVERY_S },
);

export async function GET(): Promise<Response> {
  try {
    const kept = await drawing();
    // When this picture was drawn, so a check can see two views share one drawing.
    return new Response(Buffer.from(kept.png, "base64"), { headers: { ...FRESH, "x-drawn-at": kept.drawnAt } });
  } catch (err) {
    console.error("the public numbers could not be read", { why: redactKeys(err instanceof Error ? err.message.split("\n")[0] : String(err)) });
    return renderNumbersCard(null, await loadFonts(), NEVER_KEPT);
  }
}
