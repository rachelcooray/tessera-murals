import type { Metadata, Viewport } from "next";
import { Onest, Syne } from "next/font/google";
import "./globals.css";

/** Type: Syne for headings (an art-gallery display face), Onest for everything you read. Both are variable fonts. */
const syne = Syne({ subsets: ["latin"], variable: "--font-syne", display: "swap" });
const onest = Onest({ subsets: ["latin"], variable: "--font-onest", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Tessera", template: "%s · Tessera" },
  description: "Digital mosaics painted by your people: upload a photo, everyone paints one square, and nobody sees the picture until the reveal.",
};

export const viewport: Viewport = { themeColor: "#000000", viewportFit: "cover", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${syne.variable} ${onest.variable}`}>
      <body>{children}</body>
    </html>
  );
}
