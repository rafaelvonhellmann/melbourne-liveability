/**
 * Buyer "Location Check" due-diligence report - a deterministic, sourced
 * findings engine. Given a point (and the SA2 it falls in) it produces a
 * plain-English screening report: what looks positive, what to verify, what is
 * nearby, and what we cannot determine yet.
 *
 * Hard rules (see Buyer-Mode strategy + product spec):
 * - NO AI calls, NO network, NO randomness - pure + testable.
 * - NEVER invents data. Missing layers (price, school catchments, parcel-level
 *   overlays) are surfaced as `unavailable` / `verify` with confidence markers,
 *   never fabricated.
 * - NEVER property/financial/legal/insurance/planning advice. Every finding is
 *   an indicator with a geography + confidence + "what to verify" action.
 * - This layer is a context lens; it is NOT folded into the scored liveability
 *   composite.
 */
import type { Feature, Point, Polygon, MultiPolygon } from "geojson";
import type { Place } from "./types";
import { haversineKm, pointInPolygon, type LngLat } from "./buyer-location";
import { WALK_CATEGORY_IDS } from "./walk-access";
import { POI_CATEGORY_BY_ID, type PoiCategoryId } from "./poi-categories";
import {
  nearestNoiseSources,
  noiseFlags,
  noiseKindLabel,
  type NoiseLine,
} from "./noise";
import {
  nearestNuisances,
  nuisanceFlags,
  nuisanceKindLabel,
  type NuisancePoint,
} from "./nuisance";
import { evaluateFit, type BuyerProfile, type FitResult } from "./buyer-fit";
import { anchorDistances, type AnchorDistance } from "./anchors";
import { nearestStation, nearestBusStop, type Station, type BusStop } from "./transit";

/** Under-construction / proposed PT stop (OSM) - the "future transport" signal. */
export type FutureStationLite = {
  name: string;
  coord: [number, number];
  status: "construction" | "proposed";
  mode: "rail" | "tram";
};
import { computeWeightedScore } from "./scoring";
import { getDefaultWeights } from "./weights";
import { getSourcesByIds, sourceAsAt } from "./source-manifest";
import { sunAspect } from "./sun";
import { presentOverlays } from "./planning-overlays";
import { worstCoastalScenario } from "./coastal";
import { projectedGrowth } from "./vif";
import { resolveSchoolZones, type SchoolZonesData } from "./school-zones";
import { busiestRoadNear, type TrafficSegment } from "./traffic";
import { nearestAirSite, type EpaAirSite } from "./epa-air";
import { activityCentreAt, type ActivityCentreFeature } from "./activity-centres";
import type { ParcelInfo } from "./parcel";

// ---- Types (stable public contract) ---------------------------------------

export type BuyerConfidence = "high" | "medium" | "low" | "unknown";

export type BuyerFindingKind =
  | "red_flag"
  | "verify"
  | "positive"
  | "neutral"
  | "unavailable";

export type BuyerFindingSeverity = "high" | "medium" | "low" | "info";

export type BuyerGeography =
  | "pin"
  | "poi-radius"
  | "sa2"
  | "lga"
  | "gccsa"
  | "unknown";

export interface BuyerSourceRef {
  id: string;
  label: string;
  url?: string;
  fetchedAt?: string;
  period?: string;
  licence?: string;
}

export interface BuyerFinding {
  id: string;
  kind: BuyerFindingKind;
  severity: BuyerFindingSeverity;
  /**
   * On-screen grouping direction. "concern" marks a MEASURED downside (shown
   * under "What to weigh up"), distinct from a neutral "verify" check (a
   * due-diligence prompt with no positive/negative read yet). red_flag findings
   * are always treated as concerns. Never enters any score.
   */
  tone?: "concern";
  title: string;
  summary: string;
  whyItMatters?: string;
  verifyAction?: string;
  confidence: BuyerConfidence;
  geography: BuyerGeography;
  sourceRefs?: BuyerSourceRef[];
  caveat?: string;
}

export interface NearbyAmenity {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  sourceRefs?: BuyerSourceRef[];
}

export interface BuyerReport {
  id: string;
  generatedAt: string;
  mode: "pin" | "sa2";
  /**
   * How the "nearby on foot" reachability was measured: `"straight"` =
   * straight-line radius (free tier / default), `"precise"` = street-network
   * walk isochrone (paid-tier opt-in). Drives the caveat + labels in the UI.
   */
  accessMode: "straight" | "precise";
  location: {
    lat?: number;
    lng?: number;
    sa2Code?: string;
    sa2Name?: string;
    lgaName?: string;
  };
  summary: {
    headline: string;
    subheadline: string;
    confidence: BuyerConfidence;
  };
  findings: BuyerFinding[];
  /** Top 1-3 most material verify/red_flag findings, ranked - the "check before you offer" TL;DR. */
  priorityChecks: BuyerFinding[];
  nearbyAmenities: NearbyAmenity[];
  /** Total count of POIs within the radius per category (display: "N within ~1.2 km"). */
  amenityCountsByCategory: Record<string, number>;
  sourceRefs: BuyerSourceRef[];
  disclaimers: string[];
  /** Personal "fit for your life" result when a profile was supplied; else absent. */
  fit?: FitResult;
  /**
   * Straight-line distance from the pin to each saved life-anchor (work/school/
   * family). Context only, never scored; present only when a pin + anchors exist.
   */
  anchorDistances?: AnchorDistance[];
}

// ---- Constants -------------------------------------------------------------

/** ~15 min on foot at 5 km/h (straight-line proxy). */
export const DEFAULT_RADIUS_METERS = 1200;

/**
 * A neighbouring SA2 whose centre-point is within this straight-line distance of
 * the pin counts as "close" for the adjacency nudge - the same ~15-minute-walk
 * threshold used for nearby amenities. Centre-point proximity, NOT a true
 * boundary test (the finding says so).
 */
export const ADJACENCY_THRESHOLD_KM = DEFAULT_RADIUS_METERS / 1000;

/**
 * A curated VIC Big Build project within this straight-line distance of the pin
 * is "nearby" for the what's-changing nudge. Generous on purpose - a new station
 * reshapes a wide catchment, not just its doorstep.
 */
export const MAJOR_PROJECT_THRESHOLD_KM = 1.5;

export const STRAIGHT_LINE_CAVEAT =
  "Nearby amenities are estimated using straight-line distance from the dropped pin. This is a quick screening tool, not a street-network routing calculation.";

export const STREET_NETWORK_CAVEAT =
  "Reachability here is a street-network walk isochrone (OpenRouteService) - what is actually within a ~15-minute walk along streets and paths, not a straight-line radius. The listed distance to each amenity is still straight-line.";

export const BUYER_DISCLAIMER =
  "This report is general information only. It is not financial, property, legal, insurance or planning advice. Data may be incomplete, outdated or geographically approximate. Before buying, verify relevant matters with your conveyancer, council, insurer, lender and qualified property professionals.";

const METHODOLOGY_REF: BuyerSourceRef = {
  id: "methodology",
  label: "liveable.melbourne liveability methodology",
  url: "/methodology",
};

const SCHOOL_ZONE_REF: BuyerSourceRef = {
  id: "vic-findmyschool",
  label: "Find My School - official Victorian school-zone lookup",
  url: "https://www.findmyschool.vic.gov.au/",
};

/**
 * Display grouping of raw POI `pinType`s into buyer-facing amenity groups.
 * Order = display priority (groceries first); within a group the category order
 * is the in-group priority (e.g. hospitals before GPs in Health).
 */
export const AMENITY_GROUPS: { id: string; label: string; categories: PoiCategoryId[] }[] = [
  { id: "groceries", label: "Groceries & supermarkets", categories: ["supermarket"] },
  { id: "services", label: "Everyday services", categories: ["post_office", "bank", "ev_charging"] },
  // NDIS providers dropped from the report: the OSM data is near-empty (3 mapped
  // across Greater Melbourne, see scripts/build-data-audit.ts), so showing it
  // would imply coverage we don't have. The pin category still exists for the map.
  { id: "health", label: "Health", categories: ["hospital", "gp", "pharmacy", "pathology_lab"] },
  { id: "education", label: "Education", categories: ["childcare", "school", "tafe", "university"] },
  { id: "recreation", label: "Parks & recreation", categories: ["park", "gym_leisure"] },
  { id: "food", label: "Cafes & dining", categories: ["cafe_restaurant"] },
  // Community signal = amenities (faith-neutral places of worship + civic
  // community/cultural centres), NOT demographics. See DIGNITY-STANDARD.md.
  {
    id: "community",
    label: "Community & culture",
    categories: ["community_centre", "place_of_worship"],
  },
  { id: "safety", label: "Safety", categories: ["police"] },
];

// ---- Geometry / POI helpers ------------------------------------------------

/**
 * Find the SA2 feature containing a point. Returns the matching GeoJSON feature
 * or `null` when the point is outside all polygons (e.g. ocean / outside GM).
 */
export function findContainingSa2<T extends Feature>(
  point: { lat: number; lng: number },
  sa2Features: T[]
): T | null {
  if (!Array.isArray(sa2Features)) return null;
  const pt: LngLat = [point.lng, point.lat];
  for (const f of sa2Features) {
    const g = f?.geometry;
    if (!g) continue;
    if (g.type !== "Polygon" && g.type !== "MultiPolygon") continue;
    if (pointInPolygon(pt, g)) return f;
  }
  return null;
}

type RawPoi = Feature<Point> & {
  properties?: {
    pinType?: string;
    name?: string;
    osmUrl?: string;
    url?: string;
    id?: string;
  } | null;
};

/**
 * POIs near a point, sorted nearest-first. Reachability is decided one of two
 * ways:
 *  - default (free tier): straight-line (haversine) distance within
 *    `radiusMeters` - same honesty caveat as the 15-min-access layer.
 *  - when an `isochrone` polygon is supplied (paid-tier precise walk routing):
 *    the POI is kept iff it falls inside that street-network walk isochrone
 *    (see lib/walk-isochrone). The displayed `distanceMeters` stays straight-line.
 * `limitPerCategory` caps how many of each category are returned (for display);
 * omit it to return every reachable POI. Pure: the polygon is plain data, so
 * this stays network-free and deterministic.
 */
export function getNearbyAmenities(
  point: { lat: number; lng: number },
  pois: Feature<Point>[],
  options?: {
    radiusMeters?: number;
    limitPerCategory?: number;
    isochrone?: Polygon | MultiPolygon;
  }
): NearbyAmenity[] {
  if (!Array.isArray(pois) || pois.length === 0) return [];
  const radiusKm = (options?.radiusMeters ?? DEFAULT_RADIUS_METERS) / 1000;
  const isochrone = options?.isochrone;
  const pin: LngLat = [point.lng, point.lat];
  // Per-category provenance: police + childcare now come from authoritative
  // Vicmap (not OSM), hospitals from Vicmap + OSM, everything else from OSM.
  const osmRef = getSourcesByIds(["osm-amenities"]);
  const policeRef = getSourcesByIds(["vicmap-police"]);
  const childcareRef = getSourcesByIds(["vicmap-foi"]);
  const hospitalRef = getSourcesByIds(["vic-mapshare-hospitals", "osm-health"]);
  const refsForCategory = (cat: string) =>
    cat === "police"
      ? policeRef
      : cat === "childcare"
        ? childcareRef
        : cat === "hospital"
          ? hospitalRef
          : osmRef;

  const within: NearbyAmenity[] = [];
  for (let i = 0; i < pois.length; i++) {
    const f = pois[i] as RawPoi;
    const coords = f.geometry?.coordinates as LngLat | undefined;
    if (!coords || coords.length < 2) continue;
    const km = haversineKm(pin, coords);
    if (isochrone) {
      if (!pointInPolygon(coords, isochrone)) continue;
    } else if (km > radiusKm) {
      continue;
    }
    const props = f.properties ?? {};
    const category = String(props.pinType ?? "").trim();
    if (!category) continue;
    const label = POI_CATEGORY_BY_ID[category as PoiCategoryId]?.label ?? category;
    within.push({
      id: String(props.id ?? props.osmUrl ?? `${category}-${i}`),
      name: typeof props.name === "string" && props.name.trim() ? props.name.trim() : label,
      category,
      lat: coords[1],
      lng: coords[0],
      distanceMeters: Math.round(km * 1000),
      sourceRefs: refsForCategory(category),
    });
  }

  within.sort((a, b) => a.distanceMeters - b.distanceMeters);

  const limit = options?.limitPerCategory;
  if (limit == null || limit <= 0) return within;

  const perCat = new Map<string, number>();
  const limited: NearbyAmenity[] = [];
  for (const a of within) {
    const n = perCat.get(a.category) ?? 0;
    if (n >= limit) continue;
    perCat.set(a.category, n + 1);
    limited.push(a);
  }
  return limited;
}

/** Distance under which two park pins are treated as the same park. */
export const PARK_MERGE_METERS = 200;

function isGenericParkName(name: string): boolean {
  const n = name.trim().toLowerCase();
  // Unnamed OSM open space is labelled with the category fallback ("park").
  return n === "" || n === "park";
}

/**
 * Collapse OSM park "splits". A single park is frequently mapped as many separate
 * nodes/segments (or as several unnamed `park` points), which would otherwise read
 * as a dozen nearby parks. Two park pins are merged when they sit within
 * {@link PARK_MERGE_METERS} of each other AND share a name (or at least one is the
 * generic unnamed `park`). Different *named* parks that happen to be close (e.g.
 * "Royal Park" vs "Princes Park") are kept separate; same names far apart (a "Rose
 * Garden" in two suburbs) are also kept. Input must be nearest-first; the nearest
 * pin of each cluster is the one kept. Non-park amenities pass through untouched
 * and overall order is preserved. Pure.
 */
export function dedupeParkAmenities(
  amenities: NearbyAmenity[],
  mergeMeters: number = PARK_MERGE_METERS
): NearbyAmenity[] {
  const out: NearbyAmenity[] = [];
  const keptParks: NearbyAmenity[] = [];
  for (const a of amenities) {
    if (a.category !== "park") {
      out.push(a);
      continue;
    }
    const aName = a.name.trim().toLowerCase();
    const aGeneric = isGenericParkName(a.name);
    const isDup = keptParks.some((k) => {
      const meters = haversineKm([a.lng, a.lat], [k.lng, k.lat]) * 1000;
      if (meters > mergeMeters) return false;
      return aGeneric || isGenericParkName(k.name) || aName === k.name.trim().toLowerCase();
    });
    if (isDup) continue;
    out.push(a);
    keptParks.push(a);
  }
  return out;
}

// ---- Finding-rule helpers --------------------------------------------------

function rawOf(place: Place | null | undefined, domain: keyof Place["domains"], sub: string): number | null {
  const v = place?.domains?.[domain]?.subIndicators?.[sub]?.raw;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function pctOf(place: Place | null | undefined, domain: keyof Place["domains"]): number | null {
  const v = place?.domains?.[domain]?.percentile;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * First known dataset vintage among `refs` as an inline " as at <date>" phrase
 * (leading space so it splices into a sentence), or "" when no date is recorded.
 * Used by NEGATIVE findings ("no X overlay here") - an undated "all clear" is
 * the s18 exposure this defuses.
 */
function asAtPhrase(refs: BuyerSourceRef[]): string {
  for (const r of refs) {
    const d = sourceAsAt(r);
    if (d) return ` as at ${d}`;
  }
  return "";
}

function safeOverallScore(place: Place | null | undefined, override?: number | null): number | null {
  if (override != null && Number.isFinite(override)) return override;
  // Non-residential SA2s (airports, racecourse, parkland, industrial) carry no
  // scored domains, so computeWeightedScore returns 0 - that is "unscored", NOT
  // a real 0/100. Return null so callers never frame these as a poor place to
  // live (and skip the liveability finding entirely).
  if (!place || place.nonResidential) return null;
  try {
    const s = computeWeightedScore(place, getDefaultWeights()).total;
    return Number.isFinite(s) ? s : null;
  } catch {
    return null;
  }
}

// ---- The engine ------------------------------------------------------------

export interface BuildBuyerReportInput {
  mode?: "pin" | "sa2";
  lat?: number;
  lng?: number;
  /** SA2 record carrying scores + context (from places.json). */
  place?: Place | null;
  sa2Name?: string;
  lgaName?: string;
  /** Raw POI features for the nearby computation. */
  pois?: Feature<Point>[];
  radiusMeters?: number;
  /**
   * Paid-tier opt-in: a street-network walk isochrone polygon (from
   * lib/walk-isochrone). When supplied, "nearby" is computed by containment in
   * this polygon instead of a straight-line radius, and `accessMode` becomes
   * "precise". Stays pure - the fetch happens in the client, the polygon is data.
   */
  isochrone?: Polygon | MultiPolygon;
  /** Inject for deterministic output (SSR/build/tests); defaults to now. */
  generatedAt?: string;
  /** Optional precomputed overall liveability score; else derived from `place`. */
  overallScore?: number | null;
  /**
   * Other SA2 areas (centre-point + name + slug) used for the adjacency nudge:
   * when the pin is within {@link ADJACENCY_THRESHOLD_KM} of a neighbouring
   * area's centroid, the report recommends also checking that area. The caller
   * passes the full area list; the engine filters by distance and drops the
   * containing SA2. Optional - omit to skip the adjacency finding (e.g. SA2-mode
   * cards or the sample report).
   */
  nearbyAreas?: { sa2Code: string; slug: string; name: string; centroid: [number, number] }[];
  /**
   * Curated flagship VIC Big Build transport projects (see lib/major-projects).
   * When the pin is within {@link MAJOR_PROJECT_THRESHOLD_KM} of one, the report
   * flags it as "what's changing nearby". Optional - omit to skip the finding.
   */
  majorProjects?: {
    name: string;
    label: string;
    status: string;
    lat: number;
    lng: number;
    sourceUrl: string;
  }[];
  /**
   * Transport-noise source polylines (rail / tram / freeway) for the proximity
   * proxy finding. Lazy-loaded client-side; omit to skip. See lib/noise.
   */
  noiseLines?: NoiseLine[];
  /**
   * Disamenity / nuisance source points (industrial / waste / sewage / quarry)
   * for the proximity proxy finding. Lazy-loaded client-side; omit to skip.
   */
  nuisancePoints?: NuisancePoint[];
  /** Train stations for the "nearest train station" finding. Lazy-loaded; omit to skip. */
  stations?: Station[];
  /** Under-construction / proposed stations (OSM) for the "future transport" finding. */
  futureStations?: FutureStationLite[];
  /** GTFS bus stops [lng,lat,routeCount] for the "bus access" finding. Lazy-loaded; pin mode. */
  busStops?: BusStop[];
  /**
   * DTP traffic-volume (AADT) road segments for the "busy road nearby" proximity
   * finding. Lazy-loaded client-side; resolved only in pin mode. See lib/traffic.
   */
  traffic?: TrafficSegment[];
  /** EPA air-monitoring sites for the "air quality monitored nearby" finding. Lazy-loaded; pin mode. */
  epaAir?: EpaAirSite[];
  /** Activity Centre Zone polygons for the "in a designated activity centre" finding. Lazy-loaded; pin mode. */
  activityCentres?: ActivityCentreFeature[];
  /** Parcel info at the pin (runtime Vicmap WFS lookup, client-side) for the lot-size finding. */
  parcel?: ParcelInfo | null;
  /**
   * Government school zones (primary + secondary Year 7) for the address-level
   * zone match. Lazy-loaded client-side; resolved only in pin mode (never from
   * an SA2 centroid). Omit to fall back to the "confirm at the exact address"
   * note. See lib/school-zones.
   */
  schoolZones?: SchoolZonesData;
  /**
   * The user's personal "fit" profile (buyer or agent). When provided, the report
   * gains a `fit` block: deal-breakers to verify + plain-language fit notes,
   * evaluated against this place. Never changes the score. See lib/buyer-fit.
   */
  profile?: BuyerProfile | null;
}

export function buildBuyerReport(input: BuildBuyerReportInput): BuyerReport {
  const place = input.place ?? null;
  const hasPoint =
    typeof input.lat === "number" &&
    typeof input.lng === "number" &&
    Number.isFinite(input.lat) &&
    Number.isFinite(input.lng);
  const mode: "pin" | "sa2" = input.mode ?? (hasPoint ? "pin" : "sa2");

  // Resolve the point used for nearby maths: the pin, else the SA2 centroid.
  let point: { lat: number; lng: number } | null = hasPoint
    ? { lat: input.lat as number, lng: input.lng as number }
    : null;
  if (!point && place?.centroid && place.centroid.length === 2) {
    point = { lat: place.centroid[1], lng: place.centroid[0] };
  }

  const radiusMeters = input.radiusMeters ?? DEFAULT_RADIUS_METERS;
  const isochrone = input.isochrone;
  const accessMode: "straight" | "precise" = isochrone ? "precise" : "straight";
  const amenityCaveat = accessMode === "precise" ? STREET_NETWORK_CAVEAT : STRAIGHT_LINE_CAVEAT;
  const walkPhrase =
    accessMode === "precise"
      ? "within a ~15-minute street-network walk"
      : "within roughly a 15-minute walk";

  // Nearby amenities (display: top 8 per category) + full reachable counts. When
  // an isochrone is supplied, "reachable" means inside that walk polygon; else a
  // straight-line radius. OSM splits a single park into many nodes/segments, so
  // we collapse same-park pins (dedupeParkAmenities) before counting OR listing —
  // otherwise one park reads as a dozen. Counts + list derive from one deduped,
  // nearest-first pass.
  const allNearby = dedupeParkAmenities(
    point && input.pois
      ? getNearbyAmenities(point, input.pois, { radiusMeters, isochrone })
      : []
  );
  const amenityCountsByCategory: Record<string, number> = {};
  for (const a of allNearby) {
    amenityCountsByCategory[a.category] = (amenityCountsByCategory[a.category] ?? 0) + 1;
  }
  const perCatShown = new Map<string, number>();
  const nearbyAmenities: NearbyAmenity[] = [];
  for (const a of allNearby) {
    const n = perCatShown.get(a.category) ?? 0;
    if (n >= 8) continue;
    perCatShown.set(a.category, n + 1);
    nearbyAmenities.push(a);
  }

  const findings: BuyerFinding[] = [];
  const reachableEveryday = WALK_CATEGORY_IDS.filter(
    (id) => (amenityCountsByCategory[id] ?? 0) > 0
  ).length;
  const haveNearbyData = point != null && (input.pois?.length ?? 0) > 0;

  // 1) Everyday-amenity access (point-level, OSM).
  if (haveNearbyData) {
    if (reachableEveryday >= 5) {
      findings.push({
        id: "amenity-access-good",
        kind: "positive",
        severity: "info",
        title: "Good access to daily amenities",
        summary: `${reachableEveryday} of ${WALK_CATEGORY_IDS.length} everyday-amenity types were found ${walkPhrase} of this point.`,
        whyItMatters: "Day-to-day convenience reduces car dependence and time spent driving for errands.",
        confidence: "medium",
        geography: "poi-radius",
        caveat: amenityCaveat,
        sourceRefs: getSourcesByIds(["osm-amenities", "osm-schools", "osm-health"]),
      });
    } else if (reachableEveryday <= 2) {
      findings.push({
        id: "amenity-access-low",
        kind: "verify",
        tone: "concern",
        severity: "medium",
        title: "Check day-to-day convenience",
        summary: `Few everyday amenities (${reachableEveryday} of ${WALK_CATEGORY_IDS.length} types) were found ${walkPhrase} in the available POI data.`,
        verifyAction:
          "Inspect the area and test the actual walk to shops, transport and services.",
        confidence: "medium",
        geography: "poi-radius",
        caveat: amenityCaveat,
        sourceRefs: getSourcesByIds(["osm-amenities"]),
      });
    }
    // "The Basin" fix: a supermarket just outside the walk circle (or unnamed in
    // OSM) shouldn't read as "none". If none is within the walk radius, surface
    // the nearest one as a short drive rather than implying there is no shop.
    if ((amenityCountsByCategory["supermarket"] ?? 0) === 0 && point && input.pois) {
      const nearestSupermarket = getNearbyAmenities(point, input.pois, {
        radiusMeters: 8000,
      }).find((a) => a.category === "supermarket");
      if (nearestSupermarket) {
        const km = Math.round((nearestSupermarket.distanceMeters / 1000) * 10) / 10;
        findings.push({
          id: "supermarket-nearest",
          kind: "neutral",
          severity: "info",
          title: km <= 3 ? "Nearest supermarket is a short drive" : "Supermarket is further out",
          summary: `No supermarket within ${walkPhrase}, but the nearest mapped one is about ${km} km away${km <= 3 ? " - a short drive" : ""}.`,
          confidence: "medium",
          geography: "poi-radius",
          caveat:
            "Straight-line distance to the nearest mapped supermarket (OpenStreetMap, ODbL). Small or unbranded stores may not be tagged, and road distance is longer than straight-line.",
          sourceRefs: getSourcesByIds(["osm-amenities"]),
        });
      }
    }
    if ((amenityCountsByCategory["park"] ?? 0) > 0) {
      findings.push({
        id: "parks-good",
        kind: "positive",
        severity: "info",
        title: "Good access to parks / open space",
        summary: `${amenityCountsByCategory["park"]} distinct park / open-space area(s) mapped ${walkPhrase}.`,
        confidence: "medium",
        geography: "poi-radius",
        caveat: `${amenityCaveat} Where OpenStreetMap splits one park into several points, nearby duplicates are merged so the count reflects distinct parks.`,
        sourceRefs: getSourcesByIds(["osm-amenities"]),
      });
    }
  }

  // Transport-noise proximity proxy (pin-level, OSM lines). Only FLAG when a
  // source is close - we never claim "quiet" (not all noise sources are mapped).
  if (point && input.noiseLines && input.noiseLines.length > 0) {
    const flags = noiseFlags(
      nearestNoiseSources([point.lng, point.lat], input.noiseLines)
    );
    if (flags.length > 0) {
      const list = flags
        .map((f) => `${noiseKindLabel(f.kind)} (~${f.distance} m away)`)
        .join(", ");
      findings.push({
        id: "transport-noise",
        kind: "verify",
        tone: "concern",
        severity: flags.some((f) => f.distance <= 50) ? "medium" : "low",
        title: "Possible traffic / rail noise",
        summary: `This point is close to a ${list}.`,
        whyItMatters:
          "Proximity to a freeway, railway or tram line often means road, train or tram noise - especially at peak hour and overnight.",
        verifyAction:
          "Visit at peak hour and after dark to judge the real noise; ask whether the property has double glazing.",
        confidence: "low",
        geography: "pin",
        caveat:
          "Straight-line distance to the nearest mapped rail line, tram line or freeway/major road (OpenStreetMap, ODbL) - a proximity proxy, NOT a measured noise level. Barriers, cuttings, traffic volume, aspect and time of day all matter and are not modelled.",
        sourceRefs: getSourcesByIds(["osm-noise-corridors"]),
      });
    }
  }

  // Nuisance / disamenity proximity proxy (pin-level, OSM): industrial estates,
  // waste/landfill, sewage works, quarries - odour/dust/traffic. Only FLAG close.
  if (point && input.nuisancePoints && input.nuisancePoints.length > 0) {
    const nflags = nuisanceFlags(
      nearestNuisances([point.lng, point.lat], input.nuisancePoints)
    );
    if (nflags.length > 0) {
      const list = nflags
        .map((f) => `${nuisanceKindLabel(f.kind)} (~${f.distance} m away)`)
        .join(", ");
      findings.push({
        id: "nuisance-proximity",
        kind: "verify",
        tone: "concern",
        severity: nflags.some((f) => f.distance <= 200) ? "medium" : "low",
        title: "Possible industrial / odour / pollution source nearby",
        summary: `This point is near a ${list}.`,
        whyItMatters:
          "Industrial areas, waste or sewage sites and quarries can bring odour, dust, heavy-vehicle traffic or noise at certain times or wind directions.",
        verifyAction:
          "Check the prevailing wind, visit at different times, and look up any EPA licence or known issues for the site.",
        confidence: "low",
        geography: "pin",
        caveat:
          "Straight-line distance to the representative point of the nearest mapped industrial area, waste/landfill, sewage works or quarry (OpenStreetMap, ODbL) - a proximity proxy, NOT a measured emission. Whether a site affects this property depends on wind, hours, screening and operations.",
        sourceRefs: getSourcesByIds(["osm-nuisance-points"]),
      });
    }
  }

  // Nearest train station (pin-level, OSM) - a commute-convenience signal.
  if (point && input.stations && input.stations.length > 0) {
    const st = nearestStation([point.lng, point.lat], input.stations);
    if (st) {
      const close = st.distanceM <= 1200;
      const dist =
        st.distanceM < 1000 ? `${st.distanceM} m` : `${(st.distanceM / 1000).toFixed(1)} km`;
      findings.push({
        id: "train-station",
        kind: close ? "positive" : "neutral",
        severity: "info",
        title: close ? "Train station within walking distance" : "Nearest train station",
        summary: `${st.name} station is about ${dist} away (straight line).`,
        whyItMatters:
          "A nearby train station often means a faster, more reliable commute than buses alone.",
        confidence: "medium",
        geography: "pin",
        caveat:
          "Straight-line distance to the nearest mapped train station (OpenStreetMap, ODbL). The walking route is longer, and the line, frequency and direction matter too.",
        sourceRefs: getSourcesByIds(["osm-train-stations"]),
      });
    }
  }

  // Future transport - a planned/under-construction station nearby (price-relevant).
  if (point && input.futureStations && input.futureStations.length > 0) {
    const fut = nearestStation([point.lng, point.lat], input.futureStations as Station[]);
    if (fut && fut.distanceM <= 2000) {
      const match = input.futureStations.find((f) => f.name === fut.name);
      const statusWord = match?.status === "construction" ? "under-construction" : "planned";
      const modeWord = match?.mode === "tram" ? "tram" : "train";
      const dist =
        fut.distanceM < 1000 ? `${fut.distanceM} m` : `${(fut.distanceM / 1000).toFixed(1)} km`;
      findings.push({
        id: "future-transport",
        kind: "neutral",
        severity: "info",
        title: "Future transport nearby",
        summary: `A ${statusWord} ${modeWord} station (${fut.name}) is mapped about ${dist} away.`,
        whyItMatters:
          "New transport is often priced into an area early - it can lift access and demand, but timelines and final stops can still change.",
        confidence: "low",
        geography: "pin",
        caveat:
          "Community-mapped under-construction / proposed stops (OpenStreetMap, ODbL) - indicative only, not a committed-project guarantee. Check the official project page for status and the final location.",
        sourceRefs: getSourcesByIds(["osm-future-transport"]),
      });
    }
  }

  // 1b) Adjacency nudge. If the pin sits within ~15 min on foot of a NEIGHBOURING
  //     SA2's centre-point, a boundary is probably close - recommend also checking
  //     those areas, since their amenities, scores and recorded-offence figures may
  //     describe this spot just as well as the containing SA2 does.
  if (point && input.nearbyAreas?.length) {
    const here = place?.sa2Code;
    const pin: LngLat = [point.lng, point.lat];
    const adjacent = input.nearbyAreas
      .filter(
        (a) =>
          a.sa2Code !== here &&
          Array.isArray(a.centroid) &&
          a.centroid.length === 2
      )
      .map((a) => ({ name: a.name, km: haversineKm(pin, a.centroid) }))
      .filter((a) => a.km <= ADJACENCY_THRESHOLD_KM)
      .sort((a, b) => a.km - b.km)
      .slice(0, 3);
    if (adjacent.length > 0) {
      const names = adjacent.map((a) => a.name).join(", ");
      findings.push({
        id: "near-area-border",
        kind: "neutral",
        severity: "info",
        title: "Close to a neighbouring area",
        summary: `This point is within roughly a 15-minute walk of the centre of ${names}. If it sits near a boundary, those areas' amenities, scores and recorded-offence figures may apply here just as much as ${place?.name ?? "this area"}'s.`,
        whyItMatters:
          "Area-level data is reported per SA2; a property near the edge can be better described by the neighbour than by the area it technically falls in.",
        verifyAction: "Compare the adjacent area(s) before you decide.",
        confidence: "medium",
        geography: "sa2",
        caveat:
          "Closeness is measured to area centre-points (straight-line), not to the actual boundary - check the map for where the borders fall.",
        sourceRefs: [METHODOLOGY_REF],
      });
    }
  }

  // 1c) Major transport projects (curated VIC Big Build) within ~1.5 km of the
  //     pin - a factual "what's changing nearby" nudge, never a price prediction.
  if (point && input.majorProjects?.length) {
    const pin: LngLat = [point.lng, point.lat];
    const near = input.majorProjects
      .map((p) => ({ ...p, km: haversineKm(pin, [p.lng, p.lat]) }))
      .filter((p) => p.km <= MAJOR_PROJECT_THRESHOLD_KM)
      .sort((a, b) => a.km - b.km)
      .slice(0, 2);
    if (near.length > 0) {
      const p = near[0];
      const more = near
        .slice(1)
        .map((n) => `${n.name} (~${Math.round(n.km * 1000)} m)`)
        .join(", ");
      findings.push({
        id: "major-project-nearby",
        kind: "neutral",
        severity: "info",
        title: "Major transport project nearby",
        summary: `A new ${p.label} - ${p.name} station, ~${Math.round(p.km * 1000)} m away - is ${p.status}.${more ? ` Also nearby: ${more}.` : ""}`,
        whyItMatters:
          "Major transport infrastructure can reshape access and the area over the years it is built and opens.",
        verifyAction:
          "Check the official project page for timing, construction impacts and the final station siting.",
        confidence: "medium",
        geography: "poi-radius",
        caveat:
          "Station location is approximate (resolved from OpenStreetMap) and projects can shift - confirm on the project page. This flags what is planned or underway, not a prediction of prices.",
        sourceRefs: [
          { id: "vic-big-build", label: "Victoria's Big Build", url: p.sourceUrl },
        ],
      });
    }
  }

  // 1d) Sun & aspect - proprietary, deterministic solar geometry from the pin's
  //     latitude (no external shade service). Aspect can't be changed, so it's a
  //     real due-diligence factor.
  if (hasPoint) {
    const sun = sunAspect(input.lat as number);
    const sunny = sun.sunSide === "north" ? "North" : "South";
    findings.push({
      id: "sun-aspect",
      kind: "neutral",
      severity: "info",
      title: "Sun & aspect",
      summary: `The midday sun is to the ${sunny.toLowerCase()} here, so ${sunny.toLowerCase()}-facing living areas, windows and yards get the best, warmest light - which way the property faces is what decides it (see the sun diagram).`,
      whyItMatters:
        "Which way the main rooms face decides natural light and winter warmth - and it can't be changed.",
      verifyAction:
        "Visit at the time of day you'd use the main rooms and check which way they face.",
      confidence: "high",
      geography: "pin",
      caveat:
        "Based on the sun's path at this latitude (same for the whole street). Actual light depends on the dwelling's orientation, windows, trees and nearby buildings. Full sun-path detail is in the methodology.",
      sourceRefs: [METHODOLOGY_REF],
    });
  }

  // 2) Overall area liveability (SA2).
  const overall = safeOverallScore(place, input.overallScore);
  if (overall != null) {
    if (overall >= 65) {
      findings.push({
        id: "liveability-strong",
        kind: "positive",
        severity: "info",
        title: "Strong area-level liveability score",
        summary: `The surrounding area scores ${Math.round(overall)}/100 on the current liveability model.`,
        confidence: "medium",
        geography: "sa2",
        caveat: "This is an area-level score and may not reflect the exact street or property.",
        sourceRefs: [METHODOLOGY_REF],
      });
    } else if (overall <= 45) {
      findings.push({
        id: "liveability-review",
        kind: "verify",
        severity: "low",
        title: "Review area-level liveability trade-offs",
        summary: `The surrounding area scores ${Math.round(overall)}/100 and has some weaker indicators in the current model.`,
        verifyAction: "Review the domain breakdown rather than relying on the overall score.",
        confidence: "medium",
        geography: "sa2",
        sourceRefs: [METHODOLOGY_REF],
      });
    }
  }

  // 3) Transport (SA2 domain).
  const transportPct = pctOf(place, "transport");
  if (transportPct != null && transportPct >= 70) {
    findings.push({
      id: "transport-strong",
      kind: "positive",
      severity: "info",
      title: "Strong public transport proximity",
      summary: `Transport scores in the top tier for Greater Melbourne (${Math.round(transportPct)}th percentile) for this wider area.`,
      confidence: "medium",
      geography: "sa2",
      caveat: "Area-level; confirm the actual stops, lines and peak-hour commute for this address.",
      sourceRefs: getSourcesByIds(["ptv-gtfs"]),
    });
  } else if (transportPct != null && transportPct <= 30) {
    findings.push({
      id: "transport-check",
      kind: "verify",
      tone: "concern",
      severity: "low",
      title: "Inspect the commute at peak hour",
      summary: `Transport sits in the lower range for Greater Melbourne (${Math.round(transportPct)}th percentile) for this wider area.`,
      verifyAction: "Test the door-to-door commute at peak hour before relying on public transport.",
      confidence: "medium",
      geography: "sa2",
      sourceRefs: getSourcesByIds(["ptv-gtfs"]),
    });
  }

  // 4) Health access (SA2 domain).
  const healthPct = pctOf(place, "health");
  if (healthPct != null && healthPct >= 70) {
    findings.push({
      id: "health-strong",
      kind: "positive",
      severity: "info",
      title: "Good access to health services",
      summary: `Health access scores in the top tier for Greater Melbourne (${Math.round(healthPct)}th percentile) for this wider area.`,
      confidence: "medium",
      geography: "sa2",
      sourceRefs: getSourcesByIds(["vic-mapshare-hospitals", "osm-health"]),
    });
  }

  // 5) Hazard & planning overlays (SA2 share; parcel-level NOT matched).
  //    Established/inner SA2s typically have ~no bushfire/flood overlay - there we
  //    surface a calm "none mapped" note rather than a "verify" flag (a flood/fire
  //    warning in the CBD is noise). Material overlay share keeps the verify/red-flag.
  const bushfire = rawOf(place, "hazards", "bushfirePct");
  const flood = rawOf(place, "hazards", "floodPct");
  const hazardRefs = getSourcesByIds(["vic-planning-bpa", "vic-planning-flood"]);
  // Negative ("no overlay") statements must carry the dataset vintage inline -
  // an undated all-clear is the claim a buyer could rely on past its shelf life.
  const hazardAsAt = asAtPhrase(hazardRefs);
  const haveHazardData = bushfire != null || flood != null;
  const negligibleHazard = (bushfire ?? 0) < 1 && (flood ?? 0) < 1;
  const elevatedHazard = (bushfire != null && bushfire >= 50) || (flood != null && flood >= 10);
  const hazardBits: string[] = [];
  // Only mention an overlay it actually has - a "0%" bit (e.g. no bushfire but
  // some flood) reads as noise, so suppress any share that rounds to zero.
  if (bushfire != null && Math.round(bushfire) >= 1) hazardBits.push(`about ${Math.round(bushfire)}% mapped as bushfire-prone overlay`);
  if (flood != null && Math.round(flood) >= 1) hazardBits.push(`about ${Math.round(flood)}% under a flood planning overlay`);
  if (haveHazardData && negligibleHazard) {
    findings.push({
      id: "hazard-overlays",
      kind: "neutral",
      severity: "info",
      title: "Little bushfire or flood overlay here",
      summary: `No bushfire or flood overlay in the Vicmap Planning data${hazardAsAt} for almost all of this area. Overlays still apply parcel by parcel - confirm the exact property.`,
      confidence: "medium",
      geography: "sa2",
      caveat:
        "Absence of a mapped planning overlay is not a guarantee - flood or fire risk can exist without one.",
      sourceRefs: hazardRefs,
    });
  } else if (hazardBits.length) {
    findings.push({
      id: "hazard-overlays",
      kind: elevatedHazard ? "red_flag" : "verify",
      severity: elevatedHazard ? "high" : "medium",
      title: "Check bushfire / flood overlays",
      summary: `Of this area, ${hazardBits.join(" and ")}. Confirm whether this exact parcel is affected.`,
      whyItMatters: "Overlays drive building controls, insurance cost and what you can do with the land.",
      verifyAction:
        "Check the council planning certificate, VicPlan and an insurance quote before buying.",
      confidence: "medium",
      geography: "sa2",
      sourceRefs: hazardRefs,
    });
  } else {
    // No overlay data matched (e.g. off-coverage). A known gap, not a prominent
    // "verify" - keep it out of the before-you-offer priority list.
    findings.push({
      id: "hazard-overlays",
      kind: "unavailable",
      severity: "info",
      title: "Bushfire / flood overlays not matched here",
      summary: `No bushfire or flood overlay could be matched to this point in the Vicmap Planning data${hazardAsAt}.`,
      verifyAction: "Check the council planning certificate and VicPlan for the exact address.",
      confidence: "unknown",
      geography: "unknown",
      caveat: "Absence of a mapped overlay is not a guarantee - risk can exist without one.",
      sourceRefs: hazardRefs,
    });
  }

  // 5b) Heritage Overlay (context - a planning CONTROL, never scored). Only
  //     surfaced when there is material coverage; an AREA share, not parcel-level.
  const heritagePct = place?.context?.planning?.heritageOverlayPct ?? null;
  if (heritagePct != null && heritagePct >= 1) {
    const extensive = heritagePct >= 25;
    findings.push({
      id: "heritage-overlay",
      kind: "verify",
      severity: extensive ? "medium" : "info",
      title: extensive
        ? "Much of this area is under a Heritage Overlay"
        : "Part of this area is under a Heritage Overlay",
      summary: `About ${Math.round(heritagePct)}% of this area sits inside a Heritage Overlay. Whether THIS property is affected needs a check of its planning certificate.`,
      whyItMatters:
        "A Heritage Overlay can restrict demolition, external changes and subdivision - it shapes what you can do with the property.",
      verifyAction:
        "Check the property's planning certificate / VicPlan for a Heritage Overlay before you offer.",
      confidence: "medium",
      geography: "sa2",
      caveat:
        "Area share, not a parcel-level result - a property can be affected even where the area share is low, and vice versa.",
      sourceRefs: getSourcesByIds(["vic-planning-heritage"]),
    });
  }

  // 5c) Conservation & restriction overlays (context - planning CONTROLS, never
  //     scored). ESO/SLO/VPO/EMO control development + vegetation; EAO flags
  //     possible contamination; PAO can mean the land is reserved for compulsory
  //     public acquisition. SA2 area share only, never parcel-level - always a
  //     "verify", surfaced most-material-first (PAO/EAO are the ones not to miss).
  const overlayShares = place?.context?.planning?.overlays ?? null;
  const presentOverlayList = presentOverlays(overlayShares, 1);
  if (presentOverlayList.length > 0) {
    const hasHigh = presentOverlayList.some((o) => o.materiality === "high");
    const lead = presentOverlayList[0];
    const shareList = presentOverlayList
      .map((o) => `${o.name} (${o.code}) ~${Math.round(overlayShares?.[o.code] ?? 0)}%`)
      .join(", ");
    findings.push({
      id: "conservation-overlays",
      kind: "verify",
      severity: hasHigh ? "high" : "medium",
      title: hasHigh
        ? `Check the ${lead.name} (${lead.code}) on this property`
        : presentOverlayList.length === 1
          ? `${lead.name} (${lead.code}) controls development here`
          : "Planning overlays control development here",
      summary: `Part of this area is within ${
        presentOverlayList.length === 1
          ? "a planning overlay"
          : `${presentOverlayList.length} planning overlays`
      } (${shareList}). ${lead.buyerMeaning}`,
      whyItMatters:
        "Planning overlays control what you can build, remove or change - and a Public Acquisition Overlay can mean the land is reserved for a public work. They affect the cost, feasibility and even the ownership of your plans.",
      verifyAction:
        "Check the property's planning certificate (Section 32) and VicPlan for the exact overlays on THIS parcel before you offer.",
      confidence: "medium",
      geography: "sa2",
      caveat:
        "Area share for the wider SA2, not a parcel-level result - your specific property may or may not be affected.",
      sourceRefs: getSourcesByIds(["vic-planning-overlays"]),
    });
  }

  // 5d) Coastal inundation (sea-level rise) - context, never scored. SA2 area
  //     share under DEECA Future Coasts modelled inundation by projection year;
  //     a PROJECTION/scenario at ~1:75,000, never a parcel verdict.
  const coastalShares = place?.context?.coastalInundation?.scenarioShares ?? null;
  const worstCoastal = worstCoastalScenario(coastalShares, 1);
  if (worstCoastal) {
    findings.push({
      id: "coastal-inundation",
      kind: "verify",
      tone: "concern",
      severity: worstCoastal.pct >= 10 ? "high" : "medium",
      title: "Sea-level-rise inundation projected for part of this area",
      summary: `Under a sea-level-rise projection (about ${worstCoastal.slr} by ${worstCoastal.label}), roughly ${Math.round(worstCoastal.pct)}% of this area's land is modelled as subject to coastal inundation.`,
      whyItMatters:
        "Coastal-inundation risk shapes insurance, future planning controls and long-term value over the decades you would own the property.",
      verifyAction:
        "Check the property's elevation and the council / VicPlan coastal-hazard + flood overlays before you offer - this is area-level, not parcel-level.",
      confidence: "medium",
      geography: "sa2",
      caveat:
        "Modelled projection from DEECA Future Coasts at ~1:75,000 - an indicative area share for the wider SA2, NOT a parcel-level result, and a scenario rather than a forecast.",
      sourceRefs: getSourcesByIds(["vic-coastal-inundation"]),
    });
  }

  // 5e) Past-fire history (context, never scored). % of SA2 mapped as burnt in
  //     the Vicmap record - HISTORY, distinct from the forward-looking bushfire
  //     overlay; only surfaced at meaningful coverage. NOT parcel-level.
  const burntPct = place?.context?.fireHistory?.burntPct ?? null;
  if (burntPct != null && burntPct >= 10) {
    findings.push({
      id: "fire-history",
      kind: "verify",
      tone: "concern",
      severity: burntPct >= 40 ? "high" : "medium",
      title: "This area has a history of bushfire",
      summary: `About ${Math.round(burntPct)}% of this area's land is mapped as burnt by past fires in the Victorian record.`,
      whyItMatters:
        "Fire in the surrounding landscape signals bushfire exposure that affects safety, insurance and what you must build to.",
      verifyAction:
        "Check the bushfire planning overlay (Bushfire Management Overlay / Bushfire-Prone Area), the local fire-history record and an insurance quote; confirm the property's Bushfire Attack Level (BAL) rating.",
      confidence: "medium",
      geography: "sa2",
      caveat:
        "Mapped fire HISTORY (fires since ~1903; severity from 2006, private-land fires from 2009) - an area share, NOT a parcel result and NOT the forward-looking bushfire-prone overlay.",
      sourceRefs: getSourcesByIds(["vic-fire-history"]),
    });
  }

  // 5f) Growth / "what's coming" (context, never scored). Official Victoria in
  //     Future projections of dwellings + population to 2036 - the forward lens.
  //     A projection, not a forecast/target; neutral (growth can be good or bad
  //     depending on the buyer).
  const vifGrowth = projectedGrowth(place?.context?.projections);
  if (vifGrowth.dwellingGrowthPct != null || vifGrowth.populationGrowthPct != null) {
    const bits: string[] = [];
    if (vifGrowth.dwellingGrowthPct != null)
      bits.push(`dwellings ${vifGrowth.dwellingGrowthPct >= 0 ? "+" : ""}${vifGrowth.dwellingGrowthPct}%`);
    if (vifGrowth.populationGrowthPct != null)
      bits.push(`population ${vifGrowth.populationGrowthPct >= 0 ? "+" : ""}${vifGrowth.populationGrowthPct}%`);
    const fastGrowth = (vifGrowth.dwellingGrowthPct ?? 0) >= 20;
    findings.push({
      id: "growth-projection",
      kind: "neutral",
      severity: "info",
      title: fastGrowth ? "Strong growth projected for this area" : "Projected change to 2036",
      summary: `Official projections (Victoria in Future) to 2036: ${bits.join(", ")} vs 2021.`,
      whyItMatters:
        "Where dwellings are projected to grow fast, expect more development, density and streetscape change over the years you would own here.",
      verifyAction:
        "Check the council planning scheme and any activity-centre / housing-target plans for what can be built nearby.",
      confidence: "medium",
      geography: "sa2",
      caveat:
        "A modelled PROJECTION at SA2 level (Victoria in Future 2023), not a forecast or target; only 5-yearly years (2021/2026/2031/2036) are published.",
      sourceRefs: getSourcesByIds(["vif2023-sa2"]),
    });
  }

  // 5g) Development pipeline (context, never scored). ABS building approvals -
  //     dwelling units approved in the trailing 12 months, split houses vs
  //     higher-density, with a year-on-year trend. The "what's being built"
  //     signal: built-form + supply only, never an inference about residents.
  const pipe = place?.context?.developmentPipeline;
  if (pipe) {
    const { trailing12, prior12, housePct, period } = pipe;
    const mix =
      housePct == null
        ? ""
        : housePct >= 80
          ? "almost all detached houses"
          : housePct >= 55
            ? "mostly houses"
            : housePct <= 20
              ? "almost all townhouses or apartments"
              : housePct <= 45
                ? "mostly townhouses or apartments"
                : "a mix of houses and higher-density homes";
    let trend = "";
    if (prior12 != null && prior12 > 0) {
      const r = trailing12 / prior12;
      trend =
        r >= 1.25
          ? "up sharply on the year before"
          : r >= 1.1
            ? "up on the year before"
            : r <= 0.75
              ? "down sharply on the year before"
              : r <= 0.9
                ? "down on the year before"
                : "broadly steady year on year";
    }
    const active = trailing12 >= 300;
    const moderate = trailing12 >= 50;
    findings.push({
      id: "development-pipeline",
      kind: "neutral",
      severity: "info",
      title:
        trailing12 === 0
          ? "No new dwellings approved here recently"
          : active
            ? "Active development pipeline nearby"
            : moderate
              ? "Steady development pipeline nearby"
              : "A few new dwellings approved nearby",
      summary:
        trailing12 === 0
          ? `No new dwellings were approved across this area in the ${period} (ABS building approvals).`
          : `About ${trailing12.toLocaleString("en-AU")} new ${trailing12 === 1 ? "dwelling was" : "dwellings were"} approved across this area in the ${period}${mix ? ` - ${mix}` : ""}${trend ? `, ${trend}` : ""}.`,
      whyItMatters:
        "Approvals are a leading sign of construction: more building work, new supply and streetscape change ahead. They come before - and do not guarantee - completed homes.",
      verifyAction:
        "Check the council planning register and VicPlan for current applications and any major projects near the address.",
      confidence: "high",
      geography: "sa2",
      caveat:
        "ABS building approvals counted at SA2 (whole-area) level, not your street; an approval is a leading indicator, not a completed home, and the most recent month or two may be revised.",
      sourceRefs: getSourcesByIds(["abs-building-approvals"]),
    });
  }

  // 5h) Traffic exposure (context, never scored). Busiest mapped arterial /
  //     highway within ~250 m of the pin + its measured AADT. Pin-level
  //     proximity proxy; residential streets are not counted, latest year 2019.
  const road =
    point && mode === "pin" && input.traffic
      ? busiestRoadNear([point.lng, point.lat], input.traffic, 250)
      : null;
  if (road && road.aadt >= 5000) {
    const heavy = road.heavyPct >= 8;
    const concern = road.aadt >= 20000 && road.distanceMeters <= 150;
    findings.push({
      id: "traffic-volume",
      kind: concern ? "verify" : "neutral",
      ...(concern ? { tone: "concern" as const } : {}),
      severity: road.aadt >= 40000 ? "high" : road.aadt >= 15000 ? "medium" : "low",
      title:
        road.aadt >= 40000
          ? "Major traffic route close by"
          : road.aadt >= 15000
            ? "Busy road nearby"
            : "Moderate traffic nearby",
      summary: `${road.road || "A main road"} is about ${road.distanceMeters} m away and carried roughly ${road.aadt.toLocaleString("en-AU")} vehicles a day (2019)${heavy ? `, with a notable ${road.heavyPct}% heavy vehicles (a truck route)` : ""}.`,
      whyItMatters:
        "Busier roads bring more traffic noise, harder on-street parking and pedestrian-safety trade-offs - though they often also mean better bus access and shops.",
      verifyAction:
        "Visit at morning and evening peak and after dark to judge the noise and traffic, and check crossing safety if you have children.",
      confidence: "medium",
      geography: "pin",
      caveat:
        "Straight-line distance to the nearest MAPPED arterial / highway (DTP traffic counts, latest year 2019) - residential streets are not counted, and this is a proximity proxy, not modelled noise or a parcel result.",
      sourceRefs: getSourcesByIds(["dtp-aadt"]),
    });
  }

  // 5i) Water retailer (context, never scored). Which corporation services the
  //     area, from the Vicmap water-corporation boundaries (area-level).
  const water = place?.context?.waterRetailer;
  if (water?.name) {
    findings.push({
      id: "water-retailer",
      kind: "neutral",
      severity: "info",
      title: `Water retailer: ${water.name}`,
      summary: `${water.name} is the water corporation servicing this area - your water and sewerage bills come from them.`,
      verifyAction:
        "Confirm on a current water / rates notice for the exact property; a few boundary streets can differ.",
      confidence: "high",
      geography: "sa2",
      caveat:
        "Resolved from the Vicmap water-corporation boundary at the area level - confirm the exact address on your water bill.",
      sourceRefs: getSourcesByIds(["vic-water-corp"]),
    });
  }

  // 5j) Air quality (context, never scored). Nearest EPA monitor + its last
  //     CAPTURED band (dated - air is hourly and this site is static, so we
  //     always point to live AirWatch). Network is sparse, so caveat distance.
  const air =
    point && mode === "pin" && input.epaAir
      ? nearestAirSite([point.lng, point.lat], input.epaAir)
      : null;
  if (air && air.distanceMeters <= 15000) {
    const dist =
      air.distanceMeters < 1000
        ? `${air.distanceMeters} m`
        : `${(air.distanceMeters / 1000).toFixed(1)} km`;
    const when = /^\d{4}-\d{2}/.test(air.since ?? "")
      ? ` (reading ${air.since!.slice(0, 10)})`
      : "";
    findings.push({
      id: "air-quality",
      kind: "neutral",
      severity: "info",
      title: "Air quality monitored nearby",
      summary: air.band
        ? `The nearest EPA air monitor, ${air.name} (~${dist} away), last read ${air.param ?? "air quality"} "${air.band}"${when}.`
        : `The nearest EPA air monitor is ${air.name} (~${dist} away).`,
      whyItMatters:
        "Air quality affects health - it can spike near busy roads and during bushfire-smoke season.",
      verifyAction:
        "Air quality changes hour to hour - check live readings at EPA AirWatch (airquality.epa.vic.gov.au).",
      confidence: "medium",
      geography: "pin",
      caveat:
        "Nearest FIXED EPA monitor - the network is sparse so it may be several km away, and the band is the last hourly reading we captured, NOT live. Check AirWatch for current conditions.",
      sourceRefs: getSourcesByIds(["epa-air"]),
    });
  }

  // 5k) Activity-centre zoning (context, never scored). Is the pin inside an
  //     Activity Centre Zone - the statutory instrument steering higher-density
  //     development. Forward "where growth is directed" signal; built form only.
  const acz =
    point && mode === "pin" && input.activityCentres
      ? activityCentreAt([point.lng, point.lat], input.activityCentres)
      : null;
  if (acz) {
    const lga = acz.lga
      ? acz.lga.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
      : null;
    findings.push({
      id: "activity-centre",
      kind: "neutral",
      severity: "info",
      title: "Inside a designated activity centre",
      summary: `This location sits in an Activity Centre Zone (${acz.zone}${lga ? `, ${lga}` : ""}) - land the planning scheme steers toward higher-density housing, shops and services.`,
      whyItMatters:
        "Activity-centre zoning points to more apartments, mixed-use and streetscape change over time - convenient for some buyers, denser for others.",
      verifyAction:
        "Check the council's activity-centre / structure plan for the height and built-form controls that apply near the address.",
      confidence: "high",
      geography: "pin",
      caveat:
        "The Activity Centre Zone is the statutory upzoning instrument - it covers only centres that have adopted it (not every Plan Melbourne centre), built-form controls vary by schedule, and the mapped boundary is simplified, so confirm the exact frontage on the council planning scheme map.",
      sourceRefs: getSourcesByIds(["vic-activity-centres"]),
    });
  }

  // 5l) Lot size (context, never scored). Runtime parcel area at the pin from the
  //     Vicmap parcel WFS (turf-derived; a single parcel, not merged lots).
  //     Pin-mode only - a parcel under an SA2 centroid is not the user's property.
  const parcel = mode === "pin" ? input.parcel : null;
  if (parcel && parcel.areaM2 > 0) {
    const m2 = Math.round(parcel.areaM2);
    findings.push({
      id: "lot-size",
      kind: "neutral",
      severity: "info",
      title: "Approximate lot size",
      summary: `The parcel at this point is about ${m2.toLocaleString("en-AU")} m2${parcel.lot ? ` (Lot ${parcel.lot}${parcel.plan ? ` ${parcel.plan}` : ""})` : ""}.`,
      whyItMatters:
        "Lot size shapes what you can build, extend or subdivide, and underpins the land value beneath the home.",
      verifyAction:
        "Confirm the exact area and boundaries on the title and plan of subdivision before you offer.",
      confidence: "medium",
      geography: "pin",
      caveat:
        "Area is geometry-derived from the Vicmap parcel boundary (CC BY 4.0) at the dropped point - indicative, a SINGLE parcel (not merged or adjoining lots), and not a substitute for the title.",
      sourceRefs: getSourcesByIds(["vic-parcel"]),
    });
  }

  // 5m) Bus access (context, never scored). Nearest GTFS bus stop + its weekday
  //     route count + stops within 400 m. Straight-line proximity proxy.
  const bus =
    point && mode === "pin" && input.busStops
      ? nearestBusStop([point.lng, point.lat], input.busStops)
      : null;
  if (bus && bus.distanceM <= 1200) {
    const close = bus.distanceM <= 400;
    const dist = bus.distanceM < 1000 ? `${bus.distanceM} m` : `${(bus.distanceM / 1000).toFixed(1)} km`;
    findings.push({
      id: "bus-access",
      kind: close ? "positive" : "neutral",
      severity: "info",
      title: close ? "Bus stop within walking distance" : "Bus stop nearby",
      summary: `The nearest bus stop is about ${dist} away${bus.routeCount > 0 ? `, served by ${bus.routeCount} bus route${bus.routeCount === 1 ? "" : "s"}` : ""}${bus.stopsWithin400 > 1 ? ` (${bus.stopsWithin400} bus stops within 400 m)` : ""}.`,
      whyItMatters:
        "Bus access widens where you can get without a car - though routes, frequency and direction vary, so a nearby stop is not always a useful one.",
      verifyAction:
        "Check the actual routes, frequency and direction on the PTV journey planner for the times you would travel.",
      confidence: "medium",
      geography: "pin",
      caveat:
        "Straight-line distance to a mapped GTFS bus stop (weekday services) - the walking route is longer and timetable / direction matter.",
      sourceRefs: getSourcesByIds(["ptv-gtfs"]),
    });
  }

  // 6) Local safety / crime context (LGA). Property + offences-against-the-person
  //    split (VCSA). Off-coverage pins (no SA2 match) drop precision to "unknown".
  const propCrimePct = place?.domains?.safety?.subIndicators?.propertyCrime?.percentile ?? null;
  const violentCrimePct = place?.domains?.safety?.subIndicators?.violentCrime?.percentile ?? null;
  const crimeBits: string[] = [];
  if (typeof propCrimePct === "number") crimeBits.push(`property offences ~${Math.round(propCrimePct)}th percentile`);
  if (typeof violentCrimePct === "number") crimeBits.push(`offences against the person ~${Math.round(violentCrimePct)}th percentile`);
  findings.push({
    id: "safety-context",
    kind: "verify",
    severity: "low",
    title: "Review local safety context",
    summary: !place
      ? "This point is outside our Greater Melbourne coverage, so no local crime context is available here. Recorded offences are published at suburb or council-area level - check the VCSA data for the actual area."
      : crimeBits.length
        ? `Recorded ${crimeBits.join(" and ")} across Greater Melbourne, measured at suburb or council-area level - not the specific street.`
        : "We do not hold recorded-offence figures for this specific area - check VCSA crime data for the wider council area.",
    verifyAction: "Walk the immediate street at different times and check recent local reports.",
    caveat:
      "Recorded offences reflect reporting and policing, not true crime levels; percentiles rank areas and do not predict a specific street.",
    confidence: place && crimeBits.length ? "medium" : "unknown",
    geography: place && crimeBits.length ? "lga" : "unknown",
    sourceRefs: getSourcesByIds(["vcsa-recorded-offences"]),
  });

  // 7) School zones. Address-level: which Victorian Government school zone(s)
  //    contain the pin (point-in-polygon, never from an SA2 centroid). Resolved
  //    only in pin mode when the zone set is loaded; otherwise an honest
  //    "not matched here" fallback. Context only, never scored.
  const zones =
    point && mode === "pin" && input.schoolZones
      ? resolveSchoolZones(point, input.schoolZones)
      : { primary: null, secondary: null };
  if (zones.primary || zones.secondary) {
    const zoneYear = input.schoolZones?.year;
    const parts: string[] = [];
    if (zones.primary) parts.push(`primary at ${zones.primary}`);
    if (zones.secondary) parts.push(`secondary (Year 7) at ${zones.secondary}`);
    findings.push({
      id: "school-zones",
      kind: "neutral",
      severity: "info",
      title: "Government school zones for this location",
      summary: `This location falls in the ${zoneYear ? `${zoneYear} ` : ""}Victorian Government school zone for ${parts.join(", and ")}.`,
      whyItMatters:
        "Your address-based zone is the government school you are guaranteed a place at; it shapes schooling options and can affect resale appeal to families.",
      verifyAction:
        "Confirm the exact address on findmyschool.vic.gov.au - zones are set each year and the boundary can move.",
      confidence: "high",
      geography: "pin",
      caveat:
        "Official DataVic zones simplified (~30 m) for display; a result near a boundary is indicative - confirm the exact address on findmyschool.vic.gov.au. Selective-entry, specialist and non-government schools are not zoned.",
      sourceRefs: getSourcesByIds(["vic-school-zones"]),
    });
  } else {
    findings.push({
      id: "school-zones",
      kind: "unavailable",
      severity: "info",
      title:
        mode === "pin" ? "No government school zone matched here" : "School zones need an exact address",
      summary:
        mode === "pin"
          ? "We could not match a Victorian Government primary or secondary zone to this exact point (it may be outside Greater Melbourne, or in an unzoned/selective area)."
          : "Official school-zone matching needs a dropped pin - it is address-level, not an area average.",
      verifyAction:
        "Confirm the address on findmyschool.vic.gov.au if schools matter to you.",
      confidence: "unknown",
      geography: "unknown",
      caveat:
        "Government school zones change yearly and must be checked at the exact address; selective-entry and non-government schools are not zoned.",
      sourceRefs: [SCHOOL_ZONE_REF],
    });
  }

  // 8) Price / sales context (NOT included).
  findings.push({
    id: "price-unavailable",
    kind: "unavailable",
    severity: "info",
    title: "Price and sales context not included yet",
    summary:
      "This MVP does not estimate property value or price growth. Future versions may add transparent price-context data where licensing allows.",
    confidence: "unknown",
    geography: "unknown",
    caveat: "Price, valuation and rental-yield data are not included in this version - check a listing portal, recent comparable sales, or an agent for indicative pricing.",
  });

  // 9) Data confidence (meta; neutral).
  const dc = place?.dataConfidence?.score;
  if (typeof dc === "number" && Number.isFinite(dc)) {
    findings.push({
      id: "data-confidence",
      kind: "neutral",
      severity: "info",
      title: "Data completeness for this area",
      summary: `Our pipeline rates this area ${Math.round(dc)}/100 for data completeness. This describes how well-measured the area is, not how good it is to live in.`,
      confidence: "medium",
      geography: "sa2",
      sourceRefs: [METHODOLOGY_REF],
    });
  }

  // ---- Executive summary (deterministic template) -------------------------
  const verifyFindings = findings.filter((f) => f.kind === "red_flag" || f.kind === "verify");
  const verifyCount = verifyFindings.length;
  const positiveCount = findings.filter((f) => f.kind === "positive").length;
  const areaName = place?.name ?? input.sa2Name ?? "this location";

  let confidence: BuyerConfidence;
  if (!place) confidence = "low";
  else confidence = "medium";

  // "Before you offer, check these first": the most material verify/red_flag
  // items, ranked by severity then by how decision-critical the category is.
  // The report's decision TL;DR (Codex review: lead with the next action, not a
  // count). Unknown ids fall to the default rank, so severity still drives order.
  const SEV_RANK: Record<BuyerFindingSeverity, number> = { high: 0, medium: 1, low: 2, info: 3 };
  const MATERIALITY: Record<string, number> = {
    "hazard-overlays": 0,
    "coastal-inundation": 1,
    "conservation-overlays": 1,
    "heritage-overlay": 2,
    "safety-context": 3,
    "transport-noise": 4,
    "nuisance-proximity": 5,
    "transport-check": 6,
    "amenity-access-low": 7,
  };
  const priorityChecks = [...verifyFindings]
    .sort(
      (a, b) =>
        SEV_RANK[a.severity] - SEV_RANK[b.severity] ||
        (MATERIALITY[a.id] ?? 9) - (MATERIALITY[b.id] ?? 9)
    )
    .slice(0, 3);

  const headline = place
    ? verifyCount > 0
      ? `${areaName}: ${verifyCount} thing${verifyCount === 1 ? "" : "s"} to check before you offer`
      : `${areaName}: no major flags in the open data - still verify on site`
    : "Location outside our Greater Melbourne coverage";

  const amenitySentence = haveNearbyData
    ? reachableEveryday >= 5
      ? "Everyday amenities look well-covered within a short walk."
      : reachableEveryday <= 2
        ? "Few everyday amenities were found nearby in the open data - worth checking on foot."
        : "Some everyday amenities are nearby; check the rest on foot."
    : "Drop a pin on the map to measure what is nearby on foot.";
  const liveabilitySentence =
    overall != null
      ? overall >= 65
        ? "The surrounding area scores well on liveability."
        : overall <= 45
          ? "The surrounding area has some liveability trade-offs to review."
          : "The surrounding area is around the Greater-Melbourne median on liveability."
      : "";
  const subheadline = place
    ? `${amenitySentence} ${liveabilitySentence} The detail, sources and caveats are below - use the checklist to verify anything material before you offer.`.replace(
        /\s+/g,
        " "
      ).trim()
    : "We could not match this point to a Greater Melbourne area. Drop the pin on a Melbourne property to get the full report.";

  // ---- Report-level source manifest ---------------------------------------
  const refMap = new Map<string, BuyerSourceRef>();
  for (const f of findings)
    for (const r of f.sourceRefs ?? []) if (!refMap.has(r.id)) refMap.set(r.id, r);
  for (const a of nearbyAmenities)
    for (const r of a.sourceRefs ?? []) if (!refMap.has(r.id)) refMap.set(r.id, r);
  if (!refMap.has("methodology")) refMap.set("methodology", METHODOLOGY_REF);
  const sourceRefs = [...refMap.values()];

  const id = place
    ? `sa2-${place.sa2Code}${hasPoint ? `-${input.lat!.toFixed(5)}-${input.lng!.toFixed(5)}` : ""}`
    : hasPoint
      ? `pin-${input.lat!.toFixed(5)}-${input.lng!.toFixed(5)}`
      : "buyer-report";

  // Personal "fit for your life" - re-frame the sourced facts against the user's
  // profile (deal-breakers to verify + fit notes). Pure; never alters the score.
  const fit: FitResult | undefined = input.profile
    ? evaluateFit(input.profile, {
        floodPct: rawOf(place, "hazards", "floodPct"),
        bushfirePct: rawOf(place, "hazards", "bushfirePct"),
        heritagePct: place?.context?.planning?.heritageOverlayPct ?? null,
        transportPct: pctOf(place, "transport"),
        hasNoiseFlag: findings.some((f) => f.id === "transport-noise"),
        hasNuisanceFlag: findings.some((f) => f.id === "nuisance-proximity"),
      })
    : undefined;

  // Social anchors: straight-line distance from this pin to the user's real-life
  // places (work / school / family). Context only, never scored; needs a pin.
  const anchors =
    hasPoint && input.profile?.anchors?.length
      ? anchorDistances([input.lng!, input.lat!], input.profile.anchors)
      : undefined;

  return {
    id,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    mode,
    accessMode,
    location: {
      lat: hasPoint ? input.lat : undefined,
      lng: hasPoint ? input.lng : undefined,
      sa2Code: place?.sa2Code,
      sa2Name: place?.name ?? input.sa2Name,
      lgaName: place?.lga ?? input.lgaName,
    },
    summary: { headline, subheadline, confidence },
    findings,
    priorityChecks,
    nearbyAmenities,
    amenityCountsByCategory,
    sourceRefs,
    disclaimers: [BUYER_DISCLAIMER],
    fit,
    anchorDistances: anchors,
  };
}
