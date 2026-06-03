/**
 * Housing-stress context (context-only, never scored).
 *
 * The ABS "30%" housing-stress measure: the share of households spending more
 * than 30% of (imputed) household income on housing, split by tenure - renting
 * vs mortgaged. Direct ABS 2021 Census percentages at SA2 (stress_172021 rent,
 * stress_152021 mortgage), so we pass them through with a clamp/null-guard.
 *
 * This is a cost-PRESSURE distribution (how many households are stretched),
 * deliberately separate from the scored "Rent vs income" affordability ratio.
 * Nothing here enters the locked seven-domain composite.
 */
import type { HousingStress } from "./types";

export type { HousingStress };

/** ABS Family & community SA2 service - already fetched for tenure/dwelling too. */
export const STRESS_SERVICE = "ABS_Family_and_community_by_2021_SA2";
/** stress_152021 = mortgage >30% (%); stress_172021 = rent >30% (%). */
export const STRESS_FIELDS = "sa2_code_2021,stress_152021,stress_172021";

function clampPct(n: number | null): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(Math.max(0, Math.min(100, n)) * 10) / 10;
}

export function summariseHousingStress(
  input: { rentStress: number | null; mortgageStress: number | null },
  opts: { sourceId: string; period: string }
): HousingStress {
  return {
    rentStressPct: clampPct(input.rentStress),
    mortgageStressPct: clampPct(input.mortgageStress),
    sourceId: opts.sourceId,
    period: opts.period,
  };
}
