import type { DomainId, Place } from "./types";
import { METRIC_CATALOG } from "./metric-catalog";

/**
 * Greater-Melbourne benchmark statistics for a raw indicator — the distribution
 * an area is compared against on its metric card. Computed across residential
 * SA2s only (the same baseline the percentiles are ranked within), so the band
 * shown on a card is consistent with the percentile we already store.
 */
export type BenchmarkStats = {
  count: number;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  mean: number;
};

/** Linear-interpolated quantile of an ascending-sorted, finite array. */
export function quantileSorted(sorted: number[], q: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const clamped = Math.max(0, Math.min(1, q));
  const pos = (n - 1) * clamped;
  const base = Math.floor(pos);
  const rest = pos - base;
  const lower = sorted[base];
  const upper = sorted[base + 1];
  return upper === undefined ? lower : lower + rest * (upper - lower);
}

/** Summary statistics for a set of raw values. Returns null when empty. */
export function computeBenchmark(values: number[]): BenchmarkStats | null {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return null;
  const sorted = [...finite].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    p25: quantileSorted(sorted, 0.25),
    median: quantileSorted(sorted, 0.5),
    p75: quantileSorted(sorted, 0.75),
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
  };
}

export type GmBenchmarks = Partial<
  Record<DomainId, Record<string, BenchmarkStats>>
>;

/**
 * Compute the Greater-Melbourne benchmark distribution for every catalogued
 * indicator from the full places dataset (residential SA2s only). Pure and
 * deterministic — intended to run server-side at build in the place page and be
 * passed to the client; it adds no new fetched data file.
 */
export function computeGmBenchmarks(places: Place[]): GmBenchmarks {
  const out: GmBenchmarks = {};
  for (const def of METRIC_CATALOG) {
    const values: number[] = [];
    for (const p of places) {
      if (p.nonResidential) continue;
      const raw = p.domains[def.domain]?.subIndicators?.[def.key]?.raw;
      if (raw != null && Number.isFinite(raw)) values.push(raw);
    }
    const stats = computeBenchmark(values);
    if (stats) {
      (out[def.domain] ??= {})[def.key] = stats;
    }
  }
  return out;
}
