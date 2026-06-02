import type { DomainId } from "./types";

/**
 * Colorblind-safe YlGnBu data ramp — the single data-encoding channel,
 * kept independent of the warm chrome theme. Five discrete bands across
 * 0–100 (floor(p/20)); no resident / null data uses a neutral grey.
 */
export const DATA_PALETTE = [
  "#ffffcc",
  "#a1dab4",
  "#41b6c4",
  "#2c7fb8",
  "#253494",
] as const;

export const NO_DATA_COLOR = "#d9d6cf";

/**
 * Hazard "risk" ramp — ColorBrewer Reds (sequential, single-hue, colorblind-safe
 * by lightness). Used ONLY for the optional bushfire / flood overlay-share layers,
 * where HIGH = more of the SA2 under a planning hazard overlay = deeper red. Kept
 * separate from the YlGnBu score ramp so risk reads as risk, not as a percentile.
 * Bands are overlay-share % thresholds (most SA2s sit at ~0, so the low band is
 * tight to surface any exposure).
 */
export const RISK_PALETTE = [
  "#fee5d9",
  "#fcae91",
  "#fb6a4a",
  "#de2d26",
  "#a50f15",
] as const;

/** Upper bound (%) of each RISK_PALETTE band except the last (open-ended). */
export const RISK_BANDS = [2, 10, 25, 50] as const;

export function riskToColor(share: number | null, nonResidential = false): string {
  if (nonResidential || share == null) return NO_DATA_COLOR;
  const v = Math.max(0, Math.min(100, share));
  let band = 0;
  for (let i = 0; i < RISK_BANDS.length; i++) if (v >= RISK_BANDS[i]) band = i + 1;
  return RISK_PALETTE[band];
}

export function percentileToColor(pct: number | null, nonResidential = false): string {
  if (nonResidential) return NO_DATA_COLOR;
  if (pct == null) return NO_DATA_COLOR;
  const clamped = Math.max(0, Math.min(100, pct));
  const band = Math.min(4, Math.floor(clamped / 20));
  return DATA_PALETTE[band];
}

/**
 * Readable foreground for text drawn on a data-palette swatch. The two lower
 * YlGnBu bands are light, so use ink; the upper bands are dark enough for white.
 */
export function percentileTextColor(pct: number | null): string {
  if (pct == null) return "#1A1A18";
  return Math.max(0, Math.min(100, pct)) < 60 ? "#1A1A18" : "#ffffff";
}

export function domainProperty(domain: DomainId): string {
  return `pct_${domain}`;
}

export const DOMAIN_LABELS: Record<DomainId, string> = {
  affordability: "Rental affordability",
  transport: "Transport",
  safety: "Crime / Safety",
  health: "Health",
  education: "Education",
  income: "Economy",
  hazards: "Hazards",
  socialHousing: "Social housing",
  equity: "Equity",
  population: "Community",
  environment: "Environment",
  politics: "Politics",
  greenSpace: "Green space",
};
