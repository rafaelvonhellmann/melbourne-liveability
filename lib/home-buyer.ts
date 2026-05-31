import type { Place } from "./types";
import { percentileRank } from "./scoring";

/**
 * Home-buyer index — a CONTEXT LENS, never part of the locked 7-domain
 * composite, its weights, or Data Confidence.
 *
 * It blends indicators ALREADY in the dataset into a single 0–100 figure
 * oriented to someone buying a home. It is honest about its inputs:
 *  - We have NO dwelling sale-price data. This index does NOT estimate price,
 *    value-for-money, or capital growth.
 *  - "Affordability" here is the existing rent-to-income + mortgage/tenure
 *    context indicator (a cost-pressure proxy), not a purchase-price measure.
 *  - Each factor is an existing Greater-Melbourne percentile rank (0–100),
 *    except walk access, which reuses the context-only walkability index (0–100).
 *
 * The composite is a weighted blend of those 0–100 inputs; present-weight
 * renormalisation handles missing factors (mirrors `computeWeightedScore`).
 * `rankHomeBuyerPercentiles` then converts composites to a true percentile
 * rank within Greater Melbourne when the full place list is available.
 */

export type HomeBuyerFactorId =
  | "affordability"
  | "safety"
  | "education"
  | "transport"
  | "hazards"
  | "walkAccess";

export type HomeBuyerFactorConfig = {
  id: HomeBuyerFactorId;
  label: string;
  /** Configured weight (the set sums to 1). */
  weight: number;
  note: string;
};

/**
 * Documented home-buyer weighting. Sums to 1.0. Tilted toward the things that
 * matter most when committing to a purchase: cost pressure, safety, schools,
 * transport access, low hazard exposure, and everyday walk access.
 */
export const HOME_BUYER_FACTORS: HomeBuyerFactorConfig[] = [
  {
    id: "affordability",
    label: "Affordability / cost pressure",
    weight: 0.28,
    note: "Rent-to-income cost-pressure proxy (no sale-price data).",
  },
  {
    id: "safety",
    label: "Safety",
    weight: 0.18,
    note: "Recorded crime (suburb/LGA → SA2).",
  },
  {
    id: "education",
    label: "Schools & education",
    weight: 0.16,
    note: "Schools within 2 km + preschool enrolment.",
  },
  {
    id: "transport",
    label: "Transport",
    weight: 0.14,
    note: "PT stops + AM-peak frequency.",
  },
  {
    id: "hazards",
    label: "Low hazard exposure",
    weight: 0.14,
    note: "Lower bushfire/flood overlay share scores higher.",
  },
  {
    id: "walkAccess",
    label: "Walk access to amenities",
    weight: 0.1,
    note: "15-min walkability index (context-only).",
  },
];

export type HomeBuyerFactor = HomeBuyerFactorConfig & {
  /** 0–100 input value for this place, or null when missing. */
  value: number | null;
  missing: boolean;
  /** Points this factor contributed to the composite (0–100 scale). */
  contribution: number;
};

export type HomeBuyerIndex = {
  /** 0–100 weighted composite (present-weight renormalised), or null. */
  value: number | null;
  factors: HomeBuyerFactor[];
  measured: number;
  total: number;
};

/** Pull the 0–100 input for one factor from existing place fields. */
function factorValue(place: Place, id: HomeBuyerFactorId): number | null {
  if (id === "walkAccess") {
    return place.context?.walkAccess?.walkabilityIndex ?? null;
  }
  return place.domains[id]?.percentile ?? null;
}

/**
 * Compute the home-buyer composite for one place from existing fields only.
 * Pure and deterministic.
 */
export function computeHomeBuyerIndex(place: Place): HomeBuyerIndex {
  const factors: HomeBuyerFactor[] = HOME_BUYER_FACTORS.map((f) => {
    const value = factorValue(place, f.id);
    return {
      ...f,
      value,
      missing: value == null,
      contribution: 0,
    };
  });

  const presentWeight = factors
    .filter((f) => !f.missing)
    .reduce((s, f) => s + f.weight, 0);

  let value: number | null = null;
  if (presentWeight > 0) {
    let total = 0;
    for (const f of factors) {
      if (f.missing) continue;
      const share = (f.weight / presentWeight) * (f.value ?? 0);
      f.contribution = share;
      total += share;
    }
    value = total;
  }

  return {
    value,
    factors,
    measured: factors.filter((f) => !f.missing).length,
    total: factors.length,
  };
}

/**
 * Rank the home-buyer composite into a true percentile within Greater Melbourne
 * across residential SA2s. Returns a map of slug → percentile (0–100). Places
 * with no computable composite are omitted.
 */
export function rankHomeBuyerPercentiles(places: Place[]): Map<string, number> {
  const values: { id: string; value: number }[] = [];
  for (const p of places) {
    if (p.nonResidential) continue;
    const idx = computeHomeBuyerIndex(p);
    if (idx.value != null) values.push({ id: p.slug, value: idx.value });
  }
  return percentileRank(values);
}
