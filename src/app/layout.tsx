import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Young_Serif } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ViewportRepair } from "@/components/ui/viewport-repair";
import { PLACEHOLDER_NAME } from "@/lib/auth/login";
import { currentUser } from "@/lib/auth/session";

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
  // What an iPhone puts on the home screen. Installing is what makes Web Push possible there at all.
  icons: { apple: "/icons/180" },
  appleWebApp: { capable: true, title: "Dareful", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#121110",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Someone who already has a session and a name has nothing to set up, so the login bootstrap stays out of
  // their way entirely: no round trip and no "signing you in" on every page load.
  const me = await currentUser();
  const settled = me !== null && me.displayName !== PLACEHOLDER_NAME;
  return (
    <html lang="en" className={`${hanken.variable} ${youngSerif.variable} dark h-full antialiased`}>
      {/* An installed app draws under the status bar and the home indicator (viewport-fit=cover, translucent status
          bar). The top and side insets are paid once, here, so no screen can forget them; anything fixed or sticky
          pays its own (docs/decisions.md 2026-09-20). Sized from the parent's height, never from 100vh. */}
      <body className="flex min-h-full flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        <ViewportRepair />
        <Providers settled={settled} me={me ? { dynamicUserId: me.dynamicUserId, ledgerWallet: me.ledgerWallet, governanceWallet: me.governanceWallet } : null}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
