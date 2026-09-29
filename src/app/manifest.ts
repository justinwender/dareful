import type { MetadataRoute } from "next";
import { GROUND_DARK } from "@/lib/ui/opening";

/** Installable as a PWA (PLANNING.md: web plus PWA install, no native app). On iOS, installing is what makes Web Push possible at all. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dareful",
    short_name: "Dareful",
    description: "A social ledger for friend groups, built around the friendly dare.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // The manifest cannot follow the theme: the dark ground, which is what the launch image and the first frame draw by default (11.3).
    background_color: GROUND_DARK,
    theme_color: GROUND_DARK,
    icons: [
      { src: "/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
