import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata = {
  title: "Festra - update alerts",
  description:
    "Email alerts are not available yet. The open data behind Festra refreshes monthly; alerts will arrive together with accounts.",
};

export default function AlertsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <Link href="/" className="text-sm text-accent hover:underline">
          ← Map
        </Link>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink">
          Update alerts
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          Email alerts are <strong className="text-ink">not available yet</strong>. The
          government open data behind the map is checked and rebuilt about once a month,
          so whatever you see here is already the latest build.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          Email alerts will arrive together with accounts: you will be able to register
          once and get an email when data for your shortlisted areas changes. Until then,
          the best way to stay current is to revisit the map after a refresh.
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
          Curious how and when the data refreshes? See the{" "}
          <Link href="/methodology" className="text-accent hover:underline">
            methodology
          </Link>
          .
        </p>
      </div>
      <SiteFooter />
    </div>
  );
}
