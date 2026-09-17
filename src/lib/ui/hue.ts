/** Person hues (docs/design.md 1.1): assigned per person, stable across every group. Derived from the user id. */
export const HUES = ["lilac", "aqua", "orchid", "sky", "sand", "stone"] as const;
export type Hue = (typeof HUES)[number];

export function hueFor(id: string): Hue {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const hue = HUES[h % HUES.length];
  return hue ?? "stone";
}

export const hueVar = (hue: Hue) => `var(--person-${hue})`;
export const hueRgbVar = (hue: Hue) => `var(--person-${hue}-rgb)`;
export const hueBorder = (hue: Hue) => `rgb(${hueRgbVar(hue)} / 0.55)`;
export const hueRing = (hue: Hue) => `inset 0 0 0 1px rgb(${hueRgbVar(hue)} / 0.5)`;
export const hueBar = (hue: Hue) => `rgb(${hueRgbVar(hue)} / 0.4)`;
