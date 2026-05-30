import type { DomainId } from "./types";

/** ColorBrewer viridis-like sequential stops for 0–100 percentiles. */
export function percentileToColor(pct: number | null, nonResidential = false): string {
  if (nonResidential) return "#4a5568";
  if (pct == null) return "#64748b";
  const t = Math.max(0, Math.min(100, pct)) / 100;
  const r = Math.round(68 + (253 - 68) * t);
  const g = Math.round(1 + (231 - 1) * t);
  const b = Math.round(84 + (37 - 84) * t);
  return `rgb(${r},${g},${b})`;
}

export function domainProperty(domain: DomainId): string {
  return `pct_${domain}`;
}

export const DOMAIN_LABELS: Record<DomainId, string> = {
  affordability: "Affordability",
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
