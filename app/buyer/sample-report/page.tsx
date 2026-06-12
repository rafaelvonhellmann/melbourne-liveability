export { default } from "@/components/buyer/SampleReportPage";

const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://festra.au";

export const metadata = {
  title: "Festra - sample buyer location check",
  description:
    "A sample second-opinion location report for a Melbourne suburb: amenities on foot, liveability, hazard and crime risk indicators, community context, sources and what to verify before you offer. Sample only - not a report for a specific property.",
  // Canonical home of the sample report (the legacy /buyer/sample redirects here).
  alternates: { canonical: `${SITE}/buyer/sample-report` },
};
