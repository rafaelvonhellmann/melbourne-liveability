import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import type { FeatureCollection, Feature, Point } from "geojson";
import type { PlacesFile } from "@/lib/places-data";
import { amenitiesNear, type LngLat } from "@/lib/buyer-location";
import { BuyerReport, type AmenityByCat } from "@/components/BuyerReport";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata = {
  title: "Sample buyer location check · Melbourne Liveability",
  description:
    "A sample second-opinion location report for a Melbourne suburb: amenities on foot, liveability, hazard and crime risk indicators, community context, and what to verify before you offer.",
};

const SAMPLE_SLUG = "brunswick-east-206011106";

async function loadSample() {
  const root = process.cwd();
  const places = JSON.parse(
    await readFile(path.join(root, "public", "data", "places.json"), "utf8")
  ) as PlacesFile;
  const pois = JSON.parse(
    await readFile(path.join(root, "public", "data", "pois.geojson"), "utf8")
  ) as FeatureCollection;
  const place =
    places.places.find((p) => p.slug === SAMPLE_SLUG) ??
    places.places.find((p) => !p.nonResidential) ??
    places.places[0];
  const pin = place.centroid as LngLat;
  const byCat = amenitiesNear(pin, pois.features as Feature<Point>[], 1.2);
  const amenitiesByCat: AmenityByCat = {};
  for (const [k, v] of byCat) amenitiesByCat[k] = { count: v.count, nearestKm: v.nearestKm };
  return { place, amenitiesByCat };
}

export default async function SampleBuyerReportPage() {
  const { place, amenitiesByCat } = await loadSample();
  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <Link href="/" className="text-sm text-accent hover:underline">
          ← Map
        </Link>
        <h1 className="mt-4 font-display text-2xl font-semibold text-ink">
          Sample location check — {place.name}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          This is an example of the second-opinion report you get when you drop a pin on a
          property. This sample is computed at the centre of <b className="text-ink">{place.name}</b>
          {" "}({place.lga}); in the app you drop the pin on the <b className="text-ink">exact
          address</b> from the listing and the &ldquo;on foot&rdquo; section is measured from
          that point.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
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
          <BuyerReport place={place} amenitiesByCat={amenitiesByCat} variant="sample" />
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
