import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Melbourne Liveability Map",
  description:
    "Map-first liveability scores for Greater Melbourne from Australian government open data.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
