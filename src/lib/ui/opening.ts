/**
 * The opening (docs/design.md section 11): the launch image iOS shows while the installed app starts, the app's
 * first frame drawn by the page itself before any script or stylesheet loads, and the handoff to Now. All three
 * are one picture: the ground, flat, with the logo at the centre of the full screen. Nothing white, ever. The
 * logo is a 120 by 120 CSS px box the real logo replaces without anything else moving (11.2); the images, the
 * home-screen icons and the favicon are rendered from the same two source files by `scripts/opening.mjs`. Pure.
 */
export const GROUND_DARK = "#121110";
export const GROUND_LIGHT = "#F5EFE4";
export const LOGO_PX = 120;

/** The iPhone screens the app supports, in CSS px with the pixel ratio: the generator's device list (11.3). */
export const LAUNCH_DEVICES: ReadonlyArray<{ width: number; height: number; ratio: 2 | 3; phones: string }> = [
  { width: 440, height: 956, ratio: 3, phones: "iPhone 16 Pro Max, 17 Pro Max" },
  { width: 430, height: 932, ratio: 3, phones: "iPhone 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus" },
  { width: 428, height: 926, ratio: 3, phones: "iPhone 12 Pro Max, 13 Pro Max, 14 Plus" },
  { width: 420, height: 912, ratio: 3, phones: "iPhone Air" },
  { width: 414, height: 896, ratio: 3, phones: "iPhone XS Max, 11 Pro Max" },
  { width: 414, height: 896, ratio: 2, phones: "iPhone XR, 11" },
  { width: 414, height: 736, ratio: 3, phones: "iPhone 6 Plus to 8 Plus" },
  { width: 402, height: 874, ratio: 3, phones: "iPhone 16 Pro, 17, 17 Pro" },
  { width: 393, height: 852, ratio: 3, phones: "iPhone 14 Pro, 15, 15 Pro, 16" },
  { width: 390, height: 844, ratio: 3, phones: "iPhone 12, 12 Pro, 13, 13 Pro, 14" },
  { width: 375, height: 812, ratio: 3, phones: "iPhone X, XS, 11 Pro, 12 mini, 13 mini" },
  { width: 375, height: 667, ratio: 2, phones: "iPhone 6 to 8, SE 2 and 3" },
  { width: 320, height: 568, ratio: 2, phones: "iPhone SE" },
];

export type Scheme = "dark" | "light";
export const SCHEMES: readonly Scheme[] = ["dark", "light"];

/** The published path of one launch image: its pixel size and its scheme. */
export function launchImagePath(d: { width: number; height: number; ratio: number }, scheme: Scheme): string {
  return `/launch/${d.width * d.ratio}x${d.height * d.ratio}-${scheme}.png`;
}

/** The media query iOS matches a startup image on: the device's width, height, pixel ratio, portrait, and the scheme. */
export function launchImageMedia(d: { width: number; height: number; ratio: number }, scheme: Scheme): string {
  return `screen and (device-width: ${d.width}px) and (device-height: ${d.height}px) and (-webkit-device-pixel-ratio: ${d.ratio}) and (orientation: portrait) and (prefers-color-scheme: ${scheme})`;
}

/** Every `<link rel="apple-touch-startup-image">`, both sets (11.3); dark first, so a phone that ignores the scheme takes dark. */
export function launchImageLinks(): Array<{ url: string; media: string }> {
  const out: Array<{ url: string; media: string }> = [];
  for (const scheme of SCHEMES) for (const d of LAUNCH_DEVICES) out.push({ url: launchImagePath(d, scheme), media: launchImageMedia(d, scheme) });
  return out;
}

/**
 * The first frame's style (11.4): `html` and `body` take the ground in the phone's own scheme with `color-scheme`
 * to match, so the page never paints white behind anything, and `#opening` covers the screen in the same ground
 * with the logo box centred on the full display. The handoff (11.5) is two fades from the same frame, the logo
 * over quick and the ground over base, on the fade curve; Reduce Motion changes nothing, since it is two fades.
 */
export const OPENING_STYLE = [
  // Until the handoff marks the document dressed, html wears the ground in the phone's own scheme; after it, the stylesheet's tokens (and the Appearance override, 8.1) take over.
  `html:not([data-dressed]){background:${GROUND_DARK};color-scheme:dark}`,
  `@media (prefers-color-scheme:light){html:not([data-dressed]){background:${GROUND_LIGHT};color-scheme:light}}`,
  `#opening{position:fixed;inset:0;z-index:100;background:${GROUND_DARK};pointer-events:none}`,
  `@media (prefers-color-scheme:light){#opening{background:${GROUND_LIGHT}}#opening .on-dark{display:none}}`,
  `@media (prefers-color-scheme:dark){#opening .on-light{display:none}}`,
  `#opening>svg{position:absolute;left:50%;top:50%;width:${LOGO_PX}px;height:${LOGO_PX}px;margin:-${LOGO_PX / 2}px 0 0 -${LOGO_PX / 2}px}`,
  `#opening.handoff{opacity:0;transition:opacity 200ms cubic-bezier(0,0,0.58,1)}`,
  `#opening.handoff>svg{opacity:0;transition:opacity 120ms cubic-bezier(0,0,0.58,1)}`,
].join("");

/** The handoff, run once the document has painted its first screen (11.5): never waits for data, never holds the logo for show. */
export const OPENING_HANDOFF_SCRIPT = `(function(){var o=document.getElementById("opening");if(!o)return;requestAnimationFrame(function(){requestAnimationFrame(function(){document.documentElement.setAttribute("data-dressed","");o.classList.add("handoff");setTimeout(function(){o.remove()},240)})})})();`;
