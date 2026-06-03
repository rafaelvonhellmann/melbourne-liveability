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
 * Context/display-only - compiled from open OSM data, never folded into the
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
  /** reachable / total × 100 - an availability summary, NOT a percentile rank. */
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
 * Cyclability index for an SA2 - context/display-only, never scored.
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
  /** cyclewayKm / areaKm² - km of cycle infrastructure per km². */
  densityKmPerKm2: number;
  /** Coarse 0–100 context index (saturating density). Not a percentile, not scored. */
  index: number;
  /** Number of cycleway segments attributed to the SA2. */
  segments: number;
  sourceId: string;
  period: string;
};

/**
 * Social-housing SUPPLY for an SA2 - context/display-only, never scored. The
 * share of occupied private dwellings that are social housing (public + community
 * landlord types), from the ABS 2021 Census tenure-and-landlord-type table. A
 * housing-mix fact, NOT a welfare/disadvantage measure (see lib/social-housing).
 */
export type SocialHousing = {
  statePct: number | null;
  communityPct: number | null;
  socialPct: number | null;
  dwellings: number | null;
  totalDwellings: number | null;
  sourceId: string;
  period: string;
};

/**
 * Housing stress for an SA2 - context/display-only, never scored. The share of
 * households spending more than 30% of income on housing (the standard ABS
 * "30/40" stress threshold), split by tenure: renting vs mortgaged. From the ABS
 * 2021 Census. A cost-pressure signal distinct from the median rent-vs-income
 * affordability score.
 */
export type HousingStress = {
  /** % of renting households paying >30% of income on rent. */
  rentStressPct: number | null;
  /** % of mortgaged households paying >30% of income on repayments. */
  mortgageStressPct: number | null;
  sourceId: string;
  period: string;
};

/**
 * Planning overlays affecting an SA2 - context/display-only, never scored. A
 * Heritage Overlay is a planning CONTROL (it can restrict demolition, external
 * changes and subdivision), not a hazard. We report the AREA SHARE of the SA2
 * within the overlay; it is NOT a parcel-level result - a buyer must check the
 * property's planning certificate. From Vicplan (DTP Victoria).
 */
/**
 * Conservation / restriction overlay codes we surface as an SA2 area share
 * (context only, never scored). ESO/SLO/VPO/EMO control development + vegetation;
 * EAO flags possible contamination; PAO can mean the land is reserved for
 * compulsory public acquisition. Distinct from the Heritage Overlay (HO) above.
 */
export type ConservationOverlayCode = "ESO" | "SLO" | "VPO" | "EMO" | "EAO" | "PAO";

export type PlanningOverlays = {
  /** % of the SA2 area within a Heritage Overlay (HO). Area share, not parcel-level. */
  heritageOverlayPct: number | null;
  /**
   * Per-overlay SA2 area share (0-100) for conservation/restriction overlays.
   * Context only, never scored; parcel-level still varies within the SA2.
   */
  overlays?: Partial<Record<ConservationOverlayCode, number>>;
  sourceId: string;
  period: string;
};

/**
 * Resident population + density for an SA2 - context/display-only, never scored.
 * Density = ABS ERP ÷ SA2 land area (km²). A size/intensity fact about the area.
 */
export type PopulationContext = {
  count: number | null;
  areaKm2: number | null;
  densityPerKm2: number | null;
  period: string;
  sourceId: string;
};

/** Sea-level-rise projection years we surface (DEECA Future Coasts scenarios). */
export type CoastalScenario = "2040" | "2070" | "2100";

/**
 * Coastal inundation (sea-level rise) exposure for an SA2 - context only, never
 * scored. The % of SA2 land under modelled inundation by projection year. A
 * PROJECTION/scenario at ~1:75,000, NOT a parcel-level result - never a verdict.
 */
export type CoastalInundation = {
  scenarioShares: Partial<Record<CoastalScenario, number>>;
  sourceId: string;
  period: string;
};

/**
 * Past-fire history exposure for an SA2 - context only, never scored. The % of
 * SA2 land mapped as burnt in the Vicmap fire-history record. HISTORY (where fire
 * has been), distinct from the forward-looking Bushfire Prone Area overlay; NOT
 * parcel-level, and public-land-biased (private-land fires recorded only from 2009).
 */
export type FireHistory = {
  burntPct: number | null;
  sourceId: string;
  period: string;
};

/**
 * Victoria in Future (VIF2023) SA2 projections - context only, never scored. A
 * modelled PROJECTION (not a forecast or target), at discrete 5-yearly years.
 * The forward-looking "Horizon" signal: where the area is headed for dwellings
 * (densification) and population.
 */
export type VifProjection = {
  /** Resident population projection, keyed by year string (e.g. "2021"). */
  population: Record<string, number>;
  /** Structural private dwelling projection, keyed by year string. */
  dwellings: Record<string, number>;
  sourceId: string;
  period: string;
};

/**
 * ABS Building Approvals by SA2 (BA_SA2) - dwelling units approved, the
 * "what's being built" pipeline signal. Context only, never scored. An APPROVAL
 * is a LEADING indicator of construction (it precedes, and does not guarantee,
 * completion) and counts the wider SA2, not a single street. We surface only
 * built-form + supply (houses vs higher-density, trailing-12-month volume and
 * trend) - never any inference about who lives or will live there.
 */
export type DevelopmentPipeline = {
  /** Most recent month present in the series (e.g. "2026-03"). */
  latestMonth: string;
  /** Total dwelling units approved in the trailing 12 months. */
  trailing12: number;
  /** Dwellings approved in the 12 months ending a year earlier (YoY trend); null if not fully covered. */
  prior12: number | null;
  /** Detached-house share of trailing-12 dwellings (0-100); null if zero base. */
  housePct: number | null;
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
    /** % of residents who completed Year 12 or equivalent (ABS Census 2021). */
    year12Pct?: number | null;
    sourceId: string;
    period: string;
  };
  walkAccess?: WalkAccess;
  cyclability?: Cyclability;
  socialHousing?: SocialHousing;
  housingStress?: HousingStress;
  planning?: PlanningOverlays;
  coastalInundation?: CoastalInundation;
  fireHistory?: FireHistory;
  projections?: VifProjection;
  developmentPipeline?: DevelopmentPipeline;
  population?: PopulationContext;
  environment?: { note: string };
  politics?: { note: string };
};

/**
 * Meta-measure of how well-measured an SA2 is - about our pipeline, NOT about
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

/** Geography at which a trend series is held - never mislabel LGA data as SA2. */
export type TimeseriesGeo = "sa2" | "lga" | "suburb";
export type TimeseriesCadence = "annual" | "quarterly" | "census-5yr";
export type TimeseriesCompareMode = "value" | "decile-only";

export type TimeseriesPoint = {
  period: string;
  values: Record<string, number>;
};

export type IndicatorSeries = {
  indicator: string;
  label: string;
  unit: string;
  geo: TimeseriesGeo;
  cadence: TimeseriesCadence;
  compareMode: TimeseriesCompareMode;
  higherIsBetter: boolean;
  periodLabel: string;
  sourceId: string;
  boundaryNote: string;
  points: TimeseriesPoint[];
};

export type TimeseriesFile = {
  generatedAt: string;
  series: Record<string, IndicatorSeries>;
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
