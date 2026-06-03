import type { DomainId, ScoreWeights } from "./types";
import { V1_SCORED_DOMAINS, defaultV1Weights } from "./domains";

export function parseWeightsFromSearchParams(
  search: string
): ScoreWeights | null {
  const params = new URLSearchParams(search);
  const raw = params.get("w");
  if (!raw) return null;

  const weights: ScoreWeights = {};
  for (const part of raw.split(",")) {
    const [key, val] = part.split(":");
    if (!key || val == null) continue;
    const n = Number(val);
    if (!Number.isFinite(n)) continue;
    weights[key as DomainId] = n;
  }
  return Object.keys(weights).length > 0 ? weights : null;
}

export function serializeWeights(weights: ScoreWeights): string {
  return V1_SCORED_DOMAINS.filter((d) => weights[d] != null)
    .map((d) => `${d}:${weights[d]}`)
    .join(",");
}

/**
 * Fill any missing scored domains from defaults and clamp each to >= 0, WITHOUT
 * rescaling to sum 100. Used for the live priority sliders: scoring already
 * normalizes by the weight RATIOS (computeWeightedScore divides by the present
 * weight), so rescaling here only made sliders "fight" the user - drag one up and
 * every value jumped. Keep raw values; let the score do the normalising.
 */
export function mergeWeights(input: ScoreWeights): ScoreWeights {
  const merged: ScoreWeights = { ...defaultV1Weights(), ...input };
  for (const d of V1_SCORED_DOMAINS) merged[d] = Math.max(0, merged[d] ?? 0);
  return merged;
}

export function normalizeWeights(input: ScoreWeights): ScoreWeights {
  const defaults = defaultV1Weights();
  const merged: ScoreWeights = { ...defaults, ...input };
  let sum = 0;
  for (const d of V1_SCORED_DOMAINS) {
    const v = merged[d] ?? 0;
    merged[d] = Math.max(0, v);
    sum += merged[d]!;
  }
  if (sum <= 0) return defaults;
  for (const d of V1_SCORED_DOMAINS) {
    merged[d] = Math.round((merged[d]! / sum) * 100);
  }
  const drift =
    100 - V1_SCORED_DOMAINS.reduce((s, d) => s + (merged[d] ?? 0), 0);
  if (drift !== 0) merged[V1_SCORED_DOMAINS[0]] = (merged[V1_SCORED_DOMAINS[0]] ?? 0) + drift;
  return merged;
}

export function getDefaultWeights(): ScoreWeights {
  return defaultV1Weights();
}
