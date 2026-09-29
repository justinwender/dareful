/**
 * The opening's images, the home-screen icons and the favicon (docs/design.md 11.3; docs/design/reference/LOGO.md),
 * from the logo files in `assets/logo`, so a new drawing of the logo is dropped in there and placed by one command:
 *
 *   node scripts/opening.mjs
 *
 * What it writes, all under `public`:
 *
 *   launch/launch-<w>x<h>-<scheme>.png   the launch image for every supported iPhone, dark and light: the bare
 *                                        ground at the device's full pixel size, since the app's first frame has
 *                                        no stroke drawn yet and the launch image must be the same picture
 *   apple-touch-icon.png                 the home-screen icon on an iPhone (180)
 *   icon-192.png, icon-512.png           the home-screen icons elsewhere
 *   icon-maskable-512.png                the one Android crops to a circle, a squircle or a teardrop: the mark is
 *                                        smaller in it, so it stays inside the safe area
 *   favicon.ico, favicon.svg             the favicon; at 32 and 16 the .ico holds the versions drawn to the pixel
 *                                        grid, never the mark scaled down
 *   badge-96.png                         the mark alone on nothing, for a notification's badge, which a phone
 *                                        draws from the picture's shape and not its colours
 *
 * and, in `src/lib/ui/logo.ts`, the wordmark's and the mark's own outlines as data, for the places the app draws
 * them itself (a header with nothing behind it, the link tiles), in whatever colour the ground calls for.
 *
 * The icons and the favicon are the design's own files, copied as delivered and never redrawn. Only the launch
 * images (a flat colour) and the badge (the mark's own SVG, rendered) are made here.
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOGO = join(ROOT, "assets", "logo");
const PUBLIC = join(ROOT, "public");
const GROUND = { dark: "#121110", light: "#F5EFE4" };
// The same list as src/lib/ui/opening.ts (a script cannot import the app's TypeScript without tsx); a test holds the two equal.
const DEVICES = [
  [440, 956, 3],
  [420, 912, 3],
  [402, 874, 3],
  [430, 932, 3],
  [393, 852, 3],
  [428, 926, 3],
  [390, 844, 3],
  [375, 812, 3],
  [414, 896, 3],
  [414, 896, 2],
  [375, 667, 2],
  [414, 736, 3],
  [320, 568, 2],
];
/** The design's file, and where the app serves it from. */
const COPIES = [
  ["icon/apple-touch-icon.png", "apple-touch-icon.png"],
  ["icon/icon-192.png", "icon-192.png"],
  ["icon/icon-512.png", "icon-512.png"],
  ["icon/icon-maskable-512.png", "icon-maskable-512.png"],
  ["favicon/favicon.ico", "favicon.ico"],
  ["favicon/favicon.svg", "favicon.svg"],
];

/** A flat image of one colour, with no alpha and no metadata. */
async function ground(w, h, scheme, out) {
  await sharp({ create: { width: w, height: h, channels: 3, background: GROUND[scheme] } })
    .png({ compressionLevel: 9 })
    .toFile(out);
}

mkdirSync(join(PUBLIC, "launch"), { recursive: true });
// The launch folder holds exactly this run's images: a size dropped from the list, or an older name, goes.
for (const f of readdirSync(join(PUBLIC, "launch"))) rmSync(join(PUBLIC, "launch", f));
let launch = 0;
for (const [w, h, ratio] of DEVICES) {
  for (const scheme of ["dark", "light"]) {
    await ground(w * ratio, h * ratio, scheme, join(PUBLIC, "launch", `launch-${w * ratio}x${h * ratio}-${scheme}.png`));
    launch++;
  }
}

for (const [from, to] of COPIES) copyFileSync(join(LOGO, from), join(PUBLIC, to));

// The badge: the mark alone, cropped close, fitted inside 96 with the mark's own clear space (a quarter of its height) around it.
const mark = readFileSync(join(LOGO, "svg", "mark-on-dark.svg"));
const inner = Math.round(96 / 1.5);
const drawn = await sharp(mark, { density: 300 }).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
await sharp({ create: { width: 96, height: 96, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: drawn, gravity: "centre" }])
  .png()
  .toFile(join(PUBLIC, "badge-96.png"));

/** A logo file's drawing as data: its box and every outline with its own placement, the colour left to whoever draws it. */
function drawingOf(file) {
  const svg = readFileSync(join(LOGO, "svg", file), "utf8").replace(/<metadata>[\s\S]*?<\/metadata>/, "");
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1];
  if (!viewBox) throw new Error(`${file} has no viewBox`);
  const [, , width, height] = viewBox.split(/\s+/).map(Number);
  // A file may place some of its outlines together (the lockup's mark); each outline carries that placement ahead of its own.
  const paths = [];
  for (const g of svg.matchAll(/<g(?: transform="([^"]+)")?(?: fill="[^"]+")?>([\s\S]*?)<\/g>/g)) {
    for (const m of g[2].matchAll(/<path d="([^"]+)"(?: transform="([^"]+)")?/g)) paths.push({ d: m[1], transform: [g[1], m[2]].filter(Boolean).join(" ") || null });
  }
  if (paths.length === 0) for (const m of svg.matchAll(/<path d="([^"]+)"(?: transform="([^"]+)")?/g)) paths.push({ d: m[1], transform: m[2] ?? null });
  if (paths.length === 0) throw new Error(`${file} has no outlines`);
  return { viewBox, width, height, paths };
}
const wordmark = drawingOf("wordmark-on-dark.svg");
const tally = drawingOf("mark-on-dark.svg");
const lockup = drawingOf("lockup-on-dark.svg");
writeFileSync(
  join(ROOT, "src", "lib", "ui", "logo.ts"),
  `/**
 * The logo's outlines as data (docs/design/reference/LOGO.md): the wordmark, "dareful" in Young Serif converted to
 * outlines, and the mark, a tally of four strokes and a fifth crossing them. Written by \`node scripts/opening.mjs\`
 * from \`assets/logo/svg\` and never edited by hand: the strokes are never redrawn, respaced or recounted.
 */
export type LogoDrawing = { viewBox: string; width: number; height: number; paths: ReadonlyArray<{ d: string; transform: string | null }> };

/** The wordmark is set at 200 units to the em, so a header's 20px wordmark is the drawing at a tenth (3.38). */
export const WORDMARK_EM = 200;
export const WORDMARK: LogoDrawing = ${JSON.stringify(wordmark)};
export const MARK: LogoDrawing = ${JSON.stringify(tally)};
/** The mark and the word together: the mark on the word's baseline, rising 8% above the ascender, 0.32 em before the d. */
export const LOCKUP: LogoDrawing = ${JSON.stringify(lockup)};
`,
);

console.log(`opening: ${launch} launch images, ${COPIES.length} icons and favicons placed, the badge, and the outlines in src/lib/ui/logo.ts, from assets/logo`);
