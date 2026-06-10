"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Feature, FeatureCollection, Point } from "geojson";
import { BuyerReportPanel } from "@/components/buyer/BuyerReportPanel";
import { SiteFooter } from "@/components/SiteFooter";
import {
  buildBuyerReport,
  type BuildBuyerReportInput,
  type BuyerReport,
  type FutureStationLite,
} from "@/lib/buyer-report";
import { findSa2ForPoint, type LngLat } from "@/lib/buyer-location";
import { loadPlaces } from "@/lib/places-data";
import { loadBuyerProfile } from "@/lib/user-prefs";
import { fetchParcelAreaAt, type ParcelInfo } from "@/lib/parcel";
import { MAJOR_PROJECTS } from "@/lib/major-projects";
import { parseMapUrlState, buildMapUrl } from "@/lib/share-url";
import { withBase } from "@/lib/asset-path";
import { track } from "@/lib/analytics";
import type { NoiseLine } from "@/lib/noise";
import type { NuisancePoint } from "@/lib/nuisance";
import type { SchoolZonesData } from "@/lib/school-zones";
import type { TrafficSegment } from "@/lib/traffic";
import type { EpaAirSite } from "@/lib/epa-air";
import type { ActivityCentreFeature } from "@/lib/activity-centres";
import type { Station, BusStop } from "@/lib/transit";
import type { Place } from "@/lib/types";

/**
 * Client half of /buyer/report - reads ?lat&lng (+ optional &name) and builds
 * the SAME deterministic report the map page builds (buildBuyerReport over the
 * same baked datasets), rendered in the FULL variant. Every loader degrades to
 * an empty input on failure (the engine surfaces gaps honestly) - matching the
 * map page's behaviour rather than hard-failing the whole report.
 */

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(withBase(path));
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function loadNoiseLines(): Promise<NoiseLine[]> {
  const g = await fetchJson<Record<NoiseLine["kind"], [number, number][][]>>(
    "/data/noise-lines.json"
  );
  const lines: NoiseLine[] = [];
  (["rail", "tram", "freeway"] as const).forEach((k) =>
    (g[k] ?? []).forEach((coords) => lines.push({ kind: k, coords }))
  );
  return lines;
}

async function loadNuisancePoints(): Promise<NuisancePoint[]> {
  const g = await fetchJson<Record<NuisancePoint["kind"], [number, number][]>>(
    "/data/nuisance-points.json"
  );
  const pts: NuisancePoint[] = [];
  (["industrial", "waste", "sewage", "quarry"] as const).forEach((k) =>
    (g[k] ?? []).forEach((coord) => pts.push({ kind: k, coord }))
  );
  return pts;
}

type ReportInputs = {
  places: Place[];
  sa2Geo: FeatureCollection | null;
  pois: Feature<Point>[];
  noiseLines: NoiseLine[];
  nuisancePoints: NuisancePoint[];
  stations: Station[];
  futureStations: FutureStationLite[];
  schoolZones: SchoolZonesData | null;
  traffic: TrafficSegment[];
  epaAir: EpaAirSite[];
  activityCentres: ActivityCentreFeature[];
  busStops: BusStop[];
};

async function loadReportInputs(): Promise<ReportInputs> {
  const [
    places,
    sa2Geo,
    poisFc,
    noiseLines,
    nuisancePoints,
    stations,
    futureStations,
    schoolZones,
    traffic,
    epaAir,
    activityCentresFc,
    busStops,
  ] = await Promise.all([
    loadPlaces().catch(() => [] as Place[]),
    fetchJson<FeatureCollection>("/data/places.geojson").catch(() => null),
    fetchJson<{ features?: Feature<Point>[] }>("/data/pois.geojson").catch(
      () => ({}) as { features?: Feature<Point>[] }
    ),
    loadNoiseLines().catch(() => [] as NoiseLine[]),
    loadNuisancePoints().catch(() => [] as NuisancePoint[]),
    fetchJson<Station[]>("/data/train-stations.json").catch(() => [] as Station[]),
    fetchJson<FutureStationLite[]>("/data/future-transport.json").catch(
      () => [] as FutureStationLite[]
    ),
    fetchJson<SchoolZonesData>("/data/school-zones.json").catch(() => null),
    fetchJson<TrafficSegment[]>("/data/traffic-aadt.json").catch(
      () => [] as TrafficSegment[]
    ),
    fetchJson<{ sites?: EpaAirSite[] }>("/data/epa-air-sites.json").catch(
      () => ({}) as { sites?: EpaAirSite[] }
    ),
    fetchJson<{ features?: ActivityCentreFeature[] }>("/data/activity-centres.json").catch(
      () => ({}) as { features?: ActivityCentreFeature[] }
    ),
    fetchJson<BusStop[]>("/data/bus-stops.json").catch(() => [] as BusStop[]),
  ]);
  return {
    places,
    sa2Geo,
    pois: poisFc.features ?? [],
    noiseLines,
    nuisancePoints,
    stations,
    futureStations,
    schoolZones,
    traffic,
    epaAir: epaAir.sites ?? [],
    activityCentres: activityCentresFc.features ?? [],
    busStops,
  };
}

/** Optional &name= display label - free text from the URL, kept short + trimmed. */
function parseNameParam(raw: string | null): string | undefined {
  const name = raw?.trim().slice(0, 80);
  return name || undefined;
}

export function PinReportClient() {
  const searchParams = useSearchParams();
  // Same parser (and Greater-Melbourne bounding box) the shared map URL uses -
  // a crafted ?lat&lng cannot place a report in the ocean or interstate.
  const pin = useMemo<LngLat | null>(
    () => parseMapUrlState(searchParams.toString()).pin,
    [searchParams]
  );
  const nameParam = parseNameParam(searchParams.get("name"));

  const [report, setReport] = useState<BuyerReport | null>(null);
  const [place, setPlace] = useState<Place | null>(null);

  useEffect(() => {
    if (!pin) return;
    let cancelled = false;
    void (async () => {
      const inputs = await loadReportInputs();
      if (cancelled) return;
      const sa2 = inputs.sa2Geo ? findSa2ForPoint(pin, inputs.sa2Geo) : null;
      const pl = sa2
        ? inputs.places.find((p) => p.slug === sa2.slug || p.sa2Code === sa2.sa2Code) ?? null
        : null;
      const profile = loadBuyerProfile();
      const buildArgs = (parcel: ParcelInfo | null): BuildBuyerReportInput => ({
        mode: "pin",
        lat: pin[1],
        lng: pin[0],
        place: pl,
        sa2Name: nameParam,
        pois: inputs.pois,
        noiseLines: inputs.noiseLines,
        nuisancePoints: inputs.nuisancePoints,
        stations: inputs.stations,
        futureStations: inputs.futureStations,
        schoolZones: inputs.schoolZones ?? undefined,
        traffic: inputs.traffic,
        epaAir: inputs.epaAir,
        activityCentres: inputs.activityCentres,
        parcel,
        busStops: inputs.busStops,
        nearbyAreas: inputs.places.map((p) => ({
          sa2Code: p.sa2Code,
          slug: p.slug,
          name: p.name,
          centroid: p.centroid,
        })),
        majorProjects: MAJOR_PROJECTS,
        profile,
      });
      setPlace(pl);
      setReport(buildBuyerReport(buildArgs(null)));
      track("buyer_full_report", { coverage: pl ? "in" : "off" });
      // Lot size is the one slow external input (government WFS) - render the
      // report immediately, then patch the parcel in when/if it arrives.
      const parcel = await fetchParcelAreaAt(pin[0], pin[1]).catch(() => null);
      if (!cancelled && parcel) setReport(buildBuyerReport(buildArgs(parcel)));
    })();
    return () => {
      cancelled = true;
    };
  }, [pin, nameParam]);

  if (!pin) {
    return (
      <div className="flex min-h-screen flex-col bg-bg text-ink">
        <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
          <h1 className="font-display text-2xl font-semibold text-ink">Full buyer report</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            This page needs a pin. Drop one on the map (or search a full address) and choose
            &ldquo;Open the full report&rdquo;.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/?buyer=1"
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-focus"
            >
              Check a location on the map &rarr;
            </Link>
            <Link
              href="/buyer/sample-report"
              className="rounded-md border border-surface-border px-4 py-2 text-sm text-ink transition-colors hover:border-accent hover:text-accent"
            >
              See a sample report
            </Link>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  const areaLabel = place?.name ?? nameParam;
  // Back to the map WITH this pin restored (same ?buyer=1&lat&lng the map shares).
  const backHref = buildMapUrl("/", { buyer: true, pin });
  // Root-relative share path - ShareViewButton adds origin + base path.
  const shareUrl = `/buyer/report?lat=${pin[1].toFixed(6)}&lng=${pin[0].toFixed(6)}${
    nameParam ? `&name=${encodeURIComponent(nameParam)}` : ""
  }`;

  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <Link href={backHref} className="no-print text-sm text-accent hover:underline">
          &larr; Back to the map (keeps this pin)
        </Link>
        <h1 className="mt-4 font-display text-2xl font-semibold text-ink">
          Full buyer report{areaLabel ? ` - ${areaLabel}` : ""}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Everything we can source for this exact pin: findings with dataset dates, what to
          verify, caveats and sources. Use Print / save as PDF to keep a dated copy.
        </p>
        <div className="mt-6">
          {!report ? (
            <p className="text-sm text-ink-muted">Computing the full report…</p>
          ) : (
            <BuyerReportPanel report={report} place={place} variant="full" shareUrl={shareUrl} />
          )}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
