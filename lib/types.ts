export type SourceMeta = {
  id: string;
  name: string;
  url: string;
  licence: string;
  period: string;
  fetchedAt: string;
};

export type DomainId =
  | "affordability"
  | "transport"
  | "safety"
  | "health"
  | "education"
  | "income"
  | "hazards"
  | "socialHousing"
  | "equity"
  | "population"
  | "environment"
  | "politics"
  | "greenSpace";

export type IndicatorValue = {
  raw: number | null;
  percentile: number | null;
  method:
    | "population-weighted"
    | "area-weighted"
    | "direct"
    | "proximity"
    | "precomputed"
    | null;
  sourceId: string;
  missing: boolean;
  stale: boolean;
};

export type DomainScore = {
  domain: DomainId;
  scored: boolean;
  percentile: number | null;
  subIndicators: Record<string, IndicatorValue>;
};

/**
 * "15-minute access" everyday-amenity walk reachability for an SA2.
 * Context/display-only — compiled from open OSM data, never folded into the
 * scored composite, weights, or Data Confidence. Distances are straight-line
 * from the population-weighted SA2 centroid (see methodology caveat).
 */
export type WalkAccess = {
  thresholdKm: number;
  /** Per key category: how many POIs fall within the walking threshold. */
  categories: Record<string, number>;
  /** How many of the key categories have at least one POI within reach. */
  reachable: number;
  /** Total number of key categories assessed. */
  total: number;
  /** reachable / total × 100 — an availability summary, NOT a percentile rank. */
  accessPct: number;
  /**
   * Coarse walkability index (0–100), context-only: blends everyday-amenity
   * category coverage with local amenity density. Not a Walk Score, not scored.
   */
  walkabilityIndex: number;
  sourceId: string;
  period: string;
};

/**
 * Cyclability index for an SA2 — context/display-only, never scored.
 * Compiled from open OSM cycling infrastructure; an infrastructure-density
 * measure, NOT a safety/comfort/connectivity rating (see methodology caveat).
 */
export type Cyclability = {
  /** Total cycle-infrastructure length attributed to the SA2 (km). */
  cyclewayKm: number;
  /** Separated cycleways / bicycle-designated paths (km). */
  separatedKm: number;
  /** On-road bike lanes tagged on the carriageway (km). */
  onRoadKm: number;
  /** SA2 land area (km²) used as the density denominator. */
  areaKm2: number;
  /** cyclewayKm / areaKm² — km of cycle infrastructure per km². */
  densityKmPerKm2: number;
  /** Coarse 0–100 context index (saturating density). Not a percentile, not scored. */
  index: number;
  /** Number of cycleway segments attributed to the SA2. */
  segments: number;
  sourceId: string;
  period: string;
};

/** Display-only context (never affects liveability rank). */
export type PlaceContext = {
  equity?: {
    irsadDecile: number | null;
    irsdDecile: number | null;
    sourceId: string;
    period: string;
  };
  community?: {
    renterPct: number | null;
    apartmentPct: number | null;
    firstNationsPct: number | null;
    sourceId: string;
    period: string;
  };
  walkAccess?: WalkAccess;
  cyclability?: Cyclability;
  environment?: { note: string };
  politics?: { note: string };
};

/**
 * Meta-measure of how well-measured an SA2 is — about our pipeline, NOT about
 * whether the place is good to live in. Display-only; never affects rank.
 */
export type DataConfidence = {
  /** 0–100 composite. */
  score: number;
  coverage: number;
  completeness: number;
  freshness: number;
  methodConfidence: number;
  counts: {
    total: number;
    direct: number;
    estimated: number;
    proximity: number;
    missing: number;
    stale: number;
  };
};

export type Place = {
  sa2Code: string;
  slug: string;
  name: string;
  lga: string;
  suburbAliases: string[];
  centroid: [number, number];
  nonResidential?: boolean;
  coverage?: number;
  domains: Partial<Record<DomainId, DomainScore>>;
  context?: PlaceContext;
  dataConfidence?: DataConfidence;
};

export type PoiType =
  | "hospital"
  | "gp"
  | "ndis"
  | "pharmacy"
  | "school"
  | "childcare"
  | "police"
  | "socialHousing";

export type Poi = {
  id: string;
  type: PoiType;
  name: string;
  coord: [number, number];
  sa2Code: string;
  sourceId: string;
};

export type ScoreWeights = Partial<Record<DomainId, number>>;

export type ScoreBreakdown = {
  total: number;
  components: {
    domain: DomainId;
    weight: number;
    percentile: number | null;
    contribution: number;
    missing: boolean;
  }[];
};
