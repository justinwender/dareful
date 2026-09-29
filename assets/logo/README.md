# The logo

Two source files, one colourway for each ground (docs/design.md 11.2): `on-dark.svg` drawn to sit on `#121110`
and `on-light.svg` on `#F5EFE4`, each fitting inside a 120 by 120 box, centred in it at any aspect ratio. Until
the real logo arrives they hold the placeholder, a 1.5px dashed square.

Dropping in the real logo is one command once the two files are replaced:

    node scripts/opening.mjs

It renders the launch images for every supported iPhone in both schemes (`public/launch`), the home-screen icons
(`public/icons`) and the favicon (`src/app/favicon.ico`), and the root layout inlines the same two files as the
app's first frame.
