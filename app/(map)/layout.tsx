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
          <span className="flex items-center gap-2 font-display text-lg font-semibold uppercase tracking-[0.06em] text-accent">
            <svg width="20" height="20" viewBox="0 0 26 28" aria-hidden="true">
              <g fill="currentColor"><circle cx="6" cy="4" r="1.9" /><circle cx="11" cy="4" r="1.9" /><circle cx="16" cy="4" r="1.9" /><circle cx="21" cy="4" r="1.9" /><circle cx="6" cy="9" r="1.9" /><circle cx="6" cy="14" r="1.9" /><circle cx="11" cy="14" r="1.9" /><circle cx="16" cy="14" r="1.9" /><circle cx="6" cy="19" r="1.9" /><circle cx="6" cy="24" r="1.9" /></g>
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
