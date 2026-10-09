import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { unstable_cache } from "next/cache";
import { renderNumbersCard } from "@/lib/ui/numbers-card";
import type { TileFonts } from "@/lib/ui/tiles";
import { publicNumbers } from "@/lib/usage/public-numbers";
import { redactKeys } from "@/lib/redact";

/**
 * The public numbers as an image (the submission round, section 2), for the README: drawn on every request from numbers
 * read at most once every five minutes however often it is viewed (`unstable_cache`, the data cache every instance
 * shares), and sent so GitHub's image proxy asks again each time rather than keeping a copy (`no-cache`), while the
 * platform's own edge keeps one drawing a minute. A failed read is drawn as a line saying so, and never kept.
 */
export const dynamic = "force-dynamic";

/** How long the numbers are kept before they are read again, in seconds. */
export const READ_EVERY_S = 300;
const read = unstable_cache(() => publicNumbers(), ["public-numbers-v1"], { revalidate: READ_EVERY_S });

/** Fresh to every viewer and every proxy, from a drawing the edge keeps a minute. */
export const FRESH = { "cache-control": "no-cache, max-age=0, must-revalidate", "vercel-cdn-cache-control": "max-age=60", "content-type": "image/png" };
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

export async function GET(): Promise<Response> {
  const f = await loadFonts();
  try {
    return renderNumbersCard(await read(), f, FRESH);
  } catch (err) {
    console.error("the public numbers could not be read", { why: redactKeys(err instanceof Error ? err.message.split("\n")[0] : String(err)) });
    return renderNumbersCard(null, f, NEVER_KEPT);
  }
}
