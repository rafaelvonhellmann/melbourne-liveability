import Link from "next/link";
import { MapPin, ShieldAlert, CheckCircle2 } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata = {
  title: "Festra - buyer location check: a second opinion before you offer",
  description:
    "Drop a pin on any Melbourne property and see the hidden liveability, hazard and planning context: nearby amenities on foot, risk indicators, community context, and what to verify before you inspect or bid. Built from open government data. Not advice.",
};

/**
 * Hardcoded excerpt rows - show, don't tell. Styled to match the flattened
 * finding rows in BuyerReportPanel (divider-separated, severity accent bar,
 * per-finding provenance line) so the landing previews the real product.
 */
type ExcerptRow = {
  icon: typeof ShieldAlert;
  accent: string;
  title: string;
  summary: string;
  verify?: string;
  meta: string;
};

const EXCERPT_ROWS: ExcerptRow[] = [
  {
    icon: ShieldAlert,
    accent: "border-l-[#E31A1C]",
    title: "Flood overlay covers part of this area",
    summary:
      "About 18% of this area sits in a Land Subject to Inundation Overlay (LSIO).",
    verify:
      "Ask council for a property-specific planning certificate before you offer.",
    meta: "Confidence: medium · Geography: suburb / area · Source: Vicplan planning overlays (as at May 2026)",
  },
  {
    icon: ShieldAlert,
    accent: "border-l-accent",
    title: "Busy road within 200 m",
    summary:
      "The nearest measured segment of Hoddle Street carries roughly 50,000 vehicles a day.",
    verify: "Visit at peak hour and check bedroom-side glazing.",
    meta: "Confidence: high · Geography: this point · Source: DTP traffic volumes (as at 2024)",
  },
  {
    icon: CheckCircle2,
    accent: "border-l-[#117733]",
    title: "Train station within a 10-minute walk",
    summary: "Victoria Park Station is about 650 m from the pin (straight line).",
    meta: "Confidence: high · Geography: this point · Source: OpenStreetMap (as at Jun 2026)",
  },
];

export default function BuyerLandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <Link href="/" className="text-sm text-accent hover:underline">
          ← Map
        </Link>

        {/* Hero */}
        <section className="mt-6">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-surface-sunken px-3 py-1 text-xs font-medium text-ink-muted">
            <MapPin className="h-3.5 w-3.5 text-accent" aria-hidden /> Buyer location check
          </span>
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-semibold leading-tight tracking-tight text-ink">
            A second opinion on the location before you make an offer.
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-muted">
            Found a place on Domain or realestate.com.au? Before you inspect, bid, or make an
            offer, <b className="text-ink">drop a pin</b> and get a sourced screening report -
            nearby amenities, liveability trade-offs, hazard indicators, community context, and
            what to verify before you commit.
          </p>
          <p className="mt-3 max-w-2xl text-xs leading-relaxed text-ink-muted">
            Independent open-data location intelligence. No listings. No agent spin. Information
            only - not financial, property, legal, insurance or planning advice.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/?buyer=1"
              className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-focus"
            >
              Check a property →
            </Link>
            <Link
              href="/"
              className="rounded-md border border-surface-border px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
            >
              Explore the map
            </Link>
            <Link
              href="/buyer/sample-report"
              className="rounded-md border border-surface-border px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
            >
              View sample report
            </Link>
          </div>
        </section>

        {/* Report excerpt - real finding rows instead of feature-card marketing */}
        <section className="mt-12">
          <h2 className="font-display text-xl font-medium text-ink">
            What a report looks like
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            An excerpt from a Buyer Location Check. Every finding names its source, its
            geographic precision and how confident we are - so you know exactly what to
            verify and with whom.
          </p>
          <div className="mt-4 rounded-lg border border-surface-border bg-surface p-4 shadow-card">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-display text-sm font-semibold text-ink">
                Findings - excerpt
              </h3>
              <span className="text-[10px] tracking-wide text-ink-muted">
                example pin · Abbotsford
              </span>
            </div>
            <div className="mt-2.5 divide-y divide-surface-border">
              {EXCERPT_ROWS.map((row) => {
                const Icon = row.icon;
                return (
                  <div
                    key={row.title}
                    className={`border-l-[3px] ${row.accent} py-2.5 pl-3 first:pt-0 last:pb-0`}
                  >
                    <div className="flex items-start gap-2">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink">{row.title}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                          {row.summary}
                        </p>
                        {row.verify && (
                          <p className="mt-1 text-[11px] leading-snug text-ink-muted">
                            <span className="font-medium text-ink">Verify:</span> {row.verify}
                          </p>
                        )}
                        <p className="mt-1.5 text-[10px] tracking-wide text-ink-muted">
                          {row.meta}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-5">
            <Link
              href="/?buyer=1"
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-focus"
            >
              <MapPin className="h-4 w-4" aria-hidden /> Drop a pin to check a property →
            </Link>
          </div>
        </section>

        {/* What this is NOT */}
        <section className="mt-12 rounded-lg border border-surface-border bg-surface-sunken p-5">
          <h2 className="font-display text-lg font-medium text-ink">What this is - and what it is not</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            It <b className="text-ink">is</b> an independent, sourced due-diligence layer built
            from open government and OpenStreetMap data - the risks and context that
            agent-funded listing sites do not surface. It is <b className="text-ink">not</b> a
            listings portal, not a price/valuation estimate, and not financial, property, legal,
            insurance or planning advice. Always verify anything material with the relevant
            professional.
          </p>
          <p className="mt-3 text-sm text-ink-muted">
            Free to use - the map and every report.{" "}
            <Link href="/methodology" className="text-accent hover:underline">
              Methodology &amp; sources
            </Link>
            .
          </p>
        </section>
      </div>
      <SiteFooter />
    </div>
  );
}
