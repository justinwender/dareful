import type { MetadataRoute } from "next";
import { ABOUT_FIRST } from "@/lib/ui/copy";
import { GROUND_DARK } from "@/lib/ui/opening";

/** Installable as a PWA (PLANNING.md: web plus PWA install, no native app). On iOS, installing is what makes Web Push possible at all. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dareful",
    short_name: "Dareful",
    // The first sentence of what the app is, the same one the plain card and the app's own description say (src/lib/ui/copy.ts).
    description: ABOUT_FIRST,
    start_url: "/",
    scope: "/",
    display: "standalone",
    // The manifest cannot follow the theme: the dark ground, which is what the launch image and the first frame draw by default (11.3), and the icon's own.
    background_color: GROUND_DARK,
    theme_color: GROUND_DARK,
    // The logo's own files (docs/design/reference/LOGO.md), placed by scripts/opening.mjs: full-bleed and opaque, and one
    // drawn with the mark smaller, for Android, which crops an icon to a circle, a squircle or a teardrop.
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
