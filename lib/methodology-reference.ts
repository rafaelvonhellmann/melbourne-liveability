import type { DomainId } from "./types";

/**
 * Reference mapping: how each SCORED indicator is sourced and joined to SA2.
 * Keyed by the metric-catalog key; mirrors the source assignments in
 * scripts/score.ts + scripts/normalize.ts. Kept here (not in score.ts, which is
 * a build script) so the /methodology page can render an honest "what / where /
 * how" table without importing the pipeline.
 */
export type IndicatorSourcing = {
  /** sourceId into data/generated/sources.json (resolve with getSource). */
  sourceId: string;
  /** The data's REAL granularity before it is attributed to an SA2. */
  geography: string;
  /** How the raw value is turned into an SA2 value. */
  method: string;
};

export const SCORED_INDICATOR_SOURCING: Record<string, IndicatorSourcing> = {
  rentToIncome: {
    sourceId: "abs-rent-to-income-2021",
    geography: "SA2 (ABS, direct)",
    method: "Direct — median weekly rent ÷ equivalised household income",
  },
  stops800m: {
    sourceId: "ptv-gtfs",
    geography: "Stop coordinates",
    method: "Proximity — stops within 800 m of the SA2 centroid (GTFS precompute)",
  },
  amPeakFreq: {
    sourceId: "ptv-gtfs",
    geography: "Stop coordinates",
    method: "Proximity — weekday 07:00–09:59 scheduled trips at nearby stops",
  },
  ptModes: {
    sourceId: "ptv-gtfs",
    geography: "Stop coordinates",
    method: "Proximity — distinct modes (train/tram/bus) reachable",
  },
  propertyCrime: {
    sourceId: "vcsa-recorded-offences",
    geography: "Suburb (Table 03) / LGA (Table 02)",
    method: "Crosswalk to SA2 (population-weighted, area-weighted fallback)",
  },
  violentCrime: {
    sourceId: "vcsa-recorded-offences",
    geography: "Suburb (Table 03) / LGA (Table 02)",
    method: "Crosswalk to SA2 (population-weighted, area-weighted fallback)",
  },
  hospitalDistKm: {
    sourceId: "vic-mapshare-hospitals",
    geography: "Point coordinates",
    method: "Proximity — straight-line distance to the nearest public hospital",
  },
  gpCount2km: {
    sourceId: "osm-health",
    geography: "Point coordinates (OSM nodes)",
    method: "Proximity — count of GP/clinic nodes within 2 km (nodes only; see caveat)",
  },
  medianDhi: {
    sourceId: "abs-sa2-income-dbr",
    geography: "SA2 (ABS, direct)",
    method: "Direct",
  },
  employmentRatio: {
    sourceId: "abs-census-labour-2016",
    geography: "SA2 (ABS, direct)",
    method: "Direct (Census 2016)",
  },
  participationRate: {
    sourceId: "abs-census-labour-2016",
    geography: "SA2 (ABS, direct)",
    method: "Direct (Census 2016)",
  },
  bushfirePct: {
    sourceId: "vic-planning-bpa",
    geography: "Regulatory polygon overlay",
    method: "Area-weighted — share of SA2 land inside the overlay",
  },
  floodPct: {
    sourceId: "vic-planning-flood",
    geography: "Regulatory polygon overlay",
    method: "Area-weighted — share of SA2 land inside the overlay",
  },
  schools2km: {
    sourceId: "osm-schools",
    geography: "Point coordinates (OSM)",
    method: "Proximity — count within 2 km of the SA2 centroid",
  },
  preschoolEnrolled: {
    sourceId: "abs-census-preschool-2021",
    geography: "SA2 (ABS, direct)",
    method: "Direct (Census 2021)",
  },
};

/** Context features (never scored): what they are, where they're from, how used. */
export type ContextSourcing = {
  label: string;
  sourceId: string;
  geography: string;
  use: string;
};

export const CONTEXT_SOURCING: ContextSourcing[] = [
  {
    label: "Equity — SEIFA IRSAD / IRSD deciles",
    sourceId: "abs-seifa-2021",
    geography: "SA2 (direct)",
    use: "Equity panel + optional map layer",
  },
  {
    label: "Community — tenure, dwelling mix, First Nations %",
    sourceId: "abs-census-community-2021",
    geography: "SA2 (direct)",
    use: "Community panel",
  },
  {
    label: "Population trend (ERP)",
    sourceId: "abs-erp-sa2-series",
    geography: "SA2 (direct, 2001–2023)",
    use: "Profile trend sparkline",
  },
  {
    label: "15-minute access — everyday amenities",
    sourceId: "osm-amenities",
    geography: "Points → SA2 centroid (straight-line)",
    use: "Walk-access panel + map layer",
  },
  {
    label: "Cyclability — cycle infrastructure",
    sourceId: "osm-cycleways",
    geography: "Ways → SA2 (segment midpoint)",
    use: "Cyclability panel + map layer",
  },
  {
    label: "Post offices",
    sourceId: "osm-post",
    geography: "Point coordinates (OSM)",
    use: "Map pins only",
  },
  {
    label: "Pathology labs / NDIS-related providers",
    sourceId: "osm-clinical-social",
    geography: "Point coordinates (OSM, sparsely tagged)",
    use: "Map pins only — coverage limited, badge to follow",
  },
];

/** Scored domains in display order, with their default ULTRAPLAN §1 weights. */
export const SCORED_DOMAIN_ORDER: { id: DomainId; weight: number }[] = [
  { id: "affordability", weight: 30 },
  { id: "transport", weight: 18 },
  { id: "safety", weight: 14 },
  { id: "health", weight: 14 },
  { id: "hazards", weight: 8 },
  { id: "education", weight: 8 },
  { id: "income", weight: 8 },
];
