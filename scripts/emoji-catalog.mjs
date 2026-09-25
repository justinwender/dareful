/**
 * The mark picker's catalog (docs/design.md 3.29): every emoji the tile renderer can draw (a key of
 * src/lib/ui/emoji-inks.json), with its CLDR name, its group, its search tags and whether it has skin tones,
 * from emojibase. English only. Written to src/lib/ui/emoji-catalog.json as rows of
 * [glyph, name, group, tags, skins], where skins is 0 or the five tone variants as emojibase spells them (a tone
 * is never assembled by hand: the modifier does not always follow the first code point). Regenerate with the ink table:
 *
 *   npm i --no-save emojibase-data@17
 *   node scripts/emoji-catalog.mjs
 */
import { readFileSync, statSync, writeFileSync } from "node:fs";

const data = JSON.parse(readFileSync(new URL("../node_modules/emojibase-data/en/compact.json", import.meta.url), "utf8"));
const table = JSON.parse(readFileSync(new URL("../src/lib/ui/emoji-inks.json", import.meta.url), "utf8"));
const normalise = (s) => {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0xfe0f || (cp >= 0x1f3fb && cp <= 0x1f3ff)) continue;
    out += ch;
  }
  return out;
};
const rows = [];
const seen = new Set();
for (const e of data) {
  // Group 2 is the component group (skin tones and hair): never a mark of its own.
  if (e.group === undefined || e.group === 2) continue;
  const key = normalise(e.unicode);
  if (!(key in table) || seen.has(key)) continue;
  seen.add(key);
  rows.push([e.unicode, e.label, e.group, (e.tags ?? []).join(" "), e.skins ? e.skins.map((k) => k.unicode) : 0]);
}
const out = new URL("../src/lib/ui/emoji-catalog.json", import.meta.url);
writeFileSync(out, JSON.stringify(rows));
console.log(`${rows.length} marks, ${statSync(out).size} bytes`);
