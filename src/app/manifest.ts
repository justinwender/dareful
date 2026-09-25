import type { MetadataRoute } from "next";

/** Installable as a PWA (PLANNING.md: web plus PWA install, no native app). On iOS, installing is what makes Web Push possible at all. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dareful",
    short_name: "Dareful",
    description: "A social ledger for friend groups, built around the friendly dare.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#121110",
    theme_color: "#121110",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
