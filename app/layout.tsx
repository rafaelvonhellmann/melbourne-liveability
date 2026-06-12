import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import Script from "next/script";
import { ANALYTICS_DOMAIN } from "@/lib/analytics";

/* Festra type system (DESIGN-SYSTEM-PROPOSAL.md s3 + FABLE-ULTRAPLAN s18.8):
   Inter for UI/body (400/500/600), IBM Plex Mono for data figures (400/500),
   General Sans for the wordmark + display headings (500/600 only).
   next/font downloads Google-hosted faces at BUILD time and self-hosts them,
   so the static export makes zero runtime font requests to Google. General
   Sans is not on Google Fonts: the woff2 files live in public/fonts/
   (Fontshare, ITF Free Font License - see public/fonts/LICENSE.txt). */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500"],
});

const generalSans = localFont({
  src: [
    { path: "../public/fonts/GeneralSans-Medium.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/GeneralSans-Semibold.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-display",
  display: "swap",
});

/* Browser chrome matches the Surveyor near-white canvas. The favicon is the
   casement-F mark, auto-served by Next from app/icon.svg. */
export const viewport: Viewport = {
  themeColor: "#FBF8F3",
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://festra.au"
  ),
  title: "Festra - check a location before you buy or rent in Melbourne",
  description:
    "Drop a pin on any Melbourne property for an independent, sourced second opinion before you offer: what's nearby on foot, hazard and planning context, liveability trade-offs and community context - built from open government data. Not financial, property or legal advice.",
  openGraph: {
    title: "Festra - check a location before you buy",
    description:
      "An independent, open-data second opinion on any Melbourne location: amenities on foot, risk indicators, liveability and community context. Not advice.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en-AU"
      className={`${inter.variable} ${plexMono.variable} ${generalSans.variable}`}
    >
      <body>
        {children}
        {ANALYTICS_DOMAIN && (
          <Script defer data-domain={ANALYTICS_DOMAIN} src="https://plausible.io/js/script.js" />
        )}
      </body>
    </html>
  );
}
