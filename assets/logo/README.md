# The logo

The design's own files, as delivered, with its note in `docs/design/reference/LOGO.md`. Every file is drawn
from one master, so the strokes are left as they are: never redrawn, respaced or recounted.

- `svg/`: the mark, the mark in its 100-unit box, the wordmark and the lockup, each for the dark ground and
  the light one.
- `icon/`: the masters as vectors, and the icons at 180, 192 and 512, with the ones drawn for Android's
  cropping (the mark is smaller in them).
- `favicon/`: the `.ico` (16, 32 and 48, the first two drawn to the pixel grid), the `.svg` that follows the
  browser's scheme, and the two grid drawings on their own.

Placing them is one command:

    node scripts/opening.mjs

It writes, under `public`, the launch image for every supported iPhone in both schemes (the bare ground, since
the app's first frame has no stroke drawn yet), the home-screen icons, the favicon and the notification's badge,
and it writes the outlines of the wordmark, the mark and the lockup to `src/lib/ui/logo.ts` for the places the
app draws them itself. A new drawing of the logo is dropped in here and the command run again.

Where the rest of the design's files went:

- `opening/opening.css`, `opening/opening.html` and `opening/handoff.js` are in `src/lib/ui/opening.ts`, character
  for character. The count is tuned there, by the four `--tally-` values at the top of the style, and nowhere
  else.
- `opening/launch-links.html` is recorded in `tests/fixtures/logo`, and a test holds the head's own links to it.
- `share/og-image.png` is `public/og-image.png`, the app's own link preview.
- `share/project-graphic.png`, its `.jpg` and the plain one are in `docs/submission`.
- The README headers, the video cards and the corner mark stay in the design's zip until something uses them.
