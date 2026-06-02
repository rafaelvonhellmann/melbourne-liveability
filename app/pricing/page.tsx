import Link from "next/link";
import { Check } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { FeedbackButton } from "@/components/FeedbackButton";

export const metadata = {
  title: "Pricing — the map is free; buyer reports are per-property",
  description:
    "The liveability map and all open-data facts stay free forever. The Buyer Location Report is planned as a one-off per-property purchase (with bundles) — no subscription. Join the waitlist.",
};

type Tier = {
  name: string;
  price: string;
  tagline: string;
  features: string[];
  highlight?: boolean;
  status: "available" | "soon" | "contact";
};

const TIERS: Tier[] = [
  {
    name: "Free map",
    price: "$0",
    tagline: "The public good — free forever.",
    status: "available",
    features: [
      "Full interactive liveability map + every suburb (SA2) profile",
      "Sources, data-confidence and methodology transparency",
      "Buyer Check: drop a pin, read the second-opinion report on screen",
      "Lenses, compare, shortlist, shareable links",
      "Print / save any report as PDF",
    ],
  },
  {
    name: "Buyer Location Report",
    price: "Per report",
    tagline: "A one-off, sourced due-diligence report for a property you're serious about.",
    highlight: true,
    status: "soon",
    features: [
      "Everything in the free check, as a saved, shareable report",
      "Pay per property — no subscription",
      "Bundles for buyers checking several places",
      "What to verify before you offer, with sources + caveats",
      "Future layers as they land (school zones, overlays, supply)",
    ],
  },
  {
    name: "Agents & conveyancers",
    price: "Volume",
    tagline: "Report credits for buyers' agents and conveyancers.",
    status: "contact",
    features: [
      "Reuse reports across clients",
      "Volume report credits",
      "Full open-data attribution + methodology appendix",
      "Bulk / multi-property checks",
    ],
  },
];

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Link href="/" className="text-sm text-accent hover:underline">
          ← Map
        </Link>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink">
          Pricing
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          The map and all liveability <strong className="text-ink">facts</strong> stay free
          forever — paywalling open data would kill the mission. The paid product is a one-off{" "}
          <strong className="text-ink">Buyer Location Report</strong> for a specific property:
          you pay per report, not a subscription. We&apos;re still settling the exact price with
          early users, so nothing is locked in yet — <strong className="text-ink">join the
          waitlist</strong> and you&apos;ll help set it.
        </p>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={`flex flex-col rounded-xl border bg-surface p-5 shadow-card ${
                t.highlight ? "border-accent" : "border-surface-border"
              }`}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold text-ink">{t.name}</h2>
                {t.status === "soon" && (
                  <span className="rounded-full border border-surface-border bg-surface-sunken px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-muted">
                    Waitlist
                  </span>
                )}
              </div>
              <p className="num mt-2 text-2xl font-semibold text-ink">{t.price}</p>
              <p className="mt-1 text-sm text-ink-muted">{t.tagline}</p>

              <ul className="mt-4 flex-1 space-y-2">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-ink">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5">
                {t.status === "available" && (
                  <Link
                    href="/"
                    className="block rounded-md bg-accent px-4 py-2 text-center text-sm font-medium text-accent-ink transition-colors hover:bg-accent-focus"
                  >
                    Open the map
                  </Link>
                )}
                {t.status === "soon" && (
                  <FeedbackButton
                    context="Buyer Report waitlist"
                    className="w-full justify-center inline-flex items-center gap-1.5 rounded-md border border-accent px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/5"
                  />
                )}
                {t.status === "contact" && (
                  <FeedbackButton
                    context="Agents/conveyancers interest"
                    className="w-full justify-center inline-flex items-center gap-1.5 rounded-md border border-surface-border px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-6 text-xs text-ink-muted">
          Reports are not purchasable yet — the Waitlist button registers interest and helps us
          set a fair per-report price. Accounts and payments will be a thin, separate service; the
          data site stays static and free. See the{" "}
          <Link href="/terms" className="text-accent hover:underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-accent hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
      <SiteFooter />
    </div>
  );
}
