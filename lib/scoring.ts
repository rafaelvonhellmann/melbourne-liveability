import type { DomainId, Place, ScoreBreakdown, ScoreWeights } from "./types";
import { V1_SCORED_DOMAINS } from "./domains";

/** Percentile-rank values within Greater Melbourne (0–100). Higher = better unless invert. */
export function percentileRank(
  values: { id: string; value: number }[],
  invert = false
): Map<string, number> {
  const sorted = [...values].sort((a, b) => a.value - b.value);
  const n = sorted.length;
  const out = new Map<string, number>();
  if (n === 0) return out;
  if (n === 1) {
    out.set(sorted[0].id, 50);
    return out;
  }
  for (let i = 0; i < n; i++) {
    const pct = (i / (n - 1)) * 100;
    out.set(sorted[i].id, invert ? 100 - pct : pct);
  }
  return out;
}

export function computeWeightedScore(
  place: Place,
  weights: ScoreWeights
): ScoreBreakdown {
  const components: ScoreBreakdown["components"] = [];
  let presentWeight = 0;

  for (const domain of V1_SCORED_DOMAINS) {
    const w = weights[domain] ?? 0;
    if (w <= 0) continue;
    const ds = place.domains[domain];
    const pct = ds?.percentile ?? null;
    const missing = pct == null;
    if (!missing) presentWeight += w;
    components.push({
      domain,
      weight: w,
      percentile: pct,
      contribution: 0,
      missing,
    });
  }

  let total = 0;
  for (const c of components) {
    if (c.missing || presentWeight <= 0) continue;
    const share = (c.weight / presentWeight) * (c.percentile ?? 0);
    c.contribution = share;
    total += share;
  }

  return { total, components };
}

export function rankPlaces(
  places: Place[],
  weights: ScoreWeights
): (Place & { breakdown: ScoreBreakdown })[] {
  return places
    .filter((p) => !p.nonResidential)
    .map((p) => ({ ...p, breakdown: computeWeightedScore(p, weights) }))
    .sort((a, b) => b.breakdown.total - a.breakdown.total);
}

export type { DomainId };
