import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Young_Serif } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
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
};

export const viewport: Viewport = {
  themeColor: "#17140F",
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
      <body className="min-h-full flex flex-col">
        <Providers settled={settled}>{children}</Providers>
      </body>
    </html>
  );
}
