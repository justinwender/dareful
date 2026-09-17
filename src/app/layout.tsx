import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Young_Serif } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

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
  title: "Dareful",
  description: "A social ledger for friend groups, built around the friendly dare.",
};

export const viewport: Viewport = {
  themeColor: "#17140F",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${hanken.variable} ${youngSerif.variable} dark h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
