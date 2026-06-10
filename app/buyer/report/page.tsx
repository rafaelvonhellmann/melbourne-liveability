import { Suspense } from "react";
import { PinReportClient } from "./report-client";

// P1-1: the FULL buyer report for the user's REAL pin, as its own route
// (/buyer/report?lat=..&lng=..). The live map panel stays the compact hint;
// this page renders everything the sample shows - verify-actions, caveats,
// per-finding provenance + freshness, sources - for the exact coordinates.
// Static-export-safe: one prerendered shell; the pin comes from the query
// string read client-side inside the Suspense boundary below.

export const metadata = {
  title: "Full buyer report",
  description:
    "The full Buyer Location Check for an exact pin: every finding with sources, dataset dates, caveats and what to verify before you offer. Printable. Not advice.",
  // Every pin is a query-string variant of this one page - keep crawlers out
  // (the indexable showcase is /buyer/sample-report).
  robots: { index: false },
};

export default function FullBuyerReportPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-2xl px-4 py-8 text-sm text-ink-muted">
          Loading the full buyer report…
        </div>
      }
    >
      <PinReportClient />
    </Suspense>
  );
}
