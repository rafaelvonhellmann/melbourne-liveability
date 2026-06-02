import Link from "next/link";
import { MapPin, ShieldAlert, Footprints, BarChart3 } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata = {
  title: "Buyer location check — a second opinion before you offer · Melbourne",
  description:
    "Drop a pin on any Melbourne property and see the hidden liveability, hazard and planning context: nearby amenities on foot, risk indicators, community context, and what to verify before you inspect or bid. Built from open government data. Not advice.",
};

type CardItem = { label: string; soon?: boolean; note?: boolean };
const CARDS: { icon: typeof ShieldAlert; title: string; items: CardItem[] }[] = [
  {
    icon: ShieldAlert,
    title: "Red flags to verify",
    items: [
      { label: "Flood & bushfire planning-overlay exposure (where mapped)" },
      { label: "Crime & safety context (where available)" },
      { label: "Data-confidence caveats on every finding" },
      { label: "Zoning, heritage & planning-scheme overlays", soon: true },
    ],
  },
  {
    icon: Footprints,
    title: "What is actually nearby",
    items: [
      { label: "Public transport" },
      { label: "Schools / education" },
      { label: "Parks / open space" },
      { label: "Health services" },
      { label: "Shops / amenities" },
      { label: "15-minute access caveat", note: true },
    ],
  },
  {
    icon: BarChart3,
    title: "Area context",
    items: [
      { label: "Liveability score and domains" },
      { label: "Demographic / community context" },
      { label: "Affordability / rental context where already available" },
      { label: "School catchments, building approvals, zoning overlays", soon: true },
    ],
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
            offer, <b className="text-ink">drop a pin</b> and get a sourced screening report —
            nearby amenities, liveability trade-offs, hazard indicators, community context, and
            what to verify before you commit.
          </p>
          <p className="mt-3 max-w-2xl text-xs leading-relaxed text-ink-muted">
            Independent open-data location intelligence. No listings. No agent spin. Information
            only — not financial, property, legal, insurance or planning advice.
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

        {/* What you get — three cards */}
        <section className="mt-12">
          <h2 className="font-display text-xl font-medium text-ink">What you get</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {CARDS.map((c) => {
              const Icon = c.icon;
              return (
                <div
                  key={c.title}
                  className="rounded-lg border border-surface-border bg-surface p-4 shadow-card"
                >
                  <Icon className="h-5 w-5 text-accent" aria-hidden />
                  <h3 className="mt-2 font-display text-base font-medium text-ink">{c.title}</h3>
                  <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink-muted">
                    {c.items.map((it) => (
                      <li key={it.label} className="flex items-start gap-1.5">
                        <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
                        <span>
                          {it.label}
                          {it.soon && (
                            <span className="ml-1.5 rounded border border-surface-border bg-surface-sunken px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                              Coming soon
                            </span>
                          )}
                          {it.note && <span className="text-ink-muted"> (straight-line, not routing)</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        {/* How it works */}
        <section className="mt-12">
          <h2 className="font-display text-xl font-medium text-ink">How it works</h2>
          <ol className="mt-4 grid gap-4 sm:grid-cols-4">
            {[
              ["1", "Drop a pin", "Click the exact property location on the map."],
              ["2", "Review risks & trade-offs", "Amenities, risk indicators and context for that spot."],
              ["3", "Print / share the report", "Save it as a PDF or send the link."],
              ["4", "Verify before you offer", "Use the checklist with council, conveyancer and insurer."],
            ].map(([n, t, b]) => (
              <li key={n} className="rounded-lg border border-surface-border bg-surface p-4">
                <span className="num inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-ink">
                  {n}
                </span>
                <h3 className="mt-2 text-sm font-medium text-ink">{t}</h3>
                <p className="mt-0.5 text-sm text-ink-muted">{b}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* What this is NOT */}
        <section className="mt-12 rounded-lg border border-surface-border bg-surface-sunken p-5">
          <h2 className="font-display text-lg font-medium text-ink">What this is — and what it is not</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            It <b className="text-ink">is</b> an independent, sourced due-diligence layer built
            from open government and OpenStreetMap data — the risks and context that
            agent-funded listing sites do not surface. It is <b className="text-ink">not</b> a
            listings portal, not a price/valuation estimate, and not financial, property, legal,
            insurance or planning advice. Always verify anything material with the relevant
            professional.
          </p>
          <p className="mt-3 text-sm text-ink-muted">
            Free to use — the map and every report.{" "}
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
