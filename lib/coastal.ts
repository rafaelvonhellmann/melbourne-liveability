/**
 * Coastal inundation (sea-level rise) scenarios - context only, never scored.
 * DEECA Future Coasts modelled "land subject to inundation" by projection year,
 * presented as an SA2 area SHARE. NOT parcel-level (dataset ~1:75,000), and
 * always a PROJECTION/scenario, never a per-address flood verdict.
 */
import type { CoastalScenario, CoastalInundation } from "./types";

export type { CoastalScenario, CoastalInundation };

/**
 * The DEECA Future Coasts sea-level-rise scenarios we ingest, near-term first.
 * `layerId` is the CoastKit LCHAInundation MapServer child layer (resolve by
 * name if ids shift on republish). `slr` is the modelled sea-level rise.
 */
export const COASTAL_SCENARIOS: {
  key: CoastalScenario;
  layerId: number;
  label: string;
  slr: string;
}[] = [
  { key: "2040", layerId: 4, label: "2040", slr: "0.2 m" },
  { key: "2070", layerId: 5, label: "2070", slr: "0.5 m" },
  { key: "2100", layerId: 6, label: "2100", slr: "0.8 m" },
];

export type CoastalShares = Partial<Record<CoastalScenario, number>>;

/** Whether any scenario shows a non-trivial inundation share (>= minPct). */
export function hasCoastalExposure(
  shares: CoastalShares | null | undefined,
  minPct = 1
): boolean {
  if (!shares) return false;
  return COASTAL_SCENARIOS.some((s) => (shares[s.key] ?? 0) >= minPct);
}

/**
 * The longest-horizon scenario whose share is >= minPct (the 2100 share is the
 * largest), used for the buyer-finding headline. Null when none is material.
 */
export function worstCoastalScenario(
  shares: CoastalShares | null | undefined,
  minPct = 1
): { label: string; slr: string; pct: number } | null {
  if (!shares) return null;
  let worst: { label: string; slr: string; pct: number } | null = null;
  for (const s of COASTAL_SCENARIOS) {
    const pct = shares[s.key] ?? 0;
    if (pct >= minPct) worst = { label: s.label, slr: s.slr, pct };
  }
  return worst;
}
