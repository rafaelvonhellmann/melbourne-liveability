"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { fetchParcelShapeAt, type ParcelInfo, type ParcelShape } from "@/lib/parcel";
import { fetchPlanningAt, type PlanningAt } from "@/lib/planning-at";
import { ParcelConfirmCard } from "@/components/buyer/ParcelConfirmCard";
import { MAJOR_PROJECTS } from "@/lib/major-projects";
import { parseMapUrlState, buildMapUrl } from "@/lib/share-url";
import { withBase } from "@/lib/asset-path";
import { loadPoisNear, loadReportTilesNear } from "@/lib/report-tiles";
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

// POIs / noise / traffic / bus stops come from the baked z14 report tiles
// around the pin (3x3 block + the supermarket widening, see lib/report-tiles)
// instead of their multi-MB whole-of-Melbourne files - same decode shapes the
// map page's report build uses, so both paths feed buildBuyerReport the same
// inputs. The tile loaders never throw (missing tiles resolve empty).
async function loadReportInputs(pin: LngLat): Promise<ReportInputs> {
  const [
    places,
    sa2Geo,
    pois,
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
    loadPoisNear(pin[0], pin[1]).catch(() => [] as Feature<Point>[]),
    loadReportTilesNear(pin[0], pin[1], "noise").catch(() => [] as NoiseLine[]),
    loadNuisancePoints().catch(() => [] as NuisancePoint[]),
    fetchJson<Station[]>("/data/train-stations.json").catch(() => [] as Station[]),
    fetchJson<FutureStationLite[]>("/data/future-transport.json").catch(
      () => [] as FutureStationLite[]
    ),
    fetchJson<SchoolZonesData>("/data/school-zones.json").catch(() => null),
    loadReportTilesNear(pin[0], pin[1], "traffic").catch(() => [] as TrafficSegment[]),
    fetchJson<{ sites?: EpaAirSite[] }>("/data/epa-air-sites.json").catch(
      () => ({}) as { sites?: EpaAirSite[] }
    ),
    fetchJson<{ features?: ActivityCentreFeature[] }>("/data/activity-centres.json").catch(
      () => ({}) as { features?: ActivityCentreFeature[] }
    ),
    loadReportTilesNear(pin[0], pin[1], "bus").catch(() => [] as BusStop[]),
  ]);
  return {
    places,
    sa2Geo,
    pois,
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
  // The Vicmap parcel shape under the pin - fetched ONCE per pin below and
  // shared between the report build (ParcelInfo) and the ParcelConfirmCard
  // outline. undefined = not resolved yet; null = the lookup failed.
  const [parcelShape, setParcelShape] = useState<ParcelShape | null | undefined>(undefined);
  // "Yes, this is the property" (ParcelConfirmCard) - a ref so the async patch
  // below re-threads it into rebuilt reports without re-running the effect.
  const confirmedParcelRef = useRef<{ areaM2: number; confirmedAt: string } | null>(null);

  useEffect(() => {
    if (!pin) return;
    let cancelled = false;
    // A moved pin must not leave the previous pin's findings (or parcel shape)
    // on screen under the new header while the rebuild is in flight.
    setReport(null);
    setParcelShape(undefined);
    confirmedParcelRef.current = null; // a new pin needs a fresh confirmation
    // Parcel-level planning (zone + overlays at the pin) is a slow external gov
    // endpoint - start it now, in parallel with the lens loads; patched in below.
    const planningPromise = fetchPlanningAt(pin[0], pin[1]).catch(() => null);
    void (async () => {
      const inputs = await loadReportInputs(pin);
      if (cancelled) return;
      const sa2 = inputs.sa2Geo ? findSa2ForPoint(pin, inputs.sa2Geo) : null;
      const pl = sa2
        ? inputs.places.find((p) => p.slug === sa2.slug || p.sa2Code === sa2.sa2Code) ?? null
        : null;
      const profile = loadBuyerProfile();
      const buildArgs = (
        parcel: ParcelInfo | null,
        planning: PlanningAt | null
      ): BuildBuyerReportInput => ({
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
        planning,
        confirmedParcel: confirmedParcelRef.current ?? undefined,
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
      setReport(buildBuyerReport(buildArgs(null, null)));
      track("buyer_full_report", { coverage: pl ? "in" : "off" });
      // Lot size + parcel-level planning are the slow external inputs
      // (government endpoints) - render the report immediately, then patch
      // them in when/if they arrive.
      // One WFS fetch per pin: the shape feeds the ParcelConfirmCard outline
      // AND (as its ParcelInfo superset) the report's lot-size patch.
      const [parcel, planning] = await Promise.all([
        fetchParcelShapeAt(pin[0], pin[1]).catch(() => null),
        planningPromise,
      ]);
      if (cancelled) return;
      setParcelShape(parcel); // null = lookup failed -> explicit card state
      if (parcel || planning) {
        setReport(buildBuyerReport(buildArgs(parcel, planning)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pin, nameParam]);

  const onConfirmParcel = (c: { areaM2: number; confirmedAt: string }) => {
    confirmedParcelRef.current = c;
    setReport((prev) =>
      prev ? { ...prev, location: { ...prev.location, confirmedParcel: c } } : prev
    );
  };

  if (!pin) {
    return (
      <div className="flex min-h-screen flex-col bg-bg text-ink">
        <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
          <h1 className="font-display text-2xl font-semibold text-ink">Full buyer report</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            This page needs a pin. Drop one on the map (or search a full address) and choose
            &ldquo;Full report for this pin&rdquo;.
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
        <div className="mt-6 space-y-4">
          {/* Wrong-lot trust guard: confirm the parcel under the pin is the
              property being checked. Hidden while the lookup is unresolved; an
              explicit "could not identify the lot" state when it fails. The
              shape comes from this page's single per-pin parcel fetch; the key
              drops any previous pin's confirmed tick instantly. */}
          {parcelShape !== undefined && (
            <ParcelConfirmCard
              key={`${pin[0]},${pin[1]}`}
              pin={pin}
              shape={parcelShape}
              confirmed={report?.location.confirmedParcel ?? null}
              onConfirm={onConfirmParcel}
              adjustHint="Is this the property? If not, go back to the map and move the pin."
            />
          )}
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
