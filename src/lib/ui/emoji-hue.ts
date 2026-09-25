import { HUES } from "./emoji-hues";

/**
 * The dominant hue of an emoji, from a table computed once (docs/design.md 1.8): pixels under chroma 0.04
 * ignored, an emoji with fewer than a quarter of its pixels carrying colour or whose colour is a template rather
 * than a choice (the yellow smiley family, default-yellow hands) recorded as hueless. The table is keyed without
 * variation selectors, because a typed emoji may or may not carry one. A hueless mark, or one the table has never
 * seen, returns null and the market's ink falls through to the hash of its id.
 */
export function emojiHue(emoji: string): number | null {
  const hue = HUES[emoji.replace(/️/g, "")];
  return typeof hue === "number" ? hue : null;
}
