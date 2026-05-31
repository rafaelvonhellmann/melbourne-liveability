import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata = {
  title: "Disclaimer · Melbourne Liveability",
  description:
    "liveable.melbourne is for general information only — not relocation, financial, or legal advice. Data is approximate and lagged.",
};

export default function DisclaimerPage() {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Link href="/" className="text-sm text-accent hover:underline">
          ← Map
        </Link>
        <h1 className="mt-4 font-display text-2xl font-semibold text-ink">Disclaimer</h1>
        <p className="mt-4 text-sm leading-relaxed">
          This tool is for general information only. It is{" "}
          <strong className="text-ink">not relocation, financial, or legal advice</strong>,
          and creates no professional relationship. Scores use approximate and lagged
          government open data; verify important decisions with primary sources.
        </p>
        <p className="mt-4 text-sm leading-relaxed">
          Scores are percentile-ranked lenses within Greater Melbourne, not a definitive
          ranking of where to live. Crime rates can overstate inner areas with large daytime
          populations; hazard and health layers may be spatially coarse. See the{" "}
          <Link href="/methodology" className="text-accent hover:underline">
            methodology
          </Link>{" "}
          for per-dataset sources, licences, vintages, and caveats.
        </p>

        <h2 className="mt-6 font-display text-lg font-medium text-ink">Privacy</h2>
        <p className="mt-2 text-sm leading-relaxed">
          Your persona, weights, shortlist, and recently viewed areas are stored in your
          browser only (localStorage) unless you share a link — manage or clear them on the{" "}
          <Link href="/account" className="text-accent hover:underline">
            Your data
          </Link>{" "}
          page. If you register for alerts or send feedback we collect the email you provide.
          Full detail is in the{" "}
          <Link href="/privacy" className="text-accent hover:underline">
            Privacy Policy
          </Link>
          ; your use is also subject to the{" "}
          <Link href="/terms" className="text-accent hover:underline">
            Terms of Use
          </Link>
          .
        </p>
      </div>
      <SiteFooter />
    </div>
  );
}
