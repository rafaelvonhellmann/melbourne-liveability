import type { DomainId } from "./types";

/**
 * Score ramp — diverging Red→Yellow→Green (ColorBrewer RdYlGn). Low percentile
 * (worse) = red, high (better) = green, interpolated CONTINUOUSLY so close-but-
 * different areas no longer look identical (the old 5-band YlGnBu flattened the
 * granularity and "blue = good" wasn't intuitive). Red=worse is the universal
 * map intuition; the strong lightness change + yellow midpoint keep the ends
 * distinguishable even with red-green colour vision deficiency.
 */
export const SCORE_RAMP: readonly (readonly [number, string])[] = [
  [0, "#d7191c"],
  [25, "#fdae61"],
  [50, "#ffffbf"],
  [75, "#a6d96a"],
  [100, "#1a9641"],
];

export const NO_DATA_COLOR = "#d9d6cf";

function hexToRgb(h: string): [number, number, number] {
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

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

/** Continuous colour for a 0–100 percentile on the score ramp. */
export function percentileToColor(pct: number | null, nonResidential = false): string {
  if (nonResidential || pct == null) return NO_DATA_COLOR;
  const v = Math.max(0, Math.min(100, pct));
  let lo = SCORE_RAMP[0];
  let hi = SCORE_RAMP[SCORE_RAMP.length - 1];
  for (let i = 0; i < SCORE_RAMP.length - 1; i++) {
    if (v >= SCORE_RAMP[i][0] && v <= SCORE_RAMP[i + 1][0]) {
      lo = SCORE_RAMP[i];
      hi = SCORE_RAMP[i + 1];
      break;
    }
  }
  const t = hi[0] === lo[0] ? 0 : (v - lo[0]) / (hi[0] - lo[0]);
  const a = hexToRgb(lo[1]);
  const b = hexToRgb(hi[1]);
  return rgbToHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}

/**
 * Readable foreground for text on a score swatch. The red (low) and green (high)
 * ends are dark enough for white; the orange→yellow→light-green middle needs ink.
 */
export function percentileTextColor(pct: number | null): string {
  if (pct == null) return "#1A1A18";
  const v = Math.max(0, Math.min(100, pct));
  return v < 15 || v > 85 ? "#ffffff" : "#1A1A18";
}

export function domainProperty(domain: DomainId): string {
  return `pct_${domain}`;
}

export const DOMAIN_LABELS: Record<DomainId, string> = {
  affordability: "Rent vs income",
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
