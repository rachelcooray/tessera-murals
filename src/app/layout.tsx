import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

/** Apple devices use their own system font (SF Pro). Everyone else gets Inter, its closest open match, with optical sizes. */
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap", axes: ["opsz"] });

export const metadata: Metadata = {
  title: { default: "Tessera", template: "%s · Tessera" },
  description: "Hidden mosaics made by people: upload a photo, everyone paints one colour, and nobody sees the picture until the reveal.",
};

export const viewport: Viewport = { themeColor: "#000000", viewportFit: "cover", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
