"use client";

import { useState } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import type { Feature, FeatureCollection, Point } from "geojson";
import type { Place } from "@/lib/types";
import { withBase } from "@/lib/asset-path";
import { DEFAULT_REGION, dataPath } from "@/lib/regions";
import { buildBuyerReport, type BuyerReport } from "@/lib/buyer-report";
import { BuyerReportPanel } from "@/components/buyer/BuyerReportPanel";

/**
 * "Buying here?" entry point on the SA2 profile. Links to the full pin-drop
 * Buyer Check on the map, and can generate an area-level (mode: "sa2") report
 * inline - clearly flagged as area-level, computed from the SA2 centroid.
 */
export function BuyerHereCard({ place }: { place: Place }) {
  const [report, setReport] = useState<BuyerReport | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (report || loading) return;
    setLoading(true);
    try {
      const res = await fetch(withBase(dataPath(DEFAULT_REGION, "pois.geojson")));
      const fc = (await res.json()) as FeatureCollection;
      setReport(buildBuyerReport({ mode: "sa2", place, pois: fc.features as Feature<Point>[] }));
    } catch {
      setReport(buildBuyerReport({ mode: "sa2", place, pois: [] }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-lg border border-surface-border bg-surface p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
          <MapPin className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-semibold text-ink">Buying here?</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            Two ways to look past the suburb average: drop a pin on the exact property for a
            precise check, or run a quick area-level read right here.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/?buyer=1&select=${place.slug}`}
              className="rounded-md bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-focus"
            >
              Check an exact address on the map →
            </Link>
            {!report && (
              <button
                type="button"
                onClick={generate}
                disabled={loading}
                className="rounded-md border border-surface-border px-3.5 py-1.5 text-sm text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
              >
                {loading ? "Generating…" : "Quick area-level check"}
              </button>
            )}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">
            The exact-address check measures amenities, hazards and noise from the pin you
            drop. The quick check uses this area&apos;s centre point, so it is approximate.
          </p>
          {/* A11y: async status announced to AT - the visible button label
              changes are not reliably announced on their own. */}
          <p role="status" aria-live="polite" className="sr-only">
            {loading ? "Generating area report…" : report ? "Area report ready." : ""}
          </p>
        </div>
      </div>

      {report && (
        <div className="mt-4 border-t border-surface-border pt-4">
          <p className="mb-3 rounded-md border border-surface-border border-l-[3px] border-l-accent bg-surface-sunken px-3 py-2 text-xs leading-relaxed text-ink-muted">
            This is an <b className="text-ink">area-level</b> report for {place.name}. Drop a pin on
            the map for a more specific location check.
          </p>
          <BuyerReportPanel report={report} place={place} variant="embedded" />
        </div>
      )}
    </section>
  );
}
