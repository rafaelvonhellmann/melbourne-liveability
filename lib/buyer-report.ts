/**
 * Buyer "Location Check" due-diligence report — a deterministic, sourced
 * findings engine. Given a point (and the SA2 it falls in) it produces a
 * plain-English screening report: what looks positive, what to verify, what is
 * nearby, and what we cannot determine yet.
 *
 * Hard rules (see Buyer-Mode strategy + product spec):
 * - NO AI calls, NO network, NO randomness — pure + testable.
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
import { nearestStation, type Station } from "./transit";
import { computeWeightedScore } from "./scoring";
import { getDefaultWeights } from "./weights";
import { getSourcesByIds } from "./source-manifest";
import { sunAspect } from "./sun";

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
  nearbyAmenities: NearbyAmenity[];
  /** Total count of POIs within the radius per category (display: "N within ~1.2 km"). */
  amenityCountsByCategory: Record<string, number>;
  sourceRefs: BuyerSourceRef[];
  disclaimers: string[];
  /** Personal "fit for your life" result when a profile was supplied; else absent. */
  fit?: FitResult;
}

// ---- Constants -------------------------------------------------------------

/** ~15 min on foot at 5 km/h (straight-line proxy). */
export const DEFAULT_RADIUS_METERS = 1200;

/**
 * A neighbouring SA2 whose centre-point is within this straight-line distance of
 * the pin counts as "close" for the adjacency nudge — the same ~15-minute-walk
 * threshold used for nearby amenities. Centre-point proximity, NOT a true
 * boundary test (the finding says so).
 */
export const ADJACENCY_THRESHOLD_KM = DEFAULT_RADIUS_METERS / 1000;

/**
 * A curated VIC Big Build project within this straight-line distance of the pin
 * is "nearby" for the what's-changing nudge. Generous on purpose — a new station
 * reshapes a wide catchment, not just its doorstep.
 */
export const MAJOR_PROJECT_THRESHOLD_KM = 1.5;

export const STRAIGHT_LINE_CAVEAT =
  "Nearby amenities are estimated using straight-line distance from the dropped pin. This is a quick screening tool, not a street-network routing calculation.";

export const STREET_NETWORK_CAVEAT =
  "Reachability here is a street-network walk isochrone (OpenRouteService) — what is actually within a ~15-minute walk along streets and paths, not a straight-line radius. The listed distance to each amenity is still straight-line.";

export const BUYER_DISCLAIMER =
  "This report is general information only. It is not financial, property, legal, insurance or planning advice. Data may be incomplete, outdated or geographically approximate. Before buying, verify relevant matters with your conveyancer, council, insurer, lender and qualified property professionals.";

const METHODOLOGY_REF: BuyerSourceRef = {
  id: "methodology",
  label: "liveable.melbourne liveability methodology",
  url: "/methodology",
};

const SCHOOL_ZONE_REF: BuyerSourceRef = {
  id: "vic-school-zones",
  label: "Find My School — official Victorian school zones",
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
 *    `radiusMeters` — same honesty caveat as the 15-min-access layer.
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

function safeOverallScore(place: Place | null | undefined, override?: number | null): number | null {
  if (override != null && Number.isFinite(override)) return override;
  if (!place) return null;
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
   * "precise". Stays pure — the fetch happens in the client, the polygon is data.
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
   * containing SA2. Optional — omit to skip the adjacency finding (e.g. SA2-mode
   * cards or the sample report).
   */
  nearbyAreas?: { sa2Code: string; slug: string; name: string; centroid: [number, number] }[];
  /**
   * Curated flagship VIC Big Build transport projects (see lib/major-projects).
   * When the pin is within {@link MAJOR_PROJECT_THRESHOLD_KM} of one, the report
   * flags it as "what's changing nearby". Optional — omit to skip the finding.
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
  // source is close — we never claim "quiet" (not all noise sources are mapped).
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
        severity: flags.some((f) => f.distance <= 50) ? "medium" : "low",
        title: "Possible traffic / rail noise",
        summary: `This point is close to a ${list}.`,
        whyItMatters:
          "Proximity to a freeway, railway or tram line often means road, train or tram noise — especially at peak hour and overnight.",
        verifyAction:
          "Visit at peak hour and after dark to judge the real noise; ask whether the property has double glazing.",
        confidence: "low",
        geography: "pin",
        caveat:
          "Straight-line distance to the nearest mapped rail line, tram line or freeway/major road (OpenStreetMap, ODbL) — a proximity proxy, NOT a measured noise level. Barriers, cuttings, traffic volume, aspect and time of day all matter and are not modelled.",
        sourceRefs: getSourcesByIds(["osm-amenities"]),
      });
    }
  }

  // Nuisance / disamenity proximity proxy (pin-level, OSM): industrial estates,
  // waste/landfill, sewage works, quarries — odour/dust/traffic. Only FLAG close.
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
          "Straight-line distance to the representative point of the nearest mapped industrial area, waste/landfill, sewage works or quarry (OpenStreetMap, ODbL) — a proximity proxy, NOT a measured emission. Whether a site affects this property depends on wind, hours, screening and operations.",
        sourceRefs: getSourcesByIds(["osm-amenities"]),
      });
    }
  }

  // Nearest train station (pin-level, OSM) — a commute-convenience signal.
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
        sourceRefs: getSourcesByIds(["osm-amenities"]),
      });
    }
  }

  // 1b) Adjacency nudge. If the pin sits within ~15 min on foot of a NEIGHBOURING
  //     SA2's centre-point, a boundary is probably close — recommend also checking
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
          "Closeness is measured to area centre-points (straight-line), not to the actual boundary — check the map for where the borders fall.",
        sourceRefs: [METHODOLOGY_REF],
      });
    }
  }

  // 1c) Major transport projects (curated VIC Big Build) within ~1.5 km of the
  //     pin — a factual "what's changing nearby" nudge, never a price prediction.
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
        summary: `A new ${p.label} — ${p.name} station, ~${Math.round(p.km * 1000)} m away — is ${p.status}.${more ? ` Also nearby: ${more}.` : ""}`,
        whyItMatters:
          "Major transport infrastructure can reshape access and the area over the years it is built and opens.",
        verifyAction:
          "Check the official project page for timing, construction impacts and the final station siting.",
        confidence: "medium",
        geography: "poi-radius",
        caveat:
          "Station location is approximate (resolved from OpenStreetMap) and projects can shift — confirm on the project page. This flags what is planned or underway, not a prediction of prices.",
        sourceRefs: [
          { id: "vic-big-build", label: "Victoria's Big Build", url: p.sourceUrl },
        ],
      });
    }
  }

  // 1d) Sun & aspect — proprietary, deterministic solar geometry from the pin's
  //     latitude (no external shade service). Aspect can't be changed, so it's a
  //     real due-diligence factor.
  if (hasPoint) {
    const sun = sunAspect(input.lat as number);
    const h = (n: number) => n.toFixed(1);
    findings.push({
      id: "sun-aspect",
      kind: "neutral",
      severity: "info",
      title: "Sun & aspect",
      summary: `In summer the sun rises in the ${sun.summer.sunrise} and sets in the ${sun.summer.sunset} — a long ~${h(sun.summer.dayHours)}-hour day, climbing to ${Math.round(sun.summer.noonElevation)}° at noon. In winter it rises ${sun.winter.sunrise}, sets ${sun.winter.sunset} (~${h(sun.winter.dayHours)} hours, only ${Math.round(sun.winter.noonElevation)}° high). ${sun.sunSide === "north" ? "North" : "South"}-facing rooms and outdoor space get the most sun; morning sun comes from the east, afternoon from the west.`,
      whyItMatters:
        "Aspect — which way the property faces — drives natural light, winter warmth and running costs, and it can't be changed.",
      verifyAction:
        "Walk the property at the time of day you'd use the main rooms, and check which windows face the sunny side.",
      confidence: "high",
      geography: "pin",
      caveat:
        "Computed from the sun's geometry at this latitude (so it's the same along the street); trees, hills and neighbouring buildings still cast real shadows.",
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
        summary: `The surrounding SA2 scores ${Math.round(overall)}/100 on the current liveability model.`,
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
        summary: `The surrounding SA2 scores ${Math.round(overall)}/100 and has some weaker indicators in the current model.`,
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
      summary: `Transport scores in the top tier for Greater Melbourne (${Math.round(transportPct)}th percentile) at the SA2 level.`,
      confidence: "medium",
      geography: "sa2",
      caveat: "Area-level; confirm the actual stops, lines and peak-hour commute for this address.",
      sourceRefs: getSourcesByIds(["ptv-gtfs"]),
    });
  } else if (transportPct != null && transportPct <= 30) {
    findings.push({
      id: "transport-check",
      kind: "verify",
      severity: "low",
      title: "Inspect the commute at peak hour",
      summary: `Transport sits in the lower range for Greater Melbourne (${Math.round(transportPct)}th percentile) at the SA2 level.`,
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
      summary: `Health access scores in the top tier for Greater Melbourne (${Math.round(healthPct)}th percentile) at the SA2 level.`,
      confidence: "medium",
      geography: "sa2",
      sourceRefs: getSourcesByIds(["vic-mapshare-hospitals", "osm-health"]),
    });
  }

  // 5) Hazard & planning overlays (SA2 share; parcel-level NOT matched).
  //    Established/inner SA2s typically have ~no bushfire/flood overlay — there we
  //    surface a calm "none mapped" note rather than a "verify" flag (a flood/fire
  //    warning in the CBD is noise). Material overlay share keeps the verify/red-flag.
  const bushfire = rawOf(place, "hazards", "bushfirePct");
  const flood = rawOf(place, "hazards", "floodPct");
  const haveHazardData = bushfire != null || flood != null;
  const negligibleHazard = (bushfire ?? 0) < 1 && (flood ?? 0) < 1;
  const elevatedHazard = (bushfire != null && bushfire >= 50) || (flood != null && flood >= 10);
  const hazardBits: string[] = [];
  if (bushfire != null) hazardBits.push(`about ${Math.round(bushfire)}% mapped as bushfire-prone overlay`);
  if (flood != null) hazardBits.push(`about ${Math.round(flood)}% under a flood (LSIO) overlay`);
  if (haveHazardData && negligibleHazard) {
    findings.push({
      id: "hazard-overlays",
      kind: "neutral",
      severity: "info",
      title: "No significant bushfire or flood overlay mapped here",
      summary:
        "This SA2 has little or no bushfire-prone or flood (LSIO) planning overlay. Overlays still apply parcel by parcel, so confirm the exact property if it matters to you.",
      confidence: "medium",
      geography: "sa2",
      caveat:
        "Absence of a mapped planning overlay is not a guarantee — flood or fire risk can exist without one.",
      sourceRefs: getSourcesByIds(["vic-planning-bpa", "vic-planning-flood"]),
    });
  } else {
    findings.push({
      id: "hazard-overlays",
      kind: elevatedHazard ? "red_flag" : "verify",
      severity: elevatedHazard ? "high" : "medium",
      title: "Check hazard and planning overlays",
      summary: hazardBits.length
        ? `Of this SA2, ${hazardBits.join(" and ")}. Whether THIS parcel is affected needs a parcel-level check — pin-level overlay matching is not yet available in this MVP.`
        : "Hazard/planning overlay checks matter for this location, but exact pin-level overlay matching is not yet available in this MVP.",
      whyItMatters: "Overlays drive building controls, insurance cost and what you can do with the land.",
      verifyAction:
        "Check the relevant council planning certificate, VicPlan and an insurance quote before buying.",
      confidence: hazardBits.length ? "medium" : "unknown",
      geography: hazardBits.length ? "sa2" : "unknown",
      sourceRefs: getSourcesByIds(["vic-planning-bpa", "vic-planning-flood"]),
    });
  }

  // 5b) Heritage Overlay (context — a planning CONTROL, never scored). Only
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
      summary: `About ${Math.round(heritagePct)}% of this SA2's area is within a Heritage Overlay (HO). Whether THIS property is affected needs a parcel-level check.`,
      whyItMatters:
        "A Heritage Overlay can restrict demolition, external changes and subdivision — it shapes what you can do with the property.",
      verifyAction:
        "Check the property's planning certificate / VicPlan for a Heritage Overlay before you offer.",
      confidence: "medium",
      geography: "sa2",
      caveat:
        "Area share, not a parcel-level result — a property can be affected even where the area share is low, and vice versa.",
      sourceRefs: getSourcesByIds(["vic-planning-heritage"]),
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
      ? "This point is outside our Greater Melbourne coverage, so no local crime context is available here. Recorded offences are published at suburb/LGA level — check the VCSA data for the actual area."
      : crimeBits.length
        ? `Recorded ${crimeBits.join(" and ")} across Greater Melbourne, measured at suburb/LGA level — not the specific street.`
        : "We do not hold recorded-offence figures for this specific area — check VCSA crime data for the wider council/LGA.",
    verifyAction: "Walk the immediate street at different times and check recent local reports.",
    caveat:
      "Recorded offences reflect reporting and policing, not true crime levels; percentiles rank areas and do not predict a specific street.",
    confidence: place && crimeBits.length ? "medium" : "unknown",
    geography: place && crimeBits.length ? "lga" : "unknown",
    sourceRefs: getSourcesByIds(["vcsa-recorded-offences"]),
  });

  // 7) School zones (catchment data NOT available).
  findings.push({
    id: "school-zones",
    kind: "verify",
    severity: "medium",
    title: "Verify school zones directly",
    summary:
      "School zones can materially affect buyer decisions, but official catchment matching is not included in this MVP.",
    verifyAction:
      "Confirm the address using the official Victorian school-zone tool before relying on school access.",
    confidence: "unknown",
    geography: "unknown",
    caveat: "We do not hold official school-catchment boundaries; zones change yearly and must be checked at the exact address.",
    sourceRefs: [SCHOOL_ZONE_REF],
  });

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
    caveat: "Sale prices, valuations and rental yields are not open data we can license — check a listing portal, recent comparable sales, or an agent for indicative pricing.",
  });

  // 9) Data confidence (meta; neutral).
  const dc = place?.dataConfidence?.score;
  if (typeof dc === "number" && Number.isFinite(dc)) {
    findings.push({
      id: "data-confidence",
      kind: "neutral",
      severity: "info",
      title: "Data completeness for this area",
      summary: `Our pipeline rates this SA2 ${Math.round(dc)}/100 for data completeness. This describes how well-measured the area is, not how good it is to live in.`,
      confidence: "medium",
      geography: "sa2",
      sourceRefs: [METHODOLOGY_REF],
    });
  }

  // ---- Executive summary (deterministic template) -------------------------
  const verifyCount = findings.filter((f) => f.kind === "red_flag" || f.kind === "verify").length;
  const positiveCount = findings.filter((f) => f.kind === "positive").length;
  const areaName = place?.name ?? input.sa2Name ?? "this location";

  let confidence: BuyerConfidence;
  if (!place) confidence = "low";
  else confidence = "medium";

  const headline = place
    ? `${areaName}: ${positiveCount} positive signal${positiveCount === 1 ? "" : "s"}, ${verifyCount} thing${verifyCount === 1 ? "" : "s"} to verify`
    : "Location outside our Greater Melbourne SA2 coverage";

  const amenitySentence = haveNearbyData
    ? reachableEveryday >= 5
      ? "Everyday amenities look well-covered within a short walk."
      : reachableEveryday <= 2
        ? "Few everyday amenities were found nearby in the open data — worth checking on foot."
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
    ? `${amenitySentence} ${liveabilitySentence} The detail, sources and caveats are below — use the checklist to verify anything material before you offer.`.replace(
        /\s+/g,
        " "
      ).trim()
    : "We could not match this point to a Greater Melbourne SA2. Drop the pin on a Melbourne property to get the full report.";

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

  // Personal "fit for your life" — re-frame the sourced facts against the user's
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
    nearbyAmenities,
    amenityCountsByCategory,
    sourceRefs,
    disclaimers: [BUYER_DISCLAIMER],
    fit,
  };
}
