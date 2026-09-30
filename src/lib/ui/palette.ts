/**
 * The colours the app draws where no token can reach (docs/design.md 1.1, 1.7, 3.38, 10.2): the ink, the second
 * ink and the ground of the dark theme, as literals for the places that never follow the theme. A team stamp's
 * abbreviation is whichever of cream and graphite has more contrast with the team's colour; the outline of a
 * subject being cut is cream on a photo; the full-screen photo is black in both themes (3.38, 10.2), so its
 * ground is the dark theme's ground and its close, its controls and the information icon on it are cream, with
 * the words under its controls in the dark theme's second ink; text on a scrim (the credit chip, a counter, a
 * clip's "+N") is cream too, since the scrim stays dark in both themes (1.1); the link tiles and the share card
 * are one image for everyone and stay as 3.27 draws them. Everything else on a screen reads a token, and the
 * style lint refuses a colour typed anywhere but here, the tokens, the ink tables and the opening. A test holds
 * the three literals to the stylesheet's own dark values, so they cannot drift from `globals.css`.
 */
export const CREAM = "#f2ede3";
export const CREAM_2 = "#c4bcae";
export const GRAPHITE = "#121110";
export const CREAM_RGB = "242,237,227";
