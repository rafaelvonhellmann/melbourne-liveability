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
  income: "Income",
  hazards: "Hazards",
  socialHousing: "Social housing",
  equity: "Equity",
  population: "Community",
  environment: "Environment",
  politics: "Politics",
  greenSpace: "Green space",
};
