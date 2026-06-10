import Link from "next/link";
import { ShieldCheck, Database, HeartHandshake, Scale } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { FeedbackButton } from "@/components/FeedbackButton";

export const metadata = {
  title: "About & trust - who built liveable.melbourne, and how it stays independent",
  description:
    "Who builds liveable.melbourne, why it exists, how it stays independent, how it will (and won't) make money, what open data it uses, how confidence is calculated, and how to report a data issue.",
};

const PILLARS = [
  {
    icon: ShieldCheck,
    title: "Independent",
    body: "Not funded by, affiliated with, or paid by any real-estate agent, listing portal, developer, lender, insurer or government body. No ads. No behavioural profiling. We do not sell your data - at most privacy-friendly, cookieless page counts.",
  },
  {
    icon: Database,
    title: "Open data, fully sourced",
    body: "Every figure is compiled from Australian government / official open data and OpenStreetMap, with the source, licence, data period and fetch date recorded. Where we lack data, we say so - we never invent or overclaim it.",
  },
  {
    icon: HeartHandshake,
    title: "A second opinion, not a verdict",
    body: "We describe area-level context and what to verify. We never tell you to buy or avoid a place, and never label a suburb or its residents.",
  },
  {
    icon: Scale,
    title: "Not advice",
    body: "Information only - not financial, property, legal, insurance or planning advice. Always verify anything material with the relevant professional.",
  },
];

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10" role="main">
        <Link href="/" className="text-sm text-accent hover:underline">
          ← Map
        </Link>

        <h1 className="mt-6 font-display text-3xl font-semibold leading-tight tracking-tight text-ink">
          About liveable.melbourne
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-ink-muted">
          Independent, open-data location intelligence for Greater Melbourne - built so that
          buyers and renters get a transparent, sourced second opinion on a location before they
          commit. Built independently in Melbourne; not affiliated with any agent, portal,
          developer or government body.
        </p>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          {PILLARS.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.title} className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
                <Icon className="h-5 w-5 text-accent" aria-hidden />
                <h2 className="mt-2 font-display text-base font-medium text-ink">{p.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{p.body}</p>
              </div>
            );
          })}
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-medium text-ink">Why this exists</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            The data that tells you what a <em>location</em> is actually like - transport, schools,
            hazards and planning overlays, walkable amenities, community context - is scattered
            across the ABS, PTV, the Crime Statistics Agency, Victorian planning portals and
            OpenStreetMap, in formats most people never see. Listing portals are funded by agents
            and lead with price and growth. We compile the open data into one transparent view and
            surface the trade-offs and risks to verify - the second opinion the portals do not give.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="font-display text-xl font-medium text-ink">How it stays free</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            liveable.melbourne is <b className="text-ink">free</b> - the map, every area profile,
            and the Buyer Location Check. No ads, no behavioural profiling, no agent payments, and
            we never resell the open data. If a paid convenience is ever added later, the map and
            all the underlying facts will stay free.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="font-display text-xl font-medium text-ink">What data we use, and what we leave out</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            <b className="text-ink">We use:</b> ABS (Census, SEIFA, regional population), PTV GTFS,
            Victorian Crime Statistics Agency, Victorian planning overlays &amp; MapShare (all
            CC BY 4.0) and © OpenStreetMap contributors (ODbL). Full detail and how each score is
            built is on the{" "}
            <Link href="/methodology" className="text-accent hover:underline">methodology</Link> page.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            <b className="text-ink">We do not use:</b> sale prices, valuations or yield estimates
            (not open data we can licence); your personal data; or any ads or behavioural
            profiling - at most privacy-friendly, cookieless page counts
            (see <Link href="/privacy" className="text-accent hover:underline">privacy</Link>).
            Each area also carries a data-completeness measure, and every finding shows its source,
            geographic precision, confidence and caveats.
          </p>
        </section>

        <section className="mt-8 rounded-lg border border-surface-border bg-surface-sunken p-5">
          <h2 className="font-display text-lg font-medium text-ink">Found a data issue?</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Open data can be incomplete, outdated or wrong. If something looks off, tell us - ideally
            with the source - and we will check it.
          </p>
          <div className="mt-3">
            <FeedbackButton context="About page - report a data issue" />
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            See also our{" "}
            <Link href="/disclaimer" className="text-accent hover:underline">disclaimer</Link> and{" "}
            <Link href="/terms" className="text-accent hover:underline">terms</Link>.
          </p>
        </section>
      </div>
      <SiteFooter />
    </div>
  );
}
