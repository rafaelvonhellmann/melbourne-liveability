/**
 * Resident-population + density context (display-only, never scored). Density =
 * ABS ERP resident count ÷ SA2 land area (km²). A size/intensity fact about the
 * area; population TREND is the separate ERP time series (see build-timeseries).
 */
import type { PopulationContext } from "./types";

export type { PopulationContext };

export function populationContext(
  count: number | null | undefined,
  areaKm2: number | null | undefined,
  opts: { sourceId: string; period: string }
): PopulationContext {
  const c = Number.isFinite(count as number) && (count as number) >= 0 ? (count as number) : null;
  const a =
    Number.isFinite(areaKm2 as number) && (areaKm2 as number) > 0 ? (areaKm2 as number) : null;
  return {
    count: c,
    areaKm2: a != null ? Math.round(a * 100) / 100 : null,
    densityPerKm2: c != null && a != null ? Math.round(c / a) : null,
    period: opts.period,
    sourceId: opts.sourceId,
  };
}
