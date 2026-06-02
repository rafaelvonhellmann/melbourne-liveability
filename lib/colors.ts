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

/**
 * Colourblind-safe score ramp — ColorBrewer RdYlBu (a documented CVD-safe
 * diverging palette). Same red/orange/yellow low-to-mid as RdYlGn, but the
 * "good" end is BLUE instead of green: red-vs-green is the exact pair that
 * deuteranopia/protanopia confound, and red-vs-blue is separable under every
 * common deficiency. Keeps the universal red=worse intuition; only the top half
 * changes hue. Toggled on by the user (see getScoreRamp); off by default so the
 * default map still reads green=good for the majority.
 */
export const SCORE_RAMP_CB: readonly (readonly [number, string])[] = [
  [0, "#d7191c"],
  [25, "#fdae61"],
  [50, "#ffffbf"],
  [75, "#abd9e9"],
  [100, "#2c7bb6"],
];

/** Pick the active score ramp. `true` = colourblind-safe RdYlBu, else RdYlGn. */
export function getScoreRamp(
  colorblind = false
): readonly (readonly [number, string])[] {
  return colorblind ? SCORE_RAMP_CB : SCORE_RAMP;
}

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

/**
 * Social-housing SUPPLY ramp — ColorBrewer Purples (sequential, single-hue,
 * colourblind-safe by lightness). Deliberately NOT the red risk ramp: more social
 * housing is a neutral housing-mix fact, not "risk". Used for the optional
 * social-housing context choropleth (share of dwellings that are social housing).
 */
export const SOCIAL_PALETTE = [
  "#f2f0f7",
  "#cbc9e2",
  "#9e9ac8",
  "#756bb1",
  "#54278f",
] as const;

/** Upper bound (%) of each SOCIAL_PALETTE band except the last (open-ended). */
export const SOCIAL_BANDS = [2, 5, 10, 15] as const;

export function socialToColor(share: number | null, nonResidential = false): string {
  if (nonResidential || share == null) return NO_DATA_COLOR;
  const v = Math.max(0, Math.min(100, share));
  let band = 0;
  for (let i = 0; i < SOCIAL_BANDS.length; i++) if (v >= SOCIAL_BANDS[i]) band = i + 1;
  return SOCIAL_PALETTE[band];
}

export function riskToColor(share: number | null, nonResidential = false): string {
  if (nonResidential || share == null) return NO_DATA_COLOR;
  const v = Math.max(0, Math.min(100, share));
  let band = 0;
  for (let i = 0; i < RISK_BANDS.length; i++) if (v >= RISK_BANDS[i]) band = i + 1;
  return RISK_PALETTE[band];
}

/** Continuous colour for a 0–100 percentile on the active score ramp. */
export function percentileToColor(
  pct: number | null,
  nonResidential = false,
  colorblind = false
): string {
  if (nonResidential || pct == null) return NO_DATA_COLOR;
  const ramp = getScoreRamp(colorblind);
  const v = Math.max(0, Math.min(100, pct));
  let lo = ramp[0];
  let hi = ramp[ramp.length - 1];
  for (let i = 0; i < ramp.length - 1; i++) {
    if (v >= ramp[i][0] && v <= ramp[i + 1][0]) {
      lo = ramp[i];
      hi = ramp[i + 1];
      break;
    }
  }
  const t = hi[0] === lo[0] ? 0 : (v - lo[0]) / (hi[0] - lo[0]);
  const a = hexToRgb(lo[1]);
  const b = hexToRgb(hi[1]);
  return rgbToHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}

/** WCAG relative luminance (0 = black, 1 = white) of an sRGB hex colour. */
function relativeLuminance(hex: string): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Readable foreground for text on a score swatch. Picked from the swatch's own
 * luminance so it stays legible on EITHER ramp (the RdYlBu "good" end is a
 * mid-blue that needs white, where RdYlGn's was dark green): dark ends and the
 * deep colours get white ink, the pale yellow/orange/light-blue middle gets dark.
 */
export function percentileTextColor(pct: number | null, colorblind = false): string {
  if (pct == null) return "#1A1A18";
  const v = Math.max(0, Math.min(100, pct));
  return relativeLuminance(percentileToColor(v, false, colorblind)) < 0.45
    ? "#ffffff"
    : "#1A1A18";
}

/**
 * Plain-language band for a 0–100 percentile — so a category reads "Strong" /
 * "Weak" at a glance instead of a bare number (user feedback: spell it out).
 * Honest framing: these are ranks RELATIVE to Greater Melbourne, not absolutes.
 */
export function percentileWord(pct: number | null): string {
  if (pct == null) return "No data";
  const v = Math.max(0, Math.min(100, pct));
  if (v >= 80) return "Excellent";
  if (v >= 60) return "Strong";
  if (v >= 40) return "Average";
  if (v >= 20) return "Below average";
  return "Weak";
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
