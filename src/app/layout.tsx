import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Hanken_Grotesk, Young_Serif } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { LayersRoot } from "@/components/ui/layers";
import { Presses } from "@/components/ui/press";
import { PLACEHOLDER_NAME } from "@/lib/auth/login";
import { currentUser } from "@/lib/auth/session";
import { passThePhoneStatus } from "@/lib/ledger/pass-the-phone";
import { GROUND_DARK, GROUND_LIGHT, launchImageLinks, OPENING_HANDOFF_SCRIPT, OPENING_STYLE } from "@/lib/ui/opening";
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
  description: "A social ledger for friend groups, built around the friendly dare.",
  openGraph: { siteName: "Dareful", type: "website" },
  // What an iPhone puts on the home screen, rendered from the logo's source by scripts/opening.mjs (11.3).
  icons: { apple: "/icons/180.png", icon: "/favicon.ico" },
  // The launch images (11.3): one per iPhone size in a dark and a light set, or iOS shows white. Installing is what
  // makes Web Push possible there at all.
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
};

/** The logo's two colourways, inlined as the app's first frame (11.4), so it paints with nothing to fetch. */
const LOGO = { dark: logoMarkup("on-dark"), light: logoMarkup("on-light") };
function logoMarkup(name: "on-dark" | "on-light"): string {
  const svg = readFileSync(join(process.cwd(), "assets", "logo", `${name}.svg`), "utf8");
  return svg.replace(/<!--[\s\S]*?-->/g, "").replace(/<svg\b/, `<svg class="${name}" aria-hidden="true"`);
}

export default async function RootLayout({ children, ask }: { children: ReactNode; /** The ask layer (9.5): `/m/new` reached from inside the app rises over the place it was tapped from, which stays mounted under it. */ ask: ReactNode }) {
  // Someone who already has a session and a name has nothing to set up, so the login bootstrap stays out of
  // their way entirely: no round trip and no "signing you in" on every page load.
  const me = await currentUser();
  const settled = me !== null && me.displayName !== PLACEHOLDER_NAME;
  // Whether the server may sign for this person where the device cannot (3.45): read once per load, so a second device knows without asking.
  const passThePhone = me ? (await passThePhoneStatus(me.id)).on : false;
  return (
    <html lang="en" className={`${hanken.variable} ${youngSerif.variable} dark h-full antialiased`}>
      {/* An installed app draws under the status bar and the home indicator (viewport-fit=cover, translucent status
          bar). The top and side insets are paid once, here, so no screen can forget them; anything fixed or sticky
          pays its own (docs/decisions.md 2026-09-20). Sized from the parent's height, never from 100vh. */}
      <body className="flex min-h-full flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        {/* Appearance (8.1): the stored choice onto `html` before anything paints. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* The opening (11): the first frame is the launch image again, drawn in the phone's own scheme, outside the app root, and it only fades. */}
        <style dangerouslySetInnerHTML={{ __html: OPENING_STYLE }} />
        <div id="opening" aria-hidden="true" dangerouslySetInnerHTML={{ __html: LOGO.dark + LOGO.light }} />
        {/* The app root (9.3): the page, then the host every fixed layer portals into. Nothing that moves is ever set on it. */}
        <div id="app" data-layer="app" className="flex min-h-full flex-1 flex-col">
          <Providers settled={settled} me={me ? { dynamicUserId: me.dynamicUserId, ledgerWallet: me.ledgerWallet, governanceWallet: me.governanceWallet, passThePhone } : null}>
            {children}
            {ask}
            <Presses />
            <LayersRoot />
          </Providers>
        </div>
        <script dangerouslySetInnerHTML={{ __html: OPENING_HANDOFF_SCRIPT }} />
      </body>
    </html>
  );
}
