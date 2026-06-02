/**
 * Social-housing SUPPLY signal (context-only, never scored).
 *
 * "Supply", deliberately, NOT a welfare or disadvantage measure: we report the
 * share of occupied private dwellings that are social housing (rented from a
 * State/Territory housing authority OR a community housing provider), from the
 * ABS 2021 Census tenure-and-landlord-type table (G37) at SA2. This is a
 * housing-mix fact about an area, not a judgement about the people who live
 * there. See DIGNITY-STANDARD.md — we map supply, never per-area welfare %.
 *
 * Nothing here enters the locked seven-domain composite, its weights, or Data
 * Confidence.
 */
import type { SocialHousing } from "./types";

export type { SocialHousing };

/** ABS 2021 Census G37 (Tenure and Landlord Type by Dwelling Structure), SA2. */
export const G37_SERVICE = "ABS_2021_Census_G37_SA2";
/** The G37 totals we need: state-authority + community-provider + grand total. */
export const G37_FIELDS = "sa2_code_2021,r_st_h_auth_total,r_com_hp_total,total_total";

/** One ABS-friendly decimal place; null passes through. */
function round1(n: number | null): number | null {
  return n == null ? null : Math.round(n * 10) / 10;
}

/**
 * Compute the social-housing supply summary for one SA2 from the G37 landlord
 * totals. Counts present but a zero/absent total → null percentages (we never
 * divide by zero or invent a rate). A clean zero count with a real total stays a
 * real 0% (a genuine "no social housing recorded here").
 */
export function computeSocialHousing(
  input: {
    stateAuthority: number | null;
    communityProvider: number | null;
    totalDwellings: number | null;
  },
  opts: { sourceId: string; period: string }
): SocialHousing {
  const state = Number.isFinite(input.stateAuthority as number)
    ? Math.max(0, input.stateAuthority as number)
    : null;
  const community = Number.isFinite(input.communityProvider as number)
    ? Math.max(0, input.communityProvider as number)
    : null;
  const total =
    Number.isFinite(input.totalDwellings as number) && (input.totalDwellings as number) > 0
      ? (input.totalDwellings as number)
      : null;

  const dwellings =
    state == null && community == null ? null : (state ?? 0) + (community ?? 0);

  const pct = (n: number | null): number | null =>
    n == null || total == null ? null : round1((n / total) * 100);

  return {
    statePct: pct(state),
    communityPct: pct(community),
    socialPct: pct(dwellings),
    dwellings,
    totalDwellings: total,
    sourceId: opts.sourceId,
    period: opts.period,
  };
}
