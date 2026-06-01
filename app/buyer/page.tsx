import Link from "next/link";
import { MapPin, ShieldAlert, Footprints, Users, ClipboardCheck } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata = {
  title: "Buyer location check — a second opinion before you offer · Melbourne",
  description:
    "Drop a pin on any Melbourne property and see the hidden liveability, hazard and planning context: nearby amenities on foot, risk indicators, community context, and what to verify before you inspect or bid. Built from open government data. Not advice.",
};

const WHAT_YOU_GET = [
  {
    icon: Footprints,
    title: "What's actually on foot",
    body: "Supermarkets, GP, schools, parks, transport and more within a ~15-minute walk of the exact spot — not the suburb average.",
  },
  {
    icon: ShieldAlert,
    title: "Risk indicators",
    body: "Bushfire and flood planning-overlay exposure and crime context — surfaced honestly, with what to verify with council and your insurer.",
  },
  {
    icon: Users,
    title: "Liveability & community trade-offs",
    body: "Transport, health, education, affordability and tenure mix for the area — one transparent lens, never a single 'score'.",
  },
  {
    icon: ClipboardCheck,
    title: "A verify-before-you-offer checklist",
    body: "The due-diligence this tool can't do for you: overlays, inspections, school zones, title, body corporate.",
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
            Check the hidden liveability, risk and planning context around any Melbourne
            property.
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-muted">
            Found a place on Domain or realestate.com.au? Before you inspect, bid, or make an
            offer, <b className="text-ink">drop a pin</b> and get a second opinion — nearby
            amenities, liveability trade-offs, hazard indicators, community context, and what to
            verify before you commit.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-focus"
            >
              Check a location on the map →
            </Link>
            <Link
              href="/buyer/sample"
              className="rounded-md border border-surface-border px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
            >
              See a sample report
            </Link>
          </div>
        </section>

        {/* What you get */}
        <section className="mt-12">
          <h2 className="font-display text-xl font-medium text-ink">What you get</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {WHAT_YOU_GET.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="rounded-lg border border-surface-border bg-surface p-4 shadow-card"
                >
                  <Icon className="h-5 w-5 text-accent" aria-hidden />
                  <h3 className="mt-2 font-display text-base font-medium text-ink">{f.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-muted">{f.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* How it works */}
        <section className="mt-12">
          <h2 className="font-display text-xl font-medium text-ink">How it works</h2>
          <ol className="mt-4 grid gap-4 sm:grid-cols-3">
            {[
              ["1", "Drop a pin", "Click the exact property location on the map."],
              ["2", "Read the second opinion", "Amenities, risk indicators and context for that spot."],
              ["3", "Verify before you offer", "Use the checklist with council, conveyancer and insurer."],
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
            listings portal, not a price/valuation estimate, and not financial, property, legal
            or insurance advice. Always verify anything material with the relevant professional.
          </p>
          <p className="mt-3 text-sm text-ink-muted">
            The core liveability map stays free.{" "}
            <Link href="/pricing" className="text-accent hover:underline">
              See pricing
            </Link>{" "}
            ·{" "}
            <Link href="/methodology" className="text-accent hover:underline">
              methodology &amp; sources
            </Link>
            .
          </p>
        </section>
      </div>
      <SiteFooter />
    </div>
  );
}
