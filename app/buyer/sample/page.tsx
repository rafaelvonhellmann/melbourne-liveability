// Legacy route — the canonical sample lives at /buyer/sample-report. Both render
// the same static sample report (shared implementation) so existing links keep
// working without a runtime redirect (not available under static export).
export { default } from "@/components/buyer/SampleReportPage";

const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://rafaelvonhellmann.github.io/melbourne-liveability";

export const metadata = {
  title: "Sample buyer location check · Melbourne Liveability",
  description:
    "A sample second-opinion location report for a Melbourne suburb: amenities on foot, liveability, hazard and crime risk indicators, community context, sources and what to verify before you offer. Sample only — not a report for a specific property.",
  // Legacy duplicate of /buyer/sample-report — point search engines at the one canonical URL.
  alternates: { canonical: `${SITE}/buyer/sample-report` },
};
