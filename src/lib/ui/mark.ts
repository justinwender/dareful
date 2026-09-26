import type { InkName } from "./ink";

/**
 * A market's mark, as the screens and the tiles read it (docs/design.md 1.7, 3.9): an emoji drawn as text, or a
 * sticker drawn from its derivative behind `/api/mark/[id]`. One shape everywhere, so a row that stores a
 * sticker never falls through a check that only knew emoji. Pure.
 */
export type MarkRef = { kind: "emoji"; value: string } | { kind: "sticker"; id: string };

export function markRefOf(d: { markKind?: string | null; markValue?: string | null }): MarkRef | null {
  if (!d.markValue) return null;
  if (d.markKind === "emoji") return { kind: "emoji", value: d.markValue };
  if (d.markKind === "sticker") return { kind: "sticker", id: d.markValue };
  return null;
}

/** The address a stamp draws a sticker from: the 256px derivative with its edge, or the bare source at 20px (1.7: no edge there). */
export function stickerSrc(id: string, size: number): string {
  return `/api/mark/${id}?size=${size <= 20 ? "source" : "stamp"}`;
}

/** What the picker hands back (3.29): an emoji with its CLDR name, or one of this person's stickers with the ink measured from it. */
export type PickedMark = { kind: "emoji"; value: string; name: string | null } | { kind: "sticker"; id: string; ink: InkName | null };

/** The picked mark as the reference a stamp draws. */
export function refOfPicked(m: PickedMark | null): MarkRef | null {
  if (!m) return null;
  return m.kind === "emoji" ? { kind: "emoji", value: m.value } : { kind: "sticker", id: m.id };
}
