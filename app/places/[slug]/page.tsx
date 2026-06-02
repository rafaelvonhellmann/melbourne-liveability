import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PlacesFile } from "@/lib/places-data";
import { computeWeightedScore } from "@/lib/scoring";
import { getDefaultWeights } from "@/lib/weights";
import { rankHomeBuyerPercentiles } from "@/lib/home-buyer";
import { computeGmBenchmarks } from "@/lib/benchmarks";
import type { TimeseriesFile } from "@/lib/types";
import { resolvePlaceSeries } from "@/lib/timeseries";
import { findSimilarAreas, toSimilarItems } from "@/lib/similar-areas";
import { PlaceProfileClient } from "@/components/PlaceProfileClient";

type Props = { params: Promise<{ slug: string }> };

let _placesFile: Promise<PlacesFile> | null = null;
async function loadPlacesFile(): Promise<PlacesFile> {
  // Memoised across the many per-slug static builds (read the dataset once).
  if (!_placesFile) {
    const file = path.join(process.cwd(), "public", "data", "places.json");
    _placesFile = readFile(file, "utf8").then(
      (txt) => JSON.parse(txt) as PlacesFile
    );
  }
  return _placesFile;
}

let _timeseries: Promise<TimeseriesFile | null> | null = null;
async function loadTimeseries(): Promise<TimeseriesFile | null> {
  if (!_timeseries) {
    const file = path.join(process.cwd(), "public", "data", "timeseries.json");
    _timeseries = readFile(file, "utf8")
      .then((txt) => JSON.parse(txt) as TimeseriesFile)
      .catch(() => null);
  }
  return _timeseries;
}

let _benchmarks: ReturnType<typeof computeGmBenchmarks> | null = null;
function gmBenchmarks(places: PlacesFile["places"]) {
  // Greater-Melbourne benchmark distribution per indicator — identical for every
  // page, so compute it once for the whole static export.
  if (!_benchmarks) _benchmarks = computeGmBenchmarks(places);
  return _benchmarks;
}

let _homeBuyerRanks: ReturnType<typeof rankHomeBuyerPercentiles> | null = null;
function homeBuyerRanks(places: PlacesFile["places"]) {
  // Buyer-index percentiles rank the whole dataset — identical for every page,
  // so compute once for the static export instead of per slug (O(n) each → O(n^2)).
  if (!_homeBuyerRanks) _homeBuyerRanks = rankHomeBuyerPercentiles(places);
  return _homeBuyerRanks;
}

export async function generateStaticParams() {
  try {
    const data = await loadPlacesFile();
    return data.places
      .filter((p) => !p.nonResidential)
      .map((p) => ({ slug: p.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const data = await loadPlacesFile();
  const place = data.places.find((p) => p.slug === slug);
  if (!place) return { title: "Place not found" };
  const score = computeWeightedScore(place, getDefaultWeights()).total;
  return {
    title: `${place.name} liveability score · Melbourne`,
    description: `${place.name} (${place.lga}) liveability score ${score.toFixed(0)} — seven-domain breakdown with methodology-linked sources.`,
    openGraph: {
      title: `${place.name} · ${score.toFixed(0)} liveability`,
      description: `Greater Melbourne SA2 ${place.sa2Code} — compare domains and sources.`,
      type: "website",
    },
  };
}

export default async function PlaceProfilePage({ params }: Props) {
  const { slug } = await params;
  const data = await loadPlacesFile();
  const place = data.places.find((p) => p.slug === slug);

  if (!place) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 text-ink">
        <p>Place not found.</p>
        <Link href="/" className="text-accent hover:underline">
          ← Map
        </Link>
      </div>
    );
  }

  const homeBuyerPercentile =
    homeBuyerRanks(data.places).get(place.slug) ?? null;

  // Greater-Melbourne benchmark distribution per indicator, computed once at
  // build from the full dataset (residential SA2s) and passed to the client —
  // no extra fetched data file.
  const benchmarks = gmBenchmarks(data.places);
  const timeseries = await loadTimeseries();
  const series = resolvePlaceSeries(place, timeseries);
  // Closest peer areas by per-domain percentile similarity — equal-weighted and
  // deterministic, so each area's peers are stable across the static export.
  const similar = toSimilarItems(findSimilarAreas(place, data.places, { limit: 6 }));

  return (
    <PlaceProfileClient
      place={place}
      homeBuyerPercentile={homeBuyerPercentile}
      benchmarks={benchmarks}
      series={series}
      similar={similar}
    />
  );
}
