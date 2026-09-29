/** Person hues (docs/design.md 1.1): assigned per person, stable across every group. Derived from the user id. */
export const HUES = ["lilac", "aqua", "orchid", "sky", "sand", "stone"] as const;
export type Hue = (typeof HUES)[number];

export function hueFor(id: string): Hue {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const hue = HUES[h % HUES.length];
  return hue ?? "stone";
}

/** The fill: the same pastel in both themes, since a person's colour is who they are (8.7). */
export const hueVar = (hue: Hue) => `var(--person-${hue})`;
/** A stroke or a wash in the hue: the pastel on dark, the text-on-light variant on paper, where a pastel line is under 2:1 (8.7). */
export const hueStrokeVar = (hue: Hue) => `var(--person-${hue}-stroke)`;
export const hueRgbVar = (hue: Hue) => `var(--person-${hue}-stroke-rgb)`;
export const hueBorder = (hue: Hue) => `rgb(${hueRgbVar(hue)} / 0.55)`;
export const hueRing = (hue: Hue) => `inset 0 0 0 1px rgb(${hueRgbVar(hue)} / 0.5)`;
export const hueBar = (hue: Hue) => `rgb(${hueRgbVar(hue)} / 0.4)`;
