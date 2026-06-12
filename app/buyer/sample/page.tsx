import Link from "next/link";
import { RedirectClient } from "./redirect-client";

// Legacy duplicate of /buyer/sample-report, retired in favour of the one
// canonical URL. A server shell keeps the static export crawlable (metadata +
// a visible link instead of a blank page) while the client child redirects
// old links / bookmarks instantly, like the retired /welcome route.

const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://festra.au";

export const metadata = {
  title: "Festra - sample buyer location check (moved)",
  robots: { index: false },
  alternates: { canonical: `${SITE}/buyer/sample-report` },
};

export default function BuyerSamplePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 text-sm text-ink">
      <p>
        This page moved to{" "}
        <Link href="/buyer/sample-report" className="text-accent hover:underline">
          /buyer/sample-report
        </Link>
        .
      </p>
      <RedirectClient />
    </main>
  );
}
