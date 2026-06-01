import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://rafaelvonhellmann.github.io/melbourne-liveability"
  ),
  title: "liveable.melbourne — check a location before you buy or rent in Melbourne",
  description:
    "Drop a pin on any Melbourne property for an independent, sourced second opinion before you offer: what's nearby on foot, hazard and planning context, liveability trade-offs and community context — built from open government data. Not financial, property or legal advice.",
  openGraph: {
    title: "liveable.melbourne — check a location before you buy",
    description:
      "An independent, open-data second opinion on any Melbourne location: amenities on foot, risk indicators, liveability and community context. Not advice.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU" className={`${inter.variable} ${fraunces.variable}`}>
      <body>{children}</body>
    </html>
  );
}
