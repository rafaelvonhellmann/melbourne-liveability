import type { DomainId, Place } from "./types";
import { DOMAIN_LABELS } from "./colors";
import { V1_SCORED_DOMAINS } from "./domains";

/**
 * "Data coverage" - an honest, transparency-only description of what the data we
 * actually hold REPRESENTS for a given SA2, versus the drawn SA2 geography it is
 * joined to.
 *
 * Everything joins to ABS SA2 polygons, but the underlying data is collected at
 * a variety of real granularities (e.g. crime is recorded at suburb/LGA level
 * and allocated to the SA2 via crosswalk; some indicators are SA2-direct; some
 * SA2s have low/no resident data). This module derives that picture from fields
 * already present on the `Place` (per-indicator `method` / `sourceId` /
 * `missing` / `stale`, the `nonResidential` flag, and the Data Confidence
 * meta-measure). It introduces NO new numbers and is never part of any score.
 */

/**
 * Per-domain note on the real granularity / aggregation behind the data - the
 * honest answer to "what does this number actually measure for this area?".
 * Sourced from the methodology page; static so it cannot drift from the docs.
 */
export const DOMAIN_GRANULARITY: Record<DomainId, string> = {
  affordability:
    "Rent-to-income computed at SA2 level (ABS Census 2021 median rent ÷ ABS Data by Region income).",
  transport:
    "PT stops within 800 m and AM-peak frequency, computed at the SA2 centroid (PTV GTFS).",
  safety:
    "Crime recorded at suburb or council-area level and allocated to this SA2 via crosswalk (VCSA) - not resident point-level.",
  health:
    "Distance to the nearest public hospital and GP/clinic count within 2 km, by proximity (Vic MapShare + OSM).",
  education:
    "Schools within 2 km (OpenStreetMap) and preschool enrolment at SA2 (ABS Census 2021).",
  income:
    "Median household income at SA2 (ABS 2021) plus labour-force ratios (ABS Census 2016 - older).",
  hazards:
    "Share of SA2 land in bushfire/flood planning overlays (area-weighted; Vic planning overlays, not risk models).",
  socialHousing: "Social-housing context only - not scored.",
  equity: "ABS SEIFA deciles at SA2 - context only.",
  population: "ABS Census community indicators at SA2 - context only.",
  environment: "Deferred to v2 - not currently held.",
  politics: "Deferred to v2 - not currently held.",
  greenSpace: "Green-space context only.",
};

export type DomainCoverage = {
  domain: DomainId;
  label: string;
  /** True when the domain has a usable percentile for this SA2. */
  measured: boolean;
  /** Human-readable note on what the data actually represents. */
  granularity: string;
  /** Any sub-indicator flagged stale (older vintage). */
  stale: boolean;
  measuredIndicators: number;
  totalIndicators: number;
};

export type DataCoverageSummary = {
  /** SA2 excluded from baselines for low/no resident population. */
  nonResidential: boolean;
  measuredDomains: number;
  totalDomains: number;
  /** Labels of scored domains with no usable data here. */
  missingDomainLabels: string[];
  /** Labels of domains carrying a stale (older vintage) indicator. */
  staleDomainLabels: string[];
  confidenceScore: number | null;
  confidenceTier: "High" | "Moderate" | "Limited" | null;
  domains: DomainCoverage[];
};

function tierFor(score: number): "High" | "Moderate" | "Limited" {
  if (score >= 90) return "High";
  if (score >= 75) return "Moderate";
  return "Limited";
}

/**
 * Build the data-coverage summary for one place from already-present fields.
 * Pure and deterministic - safe to compute server-side or client-side.
 */
export function buildDataCoverage(place: Place): DataCoverageSummary {
  const domains: DomainCoverage[] = V1_SCORED_DOMAINS.map((id) => {
    const ds = place.domains[id];
    const subs = ds ? Object.values(ds.subIndicators) : [];
    const total = subs.length;
    const measuredIndicators = subs.filter((s) => !s.missing).length;
    return {
      domain: id,
      label: DOMAIN_LABELS[id],
      measured: ds?.percentile != null,
      granularity: DOMAIN_GRANULARITY[id],
      stale: subs.some((s) => s.stale),
      measuredIndicators,
      totalIndicators: total,
    };
  });

  const measuredDomains = domains.filter((d) => d.measured).length;
  const confidenceScore = place.dataConfidence?.score ?? null;

  return {
    nonResidential: place.nonResidential === true,
    measuredDomains,
    totalDomains: domains.length,
    missingDomainLabels: domains.filter((d) => !d.measured).map((d) => d.label),
    staleDomainLabels: domains.filter((d) => d.stale).map((d) => d.label),
    confidenceScore,
    confidenceTier: confidenceScore == null ? null : tierFor(confidenceScore),
    domains,
  };
}
