/**
 * Region registry (P4.1 Phase A - EXPANSION-PLAN section 2).
 *
 * One entry per greater capital region (ABS ASGS Ed.3 GCCSA). Everything that
 * used to hang off the single GREATER_MELBOURNE_GCCSA constant derives from
 * here: GCCSA filters in the fetch pipeline, Overpass bboxes, map framing,
 * share-URL pin validation. Melbourne's values are an exact port of the
 * pre-registry constants (lib/region.ts, lib/share-url.ts,
 * scripts/lib/gtfs-constants.ts) so the Melbourne pipeline output is
 * byte-identical.
 *
 * Bboxes are approximate published GCCSA extents - deliberately generous.
 * They gate pin/geocode validation and clip Overpass/data fetches; they are
 * NOT authoritative boundaries (the SA2 polygons are).
 *
 * No imports - this module must stay dependency-free so both app code (lib/)
 * and the data pipeline (scripts/) can use it without cycles.
 */

export type RegionId =
  | "melbourne"
  | "sydney"
  | "brisbane"
  | "adelaide"
  | "perth"
  | "hobart"
  | "darwin"
  | "canberra";

/** Plain lng/lat envelope. west < east, south < north (negatives: AU is S/E). */
export type RegionBbox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

/** Per-state Tier-B source endpoints (EXPANSION-PLAN section 3). Filled in as
 * each state module lands; optional so Tier-A-only regions stay valid. */
export type StateSources = {
  /** Static GTFS Schedule zip (state transit authority, CC BY or similar). */
  gtfsUrl?: string;
};

export type Region = {
  id: RegionId;
  /** Display label, e.g. "Greater Melbourne". */
  label: string;
  /** ABS ASGS Ed.3 GCCSA code (stable), e.g. "2GMEL". */
  gccsa: string;
  /** State/territory abbreviation, e.g. "VIC". */
  state: string;
  /** ABS STATE_CODE_2021 (= first char of the GCCSA code), e.g. "2". */
  stateCode: string;
  /** Lowercase state slug for raw filenames, e.g. "vic" -> sal-vic.geojson. */
  stateSlug: string;
  /** Data extent: clips Overpass/GTFS fetches and frames the initial map. */
  bbox: RegionBbox;
  /** Generous envelope gating share-URL pin + geocode validation only. */
  pinBbox: RegionBbox;
  /** Initial map center [lng, lat]. */
  mapCenter: [number, number];
  /** Initial map zoom. */
  zoom: number;
  /** Panning envelope - several degrees beyond the data extent so panning is
   * free at normal zooms without drifting across the planet. */
  maxBounds: [[number, number], [number, number]];
  /** false for the ACT (whole-territory 8ACTE, no councils) - LGA-keyed joins
   * collapse to one jurisdiction there. */
  hasCouncils: boolean;
  stateSources?: StateSources;
};

const REGIONS: Record<RegionId, Region> = {
  melbourne: {
    id: "melbourne",
    label: "Greater Melbourne",
    gccsa: "2GMEL",
    state: "VIC",
    stateCode: "2",
    stateSlug: "vic",
    // Exact port of the pre-registry constants - do not "improve" these
    // numbers; Melbourne output must stay byte-identical.
    bbox: { west: 144.45, south: -38.35, east: 145.65, north: -37.45 },
    pinBbox: { west: 143.0, south: -39.5, east: 147.0, north: -36.5 },
    mapCenter: [144.9631, -37.8136],
    zoom: 9,
    maxBounds: [
      [141.0, -39.6],
      [148.8, -36.0],
    ],
    hasCouncils: true,
    stateSources: {
      /** Official PTV / DTP GTFS Schedule (CC BY 4.0). */
      gtfsUrl:
        "https://opendata.transport.vic.gov.au/dataset/3f4e292e-7f8a-4ffe-831f-1953be0fe448/resource/fb152201-859f-4882-9206-b768060b50ad/download/gtfs.zip",
    },
  },
  sydney: {
    id: "sydney",
    label: "Greater Sydney",
    gccsa: "1GSYD",
    state: "NSW",
    stateCode: "1",
    stateSlug: "nsw",
    // GCCSA spans Blue Mountains/Hawkesbury west to Central Coast north.
    bbox: { west: 149.95, south: -34.4, east: 151.7, north: -32.95 },
    pinBbox: { west: 148.95, south: -35.4, east: 152.7, north: -31.95 },
    mapCenter: [151.2093, -33.8688],
    zoom: 9,
    maxBounds: [
      [146.95, -35.9],
      [154.7, -31.45],
    ],
    hasCouncils: true,
  },
  brisbane: {
    id: "brisbane",
    label: "Greater Brisbane",
    gccsa: "3GBRI",
    state: "QLD",
    stateCode: "3",
    stateSlug: "qld",
    // GCCSA includes Ipswich/Lockyer Valley west, Scenic Rim south, Moreton
    // Bay/Somerset north, Redland islands east.
    bbox: { west: 151.9, south: -28.4, east: 153.6, north: -26.4 },
    pinBbox: { west: 150.9, south: -29.4, east: 154.6, north: -25.4 },
    mapCenter: [153.026, -27.4705],
    zoom: 9,
    maxBounds: [
      [148.9, -29.9],
      [156.6, -24.9],
    ],
    hasCouncils: true,
  },
  adelaide: {
    id: "adelaide",
    label: "Greater Adelaide",
    gccsa: "4GADE",
    state: "SA",
    stateCode: "4",
    stateSlug: "sa",
    // GCCSA spans Gawler north to Sellicks south, Adelaide Hills east.
    bbox: { west: 138.4, south: -35.45, east: 139.1, north: -34.45 },
    pinBbox: { west: 137.4, south: -36.45, east: 140.1, north: -33.45 },
    mapCenter: [138.6007, -34.9285],
    zoom: 10,
    maxBounds: [
      [135.4, -36.95],
      [142.1, -32.95],
    ],
    hasCouncils: true,
  },
  perth: {
    id: "perth",
    label: "Greater Perth",
    gccsa: "5GPER",
    state: "WA",
    stateCode: "5",
    stateSlug: "wa",
    // GCCSA spans Two Rocks north to Mandurah/Murray south, hills east.
    bbox: { west: 115.4, south: -32.9, east: 116.45, north: -31.4 },
    pinBbox: { west: 114.4, south: -33.9, east: 117.45, north: -30.4 },
    mapCenter: [115.8605, -31.9523],
    zoom: 9,
    maxBounds: [
      [112.4, -34.4],
      [119.45, -29.9],
    ],
    hasCouncils: true,
  },
  hobart: {
    id: "hobart",
    label: "Greater Hobart",
    gccsa: "6GHOB",
    state: "TAS",
    stateCode: "6",
    stateSlug: "tas",
    // GCCSA: Brighton north to Kingborough south, Sorell east.
    bbox: { west: 146.9, south: -43.2, east: 148.0, north: -42.55 },
    pinBbox: { west: 145.9, south: -44.2, east: 149.0, north: -41.55 },
    mapCenter: [147.3257, -42.8826],
    zoom: 10,
    maxBounds: [
      [143.9, -44.7],
      [151.0, -41.05],
    ],
    hasCouncils: true,
  },
  darwin: {
    id: "darwin",
    label: "Greater Darwin",
    gccsa: "7GDAR",
    state: "NT",
    stateCode: "7",
    stateSlug: "nt",
    // GCCSA: Darwin/Palmerston/Litchfield plus Cox Peninsula (Wagait/Belyuen).
    bbox: { west: 130.6, south: -13.0, east: 131.45, north: -12.0 },
    pinBbox: { west: 129.6, south: -14.0, east: 132.45, north: -11.0 },
    mapCenter: [130.8444, -12.4381],
    zoom: 10,
    maxBounds: [
      [127.6, -14.5],
      [134.45, -10.5],
    ],
    hasCouncils: true,
  },
  canberra: {
    id: "canberra",
    label: "Canberra (ACT)",
    gccsa: "8ACTE",
    state: "ACT",
    stateCode: "8",
    stateSlug: "act",
    // 8ACTE is the whole-of-territory code (the ACT has no GCCSA split).
    // NO councils - LGA-keyed joins collapse to one jurisdiction.
    bbox: { west: 148.7, south: -35.95, east: 149.45, north: -35.1 },
    pinBbox: { west: 147.7, south: -36.95, east: 150.45, north: -34.1 },
    mapCenter: [149.131, -35.2802],
    zoom: 10,
    maxBounds: [
      [145.7, -37.45],
      [152.45, -33.6],
    ],
    hasCouncils: false,
  },
};

export const REGION_IDS = Object.keys(REGIONS) as RegionId[];

export const DEFAULT_REGION: RegionId = "melbourne";

function isRegionId(id: string): id is RegionId {
  return Object.prototype.hasOwnProperty.call(REGIONS, id);
}

/** Registry lookup. Throws on unknown ids - a typo'd region must fail loud,
 * never silently fall back to Melbourne data labelled as another city. */
export function getRegion(id: string): Region {
  if (!isRegionId(id)) {
    throw new Error(
      `Unknown region '${id}'. Valid regions: ${REGION_IDS.join(", ")}`
    );
  }
  return REGIONS[id];
}

/** Resolves a raw env/arg value to a region id. Empty/undefined defaults to
 * DEFAULT_REGION (melbourne); unknown values throw (see getRegion). */
export function resolveRegionId(raw?: string | null): RegionId {
  const id = (raw ?? "").trim().toLowerCase();
  if (!id) return DEFAULT_REGION;
  getRegion(id); // validates, throws on unknown
  return id as RegionId;
}

/** Overpass QL bbox clause "(south,west,north,east)" for a region's data
 * extent - the exact string embedded in Overpass queries. */
export function overpassBbox(region: Region): string {
  const { south, west, north, east } = region.bbox;
  return `(${south},${west},${north},${east})`;
}

/** Bare filename only: letters/digits/dot/dash/underscore, no leading dot, no
 * path separators - so a region-suffixed name can never traverse directories. */
const SAFE_DATA_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Region-suffixed data artifact filename (P4.1 Phase B - per-region output
 * emit). The DEFAULT region (melbourne) keeps the exact historical name -
 * zero churn for the live site; every other region gets its id inserted
 * before the extension:
 *   regionDataFile("melbourne", "places.json")  -> "places.json"
 *   regionDataFile("canberra", "places.json")   -> "places.canberra.json"
 *   regionDataFile("canberra", "places.geojson") -> "places.canberra.geojson"
 * Throws on unknown regions and on unsafe names (path separators, "..",
 * leading dot) - a bad name must fail loud, never write outside data dirs.
 */
export function regionDataFile(regionId: RegionId, name: string): string {
  getRegion(regionId); // validates, throws on unknown
  if (!SAFE_DATA_FILE.test(name) || name.includes("..")) {
    throw new Error(
      `Unsafe data filename '${name}' (bare name expected, e.g. "places.json")`
    );
  }
  if (regionId === DEFAULT_REGION) return name;
  const dot = name.lastIndexOf(".");
  return dot > 0
    ? `${name.slice(0, dot)}.${regionId}${name.slice(dot)}`
    : `${name}.${regionId}`;
}

/** Public URL path for a region's data artifact (under /data). Melbourne
 * resolves to the exact URLs the live site fetches today. */
export function dataPath(regionId: RegionId, name: string): string {
  return `/data/${regionDataFile(regionId, name)}`;
}

export default REGIONS;
