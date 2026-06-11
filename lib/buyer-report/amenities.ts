/**
 * Amenities lens: geometry/POI helpers (SA2 containment, nearby-POI search,
 * park dedupe) + the everyday-amenity-access and adjacency-nudge findings.
 * Split out of lib/buyer-report.ts (P1-10 decomposition) - no logic changes.
 */
import type { Feature, Point, Polygon, MultiPolygon } from "geojson";
import { haversineKm, pointInPolygon, type LngLat } from "../buyer-location";
import { WALK_CATEGORY_IDS } from "../walk-access";
import { POI_CATEGORY_BY_ID, type PoiCategoryId } from "../poi-categories";
import { getSourcesByIds } from "../source-manifest";
import {
  ADJACENCY_THRESHOLD_KM,
  DEFAULT_RADIUS_METERS,
  type BuyerFinding,
  type NearbyAmenity,
} from "./types";
import { METHODOLOGY_REF } from "./helpers";
import type { EngineCtx } from "./context";

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

// ---- Finding collectors ----------------------------------------------------

/** 1) Everyday-amenity access (point-level, OSM). */
export function pushAmenityAccessFindings(findings: BuyerFinding[], ctx: EngineCtx): void {
  const {
    input,
    point,
    walkPhrase,
    amenityCaveat,
    amenityCountsByCategory,
    reachableEveryday,
    haveNearbyData,
  } = ctx;
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
}

/**
 * 1b) Adjacency nudge. If the pin sits within ~15 min on foot of a NEIGHBOURING
 *     SA2's centre-point, a boundary is probably close - recommend also checking
 *     those areas, since their amenities, scores and recorded-offence figures may
 *     describe this spot just as well as the containing SA2 does.
 */
export function pushAdjacencyFinding(findings: BuyerFinding[], ctx: EngineCtx): void {
  const { input, place, point } = ctx;
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
}
