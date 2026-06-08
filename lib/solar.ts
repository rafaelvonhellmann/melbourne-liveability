/**
 * Rooftop-solar potential - a v2 lens. Honest caveat up front: open per-point
 * solar-irradiance data for Melbourne is weak (BoM's gridded NEII machine
 * endpoint was decommissioned in 2022, and annual irradiance barely varies across
 * the metro anyway), so this presents the published BoM Melbourne solar
 * climatology + a generation estimate, and points the user at the Sun & shadow
 * check for the variables that actually matter per property (orientation +
 * shading). Pure (no fetch). Context only - never scored.
 *
 * Figures: BoM average daily solar exposure for Melbourne ~14.4 MJ/m2/day annual
 * mean (~4.0 peak-sun-hours/day, ~1460 kWh/m2/yr). Source: Bureau of Meteorology.
 */
export const MELBOURNE_SOLAR = {
  mjPerDay: 14.4,
  peakSunHours: 4.0,
  kwhPerM2Year: 1460,
} as const;

/**
 * Rough annual generation (kWh) for a north-facing, lightly-shaded rooftop PV
 * system of `systemKw` in Melbourne: ~3.7 kWh per installed kW per day after
 * losses. Rounded to the nearest 100 kWh - it is an estimate, not a quote.
 */
export function estimateAnnualKwh(systemKw: number): number {
  return Math.round((systemKw * 3.7 * 365) / 100) * 100;
}

/** Near-optimal fixed panel tilt ~ the site's latitude (deg, positive). */
export function optimalTiltDeg(lat: number): number {
  return Math.round(Math.abs(lat));
}
