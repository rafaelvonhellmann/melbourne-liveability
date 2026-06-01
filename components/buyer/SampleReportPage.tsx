import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import type { FeatureCollection, Feature, Point } from "geojson";
import type { PlacesFile } from "@/lib/places-data";
import type { LngLat } from "@/lib/buyer-location";
import { buildBuyerReport } from "@/lib/buyer-report";
import { BuyerReportPanel } from "@/components/buyer/BuyerReportPanel";
import { SiteFooter } from "@/components/SiteFooter";

const SAMPLE_SLUG = "brunswick-east-206011106";

async function loadSample() {
  const root = process.cwd();
  const placesFile = JSON.parse(
    await readFile(path.join(root, "public", "data", "places.json"), "utf8")
  ) as PlacesFile;
  const pois = JSON.parse(
    await readFile(path.join(root, "public", "data", "pois.geojson"), "utf8")
  ) as FeatureCollection;
  const place =
    placesFile.places.find((p) => p.slug === SAMPLE_SLUG) ??
    placesFile.places.find((p) => !p.nonResidential) ??
    placesFile.places[0];
  const pin = place.centroid as LngLat;
  const report = buildBuyerReport({
    lat: pin[1],
    lng: pin[0],
    place,
    pois: pois.features as Feature<Point>[],
    // Stamp with the dataset date so the static page does not churn each rebuild.
    generatedAt: placesFile.generatedAt,
  });
  return { place, report };
}

/**
 * Shared implementation behind both `/buyer/sample-report` (canonical) and the
 * legacy `/buyer/sample` route. Server component — reads the committed data at
 * build and renders a fully static, indexable sample Buyer report.
 */
export default async function SampleReportPage() {
  const { place, report } = await loadSample();
  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <Link href="/" className="no-print text-sm text-accent hover:underline">
          ← Map
        </Link>
        <h1 className="mt-4 font-display text-2xl font-semibold text-ink">
          Sample location check — {place.name}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Sample only — this illustrates the kind of due-diligence summary a buyer would receive
          after dropping a pin. It is <b className="text-ink">not</b> a report for a specific
          property. It is computed at the centre of <b className="text-ink">{place.name}</b> (
          {place.lga}); in the app you drop the pin on the exact address and the &ldquo;nearby&rdquo;
          section is measured from that point.
        </p>
        <div className="no-print mt-4 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-focus"
          >
            Check a real location on the map →
          </Link>
          <Link
            href="/buyer"
            className="rounded-md border border-surface-border px-4 py-2 text-sm text-ink transition-colors hover:border-accent hover:text-accent"
          >
            What is Buyer Mode?
          </Link>
        </div>

        <div className="mt-6">
          <BuyerReportPanel report={report} place={place} variant="sample" />
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
