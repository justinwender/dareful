/**
 * The two colours the app draws where no token can reach (docs/design.md 1.1, 1.7, 10.2): the ink of the dark
 * theme and the ground of the dark theme, as literals for the places that never follow the theme. A team stamp's
 * abbreviation is whichever of the two has more contrast with the team's colour; the outline of a subject being
 * cut is cream on a photo, which is black in both themes; the information icon on that photo is cream too; the
 * link tiles and the share card are one image for everyone and stay as 3.27 draws them. Everything else on a
 * screen reads a token, and the style lint refuses a colour typed anywhere but here, the tokens, the ink tables
 * and the opening.
 */
export const CREAM = "#f2ede3";
export const GRAPHITE = "#121110";
export const CREAM_RGB = "242,237,227";
