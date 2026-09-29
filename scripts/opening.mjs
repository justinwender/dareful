/**
 * The opening's images (docs/design.md 11.3), from one source: the launch image for every supported iPhone in a
 * dark and a light set, the home-screen icons and the favicon, rendered from `assets/logo/on-dark.svg` and
 * `assets/logo/on-light.svg`, so dropping in the real logo later is this one command:
 *
 *   node scripts/opening.mjs
 *
 * Each launch image is the flat ground at the device's full pixel size with the logo box at exactly 120 CSS px
 * times the pixel ratio, centred on the whole display. The icons are the logo on the dark ground with the box
 * scaled to the icon; the favicon is the 32px icon wrapped in an ICO container (a PNG inside, which every
 * current browser reads).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GROUND = { dark: "#121110", light: "#F5EFE4" };
const LOGO_PX = 120;
// The same list as src/lib/ui/opening.ts (a script cannot import the app's TypeScript without tsx); a test holds the two equal.
const DEVICES = [
  [440, 956, 3],
  [430, 932, 3],
  [428, 926, 3],
  [420, 912, 3],
  [414, 896, 3],
  [414, 896, 2],
  [414, 736, 3],
  [402, 874, 3],
  [393, 852, 3],
  [390, 844, 3],
  [375, 812, 3],
  [375, 667, 2],
  [320, 568, 2],
];

/** The logo's own drawing (everything inside its root element), to nest inside a page-sized SVG. */
function logoInner(scheme) {
  const svg = readFileSync(join(ROOT, "assets", "logo", `on-${scheme}.svg`), "utf8");
  const m = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(svg);
  if (!m) throw new Error(`assets/logo/on-${scheme}.svg is not an SVG`);
  return m[1];
}

/** A page of `w` by `h` pixels in the scheme's ground, with the logo box of `box` pixels centred. */
function page(w, h, box, scheme) {
  const scale = box / LOGO_PX;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${GROUND[scheme]}"/><g transform="translate(${(w - box) / 2} ${(h - box) / 2}) scale(${scale})">${logoInner(scheme)}</g></svg>`;
}

async function png(svg, out) {
  await sharp(Buffer.from(svg)).png().toFile(out);
}

/** A PNG in an ICO container: one directory entry pointing at the PNG bytes. */
function ico(pngBytes, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0);
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBytes.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, pngBytes]);
}

mkdirSync(join(ROOT, "public", "launch"), { recursive: true });
mkdirSync(join(ROOT, "public", "icons"), { recursive: true });
let count = 0;
for (const scheme of ["dark", "light"]) {
  for (const [w, h, ratio] of DEVICES) {
    await png(page(w * ratio, h * ratio, LOGO_PX * ratio, scheme), join(ROOT, "public", "launch", `${w * ratio}x${h * ratio}-${scheme}.png`));
    count++;
  }
}
// The home-screen icon and the notification's badge: the logo on the dark ground, the box at three quarters of the icon.
for (const size of [96, 180, 192, 512]) {
  await png(page(size, size, Math.round(size * 0.75), "dark"), join(ROOT, "public", "icons", `${size}.png`));
}
const favicon = await sharp(Buffer.from(page(32, 32, 24, "dark"))).png().toBuffer();
writeFileSync(join(ROOT, "src", "app", "favicon.ico"), ico(favicon, 32));
console.log(`opening: ${count} launch images, 4 icons and the favicon written from assets/logo`);
