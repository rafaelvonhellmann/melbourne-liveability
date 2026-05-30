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
  environment?: { note: string };
  politics?: { note: string };
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
