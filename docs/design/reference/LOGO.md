# The Dareful logo

The mark is a tally in marker: four strokes and a fifth crossing them. The wordmark is "dareful" in Young Serif, with its letters converted to outlines. Young Serif is under the SIL Open Font License, which allows a logo built from its outlines. Every file here is drawn from one master, so leave the strokes as they are: don't redraw, respace or recount them.

## The files

- `svg/`
  - `mark-on-dark.svg` and `mark-on-light.svg`: the mark alone, cropped close to the strokes.
  - `mark-box-on-*.svg`: the mark in its 100-unit box, which is how the icon and the opening place it.
  - `wordmark-on-*.svg`: the word alone.
  - `lockup-on-*.svg`: the mark and the word together.
- `icon/`
  - `icon-1024.png`: the master. `icon-1024-light.png` is the light version, and the vector sources are `icon-master*.svg`.
  - `apple-touch-icon.png` (180), `icon-192.png` and `icon-512.png`.
  - `icon-maskable-*.png`: for Android, which crops icons to a circle, squircle or teardrop. The mark is smaller in these so it stays inside the safe area.
  - All icons are full-bleed and opaque, grain included.
- `favicon/`
  - `favicon.svg` switches between light and dark with the browser.
  - `favicon.ico` holds 16, 32 and 48.
  - At 32 and 16 the favicon is a separate version drawn to the pixel grid, not the master scaled down.
- `opening/`
  - `opening.html`: the style for the head plus the `#opening` element.
  - `opening.css`: the same CSS, laid out to read.
  - `handoff.js`: the handoff to Now.
  - `launch/`: 22 launch images, each the bare ground at one iPhone size, dark and light.
  - `launch-links.html`: their link tags.
- `share/`
  - `project-graphic.png`: 1920 × 1080, 1.6 MB. There's a 330 KB `.jpg` of the same image, and `project-graphic-plain.png` without the phone.
  - `og-image.png`: 1200 × 630, the link preview.
  - `readme-header-dark.png` and `readme-header-light.png`: 1280 × 320.
  - `video-title.png` and `video-end.png`: title and end cards for the videos.
  - `video-bug.png`: the mark on a transparent background, for the corner of a recording.

## Clear space and smallest size

- **Clear space:** X on every side, where X is a quarter of the mark's height. In the lockup, measure X from the mark's height there. Nothing goes inside it, including the edge of the screen.
- **Smallest mark:** 20px tall. Below that, use the favicon versions drawn for 32 and 16.
- **Smallest lockup:** 120px wide. That's where its mark reaches 20px.
- **Smallest wordmark:** 64px wide.
- **Lockup construction:** the mark stands on the word's baseline and rises 8% above the ascender, with 0.32 em of space before the d.

## Colour

Use one colour at a time:

- **Dark:** chalk `#F2EDE3` on `#121110`.
- **Light:** ink `#1B1815` on `#F5EFE4`.

Never use a market ink, the citron or a person's hue, and never add an outline, shadow, texture or tilt. On a photo, only place it over the scrim.

## In the head

```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#121110">
<meta property="og:image" content="https://dareful.app/og-image.png">
```

In the manifest:

```json
"icons": [
  { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
  { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
  { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
]
```

In the README:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme-header-dark.png">
  <img alt="dareful" src="docs/readme-header-light.png">
</picture>
```

## The cold open

This follows section 11 of `docs/design.md`, with the animation added.

1. **The launch image is the bare ground.** The app's first frame draws exactly the same picture from the inline style in `opening.html`, with nothing drawn yet. It uses one stroke shape in both light and dark, recoloured by CSS.
2. **The tally is counted, one stroke at a time.** After 200ms of bare ground, a new stroke starts every 275ms, and each takes 200ms to draw on the move curve, `cubic-bezier(0.2, 0.8, 0.2, 1)`. The four uprights are drawn top to bottom, starting at 200, 475, 750 and 1025ms. The crossing stroke is drawn left to right from 1300ms. The count is complete at 1.5s and holds until the app is ready. Each stroke is revealed by a clip on its own box.
3. **Once Now's shell has painted, call `handOffOpening()`,** which `handoff.js` wraps in `afterFirstPaint`. Every stroke stops wherever it is. The logo fades out over quick (120ms) and the ground over base (200ms), both on the fade curve `cubic-bezier(0, 0, 0.58, 1)` and starting on the same frame. Then the element is removed.
4. **The opening never waits.** It never holds the logo or waits for data. If the app is ready at 0.8s, the third stroke stops three quarters drawn and the fades start from that frame.
5. **With Reduce Motion, nothing is drawn.** The whole mark fades in over 200ms, holds, then the same two fades run.
6. **It only runs on a cold open.** `#opening` exists only in the first page load, so returning to a running app shows nothing.

To change the timing, edit the four `--tally-` values at the top of `opening.css`: beat, stroke, pace and curve. The count completes at beat + 4 × pace + stroke. Keep the stroke no longer than the pace, or two strokes draw at once.

The launch images cover every iPhone size through the iPhone 17 line and iPhone Air. When a new size ships, add a flat image of the ground at that device's full pixel size.
