/**
 * Buyer-report public contract: every exported type + constant of the
 * lib/buyer-report barrel lives here. Split out of lib/buyer-report.ts
 * (P1-10 decomposition) - no logic changes; the barrel re-exports all of it.
 */
import type { Feature, Point, Polygon, MultiPolygon } from "geojson";
import type { Place } from "../types";
import type { NoiseLine } from "../noise";
import type { NuisancePoint } from "../nuisance";
import type { BuyerProfile, FitResult } from "../buyer-fit";
import type { AnchorDistance } from "../anchors";
import type { Station, BusStop } from "../transit";
import type { SchoolZonesData } from "../school-zones";
import type { TrafficSegment } from "../traffic";
import type { EpaAirSite } from "../epa-air";
import type { ActivityCentreFeature } from "../activity-centres";
import type { ParcelInfo } from "../parcel";
import type { PlanningAt } from "../planning-at";
import type { PoiCategoryId } from "../poi-categories";

/** Under-construction / proposed PT stop (OSM) - the "future transport" signal. */
export type FutureStationLite = {
  name: string;
  coord: [number, number];
  status: "construction" | "proposed";
  mode: "rail" | "tram";
};

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
  | "parcel"
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
  /**
   * Dataset/check vintage for this finding (e.g. the planning-map "as at"
   * date). Rendered ONLY in full-report variants - the live glimpse panel
   * never shows dates, sources or caveats.
   */
  asAt?: string;
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
  location: {
    lat?: number;
    lng?: number;
    sa2Code?: string;
    sa2Name?: string;
    lgaName?: string;
    /**
     * User confirmation (ParcelConfirmCard) that the parcel under the pin is
     * the property being checked - the wrong-lot trust guard. While absent,
     * parcel-geography findings carry {@link UNCONFIRMED_PARCEL_CAVEAT}; it
     * never changes any finding's kind or severity.
     */
    confirmedParcel?: { areaM2: number; confirmedAt: string };
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

/**
 * Appended to every parcel-geography planning finding (zone, overlays,
 * all-clear) while the user has NOT confirmed the highlighted lot is the
 * property being checked - the wrong-lot trust guard for findings.
 */
export const UNCONFIRMED_PARCEL_CAVEAT =
  "Location taken from the dropped pin - confirm the highlighted lot above before relying on parcel-level findings.";

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

// ---- Engine input (stable public contract) ---------------------------------

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
   * Parcel-level planning zone + overlays at the pin (runtime VicPlan point
   * lookup, client-side - see lib/planning-at). Pin mode only. When present,
   * the point answer replaces the SA2 heritage/conservation area-share
   * findings; when null/omitted the SA2 findings remain the fallback.
   */
  planning?: PlanningAt | null;
  /**
   * The user's "yes, this is the property" confirmation of the parcel under
   * the pin (ParcelConfirmCard). Copied onto report.location verbatim; while
   * absent, parcel-geography findings (zone, overlays, all-clear) append
   * {@link UNCONFIRMED_PARCEL_CAVEAT} to their caveat.
   */
  confirmedParcel?: { areaM2: number; confirmedAt: string } | null;
  /**
   * Government school zones (primary + secondary Year 7) for the address-level
   * zone match. Lazy-loaded client-side; resolved only in pin mode (never from
   * an SA2 centroid). Omit to fall back to the "confirm at the exact address"
   * note. See lib/school-zones.
   */
  schoolZones?: SchoolZonesData;
  /**
   * The user's personal "fit" profile. When provided, the report gains a `fit`
   * block: deal-breakers to verify + plain-language fit notes, evaluated
   * against this place. Never changes the score. See lib/buyer-fit.
   */
  profile?: BuyerProfile | null;
}
