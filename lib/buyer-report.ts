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
import { computeWeightedScore } from "./scoring";
import { getDefaultWeights } from "./weights";
import { getSourcesByIds } from "./source-manifest";

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
}

// ---- Constants -------------------------------------------------------------

/** ~15 min on foot at 5 km/h (straight-line proxy). */
export const DEFAULT_RADIUS_METERS = 1200;

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
  { id: "services", label: "Everyday services", categories: ["pharmacy", "post_office"] },
  { id: "health", label: "Health", categories: ["hospital", "gp", "pathology_lab", "ndis_provider"] },
  { id: "education", label: "Education", categories: ["childcare", "school"] },
  { id: "recreation", label: "Parks & recreation", categories: ["park", "gym_leisure"] },
  { id: "food", label: "Cafes & dining", categories: ["cafe_restaurant"] },
  { id: "community", label: "Community & safety", categories: ["police"] },
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
  const osmRef = getSourcesByIds(["osm-amenities"]);

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
      sourceRefs: osmRef,
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
  // straight-line radius. Same code path either way (getNearbyAmenities).
  const allNearby =
    point && input.pois
      ? getNearbyAmenities(point, input.pois, { radiusMeters, isochrone })
      : [];
  const amenityCountsByCategory: Record<string, number> = {};
  for (const a of allNearby) {
    amenityCountsByCategory[a.category] = (amenityCountsByCategory[a.category] ?? 0) + 1;
  }
  const nearbyAmenities =
    point && input.pois
      ? getNearbyAmenities(point, input.pois, { radiusMeters, limitPerCategory: 8, isochrone })
      : [];

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
        summary: `${amenityCountsByCategory["park"]} park / open-space feature(s) mapped ${walkPhrase}.`,
        confidence: "medium",
        geography: "poi-radius",
        caveat: amenityCaveat,
        sourceRefs: getSourcesByIds(["osm-amenities"]),
      });
    }
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

  // 6) Local safety / crime context (LGA). Off-coverage pins (no SA2 match) have
  //    no local crime data, so precision/confidence drop to "unknown".
  const propCrimePct = place?.domains?.safety?.subIndicators?.propertyCrime?.percentile ?? null;
  findings.push({
    id: "safety-context",
    kind: "verify",
    severity: "low",
    title: "Review local safety context",
    summary: !place
      ? "This point is outside our Greater Melbourne coverage, so no local crime context is available here. Recorded offences are published at suburb/LGA level — check the VCSA data for the actual area."
      : typeof propCrimePct === "number"
        ? `Recorded property-offence rates sit around the ${Math.round(propCrimePct)}th percentile for Greater Melbourne, measured at suburb/LGA level — not the specific street.`
        : "Recorded-offence rates are published at suburb/LGA level — not at the specific street or property.",
    verifyAction: "Walk the immediate street at different times and check recent local reports.",
    confidence: place ? "medium" : "unknown",
    geography: place ? "lga" : "unknown",
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
  };
}
