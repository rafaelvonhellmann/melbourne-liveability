import { Suspense } from "react";
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";

/**
 * The map is a client route behind Suspense. The fallback is the
 * server-rendered first paint (and what crawlers index before the map
 * hydrates), so it carries the buyer value proposition + crawlable links to the
 * static buyer pages rather than a bare "Loading…".
 */
export default function MapLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center text-ink">
          <span className="flex items-center gap-2 font-display text-lg font-semibold uppercase tracking-[0.06em]">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="2.5" y="2.5" width="19" height="19" rx="4.5" fill="none" stroke="currentColor" strokeWidth="2" />
              <line x1="9.5" y1="2.5" x2="9.5" y2="21.5" stroke="currentColor" strokeWidth="2" />
              <line x1="9.5" y1="8.5" x2="21.5" y2="8.5" stroke="currentColor" strokeWidth="2" />
            </svg>
            {PRODUCT_NAME}
          </span>
          <h1 className="mt-3 max-w-2xl font-display text-2xl font-semibold leading-tight tracking-tight text-ink">
            Check the hidden liveability, risk and planning context around any Melbourne
            property.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-muted">
            Drop a pin before you buy - see nearby amenities, liveability trade-offs, hazard
            indicators and what to verify before you make an offer. Built from open government
            data; not advice.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-sm">
            <Link href="/buyer" className="text-accent hover:underline">
              How buyer mode works
            </Link>
            <span className="text-ink-muted" aria-hidden>
              ·
            </span>
            <Link href="/buyer/sample-report" className="text-accent hover:underline">
              See a sample report
            </Link>
          </div>
          <p className="mt-6 text-xs text-ink-muted">Loading the interactive map…</p>
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
