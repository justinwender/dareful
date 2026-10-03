import type { Metadata, Viewport } from "next";
import { ABOUT_FIRST } from "@/lib/ui/copy";
import type { ReactNode } from "react";
import { Hanken_Grotesk, Young_Serif } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { LayersRoot } from "@/components/ui/layers";
import { Presses } from "@/components/ui/press";
import { sessionFacts } from "@/lib/auth/session-facts";
import { GROUND_DARK, GROUND_LIGHT, launchImageLinks, OPENING_ELEMENT, OPENING_HANDOFF_SCRIPT, OPENING_STYLE } from "@/lib/ui/opening";
import { THEME_SCRIPT } from "@/lib/ui/theme";

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const youngSerif = Young_Serif({
  variable: "--font-young-serif",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  // Absolute origin for the Open Graph image a share route generates. Without it the image URL is relative
  // and a messaging app's preview bot will not fetch it, so a pasted link renders as bare text.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://dareful.app"),
  title: "Dareful",
  description: ABOUT_FIRST,
  // The link preview for the app itself (LOGO.md): the lockup on the dark ground. A market, a cover and a game carry their own tile.
  openGraph: { siteName: "Dareful", type: "website", images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "dareful" }] },
  // The logo's own files, placed by scripts/opening.mjs (LOGO.md, "In the head"): the .ico holds the favicon drawn
  // to the pixel grid at 32 and 16, the .svg follows the browser's scheme, and the third is what an iPhone puts on
  // the home screen.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  // The launch images (11.3): one per iPhone size in a dark and a light set, each the bare ground, or iOS shows
  // white. Installing is what makes Web Push possible there at all.
  appleWebApp: { capable: true, title: "Dareful", statusBarStyle: "black-translucent", startupImage: launchImageLinks() },
};

export const viewport: Viewport = {
  // One value per scheme (8.1).
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: GROUND_DARK },
    { media: "(prefers-color-scheme: light)", color: GROUND_LIGHT },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Both schemes are the app's own (section 8), so the browser never paints its white before the first frame.
  colorScheme: "dark light",
};

export default function RootLayout({ children, ask }: { children: ReactNode; /** The ask layer (9.5): `/m/new` reached from inside the app rises over the place it was tapped from, which stays mounted under it. */ ask: ReactNode }) {
  // Started here and never waited for (11.5): the first screen's shell goes out before the account's row is read,
  // and whatever needs the session's facts waits where it is used.
  const facts = sessionFacts();
  return (
    // The scripts in the head and the handoff set attributes on `html` before the app is running (the appearance, dressed, arriving); they are theirs, and hydration leaves them be.
    <html lang="en" className={`${hanken.variable} ${youngSerif.variable} dark antialiased`} suppressHydrationWarning>
      <head>
        {/* The opening (11.4): the first frame's style, in the head before anything else, so it paints with nothing to fetch. */}
        <style dangerouslySetInnerHTML={{ __html: OPENING_STYLE }} />
        {/* Appearance (8.1): the stored choice onto `html` before anything paints. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      {/* An installed app draws under the status bar and the home indicator (viewport-fit=cover, translucent status
          bar). The top and side insets are paid once, here, so no screen can forget them; anything fixed or sticky
          pays its own (docs/decisions.md 2026-09-20). Sized from the parent's height, never from 100vh. */}
      <body className="h-full overflow-hidden">
        {/* The opening (11): the launch image again, the bare ground in the phone's own scheme, and then the tally counted a stroke at a time until the first screen's shell has painted. The first thing in the body, outside the app root, and it only fades. The handoff removes `#opening` from the page, often before the app is running, so the app holds a box around it that stays: what is inside is the opening's own, and the app never looks for it. */}
        <div data-opening-host="" className="contents" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: OPENING_ELEMENT }} />
        {/* The app root (9.3): the page, then the host every fixed layer portals into. Nothing that moves is ever set on it. It is the one thing that scrolls (`src/lib/ui/scroller.ts`): a box the size of the screen, so the document never scrolls and no fixed layer can be left where a keyboard moved the viewport (the field round, 1.1). The top and side insets are paid here, once. */}
        <div id="app" data-layer="app" className="fixed inset-0 flex flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
          <Providers facts={facts}>
            {children}
            {ask}
            <Presses />
            <LayersRoot />
          </Providers>
        </div>
        {/* The one handoff (11.5), in the same piece of the page as the first screen's shell, so it runs the moment that shell is on the page and never waits for what streams in after. */}
        <script dangerouslySetInnerHTML={{ __html: OPENING_HANDOFF_SCRIPT }} />
      </body>
    </html>
  );
}
