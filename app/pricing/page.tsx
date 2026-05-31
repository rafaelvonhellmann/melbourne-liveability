import Link from "next/link";
import { Check } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { FeedbackButton } from "@/components/FeedbackButton";

export const metadata = {
  title: "Pricing · Melbourne Liveability",
  description:
    "The core map and all liveability data are free forever. Optional Pro features and authoritative area report cards for organisations are planned.",
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
    name: "Free",
    price: "$0",
    tagline: "The full public good — forever free.",
    status: "available",
    features: [
      "Full interactive map + all seven scored domains",
      "Every suburb (SA2) profile with sources & caveats",
      "Methodology, data-confidence, and coverage transparency",
      "Lenses & personas, priority sliders, shareable links",
      "Compare up to 3 areas, one shortlist",
      "Email update alerts + feedback",
    ],
  },
  {
    name: "Pro",
    price: "$ / mo",
    tagline: "Convenience & power for serious movers.",
    highlight: true,
    status: "soon",
    features: [
      "Everything in Free",
      "Synced shortlists, personas & dashboards across devices",
      "Compare 5–10 areas side by side",
      "Exportable PDF / CSV suburb report card",
      "Saved searches + shortlist update-alerts",
      "Trend view as more time-series land",
    ],
  },
  {
    name: "Area Reports",
    price: "Contact us",
    tagline: "For councils, MPs' offices, journalists & relocation firms.",
    status: "contact",
    features: [
      "Authoritative, sourced, exportable area report cards",
      "Bulk / multi-area comparisons",
      "Data-confidence and methodology appendix included",
      "Custom datasets on request",
      "Retains full open-data attribution",
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
          The core map and all liveability <strong className="text-ink">facts</strong>{" "}
          (safety, affordability, hazards, sources) stay free forever — paywalling a
          relocation tool would be exploitative and kill the open-data mission. We charge
          only for <strong className="text-ink">convenience and derived analysis</strong>,
          never for reselling the open data.
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
                    Coming soon
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
                  <FeedbackButton className="w-full justify-center inline-flex items-center gap-1.5 rounded-md border border-accent px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/5" />
                )}
                {t.status === "contact" && (
                  <FeedbackButton className="w-full justify-center inline-flex items-center gap-1.5 rounded-md border border-surface-border px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent" />
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-6 text-xs text-ink-muted">
          Pro and Area Reports are not yet purchasable — use the Feedback button on a card
          to register interest and we&apos;ll tell you when they launch. Accounts and
          payments will be added as a thin, separate service; the data site stays static and
          free. See the{" "}
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
