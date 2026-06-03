/**
 * Victoria in Future (VIF2023) projection helpers - context only, never scored.
 * A modelled PROJECTION at SA2 level (not a forecast/target); only 5-yearly years
 * (2021/2026/2031/2036) are published, so we never interpolate between them.
 */
import type { VifProjection } from "./types";

export type { VifProjection };

export const VIF_BASE_YEAR = "2021";
export const VIF_HORIZON_YEAR = "2036";

function growth(rec: Record<string, number> | undefined): number | null {
  if (!rec) return null;
  const base = rec[VIF_BASE_YEAR];
  const horizon = rec[VIF_HORIZON_YEAR];
  if (!Number.isFinite(base) || !Number.isFinite(horizon) || !base) return null;
  return Math.round(((horizon - base) / base) * 1000) / 10; // % to 1 dp
}

/** Projected 2021 -> 2036 growth (%), population + dwellings; null if unknown. */
export function projectedGrowth(proj: VifProjection | null | undefined): {
  populationGrowthPct: number | null;
  dwellingGrowthPct: number | null;
} {
  return {
    populationGrowthPct: growth(proj?.population),
    dwellingGrowthPct: growth(proj?.dwellings),
  };
}
