import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata = {
  title: "Festra - it's free",
  description:
    "Festra is free to use - the full liveability map, every area profile, and the Buyer Location Check. No paid tiers, no ads, no behavioural profiling, no reselling of open data.",
};

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <Link href="/" className="text-sm text-accent hover:underline">
          ← Map
        </Link>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink">
          It&apos;s free
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          Everything here is <strong className="text-ink">free to use</strong> - the full
          interactive liveability map, every area (SA2) profile with its sources and
          data-confidence, and the <strong className="text-ink">Buyer Location Check</strong>{" "}
          (drop a pin, read a sourced second-opinion report on screen). No paid tiers, no
          subscription, no ads, no selling of your data, no behavioural profiling - at most
          privacy-friendly, cookieless page counts - and we never resell the open data.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          If a paid option is ever added, it will only be convenience on top - saving,
          exporting or sharing a report - and the map and all the underlying facts will stay
          free. There is nothing to buy today.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-focus"
          >
            Open the map
          </Link>
        </div>
        <p className="mt-6 text-xs text-ink-muted">
          See the{" "}
          <Link href="/terms" className="text-accent hover:underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-accent hover:underline">
            Privacy Policy
          </Link>
          . Not relocation, financial, or legal advice.
        </p>
      </div>
      <SiteFooter />
    </div>
  );
}
