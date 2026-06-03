import type {
  IndicatorSeries,
  Place,
  TimeseriesCadence,
  TimeseriesCompareMode,
  TimeseriesFile,
  TimeseriesGeo,
} from "./types";

/**
 * Resolved trend for a single indicator at a single place - the flat, ready-to-
 * render shape the sparkline UI consumes. Context only, never scored.
 */
export type PlaceSeries = {
  indicator: string;
  label: string;
  unit: string;
  geo: TimeseriesGeo;
  cadence: TimeseriesCadence;
  compareMode: TimeseriesCompareMode;
  higherIsBetter: boolean;
  periodLabel: string;
  sourceId: string;
  boundaryNote: string;
  /** Ordered real points - never interpolated. */
  points: { period: string; value: number }[];
};

/**
 * LGA name aliases that changed between the ABS crosswalk vintage (place.lga)
 * and the Crime Statistics Agency release. Moreland was renamed Merri-bek in
 * 2022; the boundary is unchanged, only the name. Keyed normalised→normalised.
 */
const LGA_ALIASES: Record<string, string> = {
  moreland: "merri-bek",
};

/**
 * Normalise an LGA name to a stable lookup key: lowercase, drop the "(Vic.)"
 * style state qualifier, collapse whitespace, then apply known rename aliases.
 * Used identically when emitting series keys (build) and resolving them (page).
 */
export function normaliseLgaKey(lga: string): string {
  const base = lga
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return LGA_ALIASES[base] ?? base;
}

/** The area key a given series uses for a place, honouring the series geography. */
function areaKeyFor(place: Place, geo: TimeseriesGeo): string | null {
  if (geo === "sa2") return place.sa2Code;
  if (geo === "lga") return normaliseLgaKey(place.lga);
  return null;
}

/** Extract this place's ordered points from an indicator series (real points only). */
function pointsForPlace(
  series: IndicatorSeries,
  place: Place
): { period: string; value: number }[] {
  const key = areaKeyFor(place, series.geo);
  if (!key) return [];
  const out: { period: string; value: number }[] = [];
  for (const pt of series.points) {
    const v = pt.values[key];
    if (v != null && Number.isFinite(v)) out.push({ period: pt.period, value: v });
  }
  return out;
}

/**
 * Resolve every indicator series for a place into flat {period,value} arrays.
 * Returns only indicators with at least one real point for this area. The
 * minimum-points gate (≥3) for showing a sparkline is applied at the UI layer.
 */
export function resolvePlaceSeries(
  place: Place,
  file: TimeseriesFile | null | undefined
): Record<string, PlaceSeries> {
  const out: Record<string, PlaceSeries> = {};
  if (!file?.series) return out;
  for (const [key, series] of Object.entries(file.series)) {
    const points = pointsForPlace(series, place);
    if (points.length === 0) continue;
    out[key] = {
      indicator: series.indicator,
      label: series.label,
      unit: series.unit,
      geo: series.geo,
      cadence: series.cadence,
      compareMode: series.compareMode,
      higherIsBetter: series.higherIsBetter,
      periodLabel: series.periodLabel,
      sourceId: series.sourceId,
      boundaryNote: series.boundaryNote,
      points,
    };
  }
  return out;
}

/** Minimum real points required before we draw a trend line (else: no-trend note). */
export const MIN_TREND_POINTS = 3;

/** A short human label for the series geography, used to avoid implying SA2 precision. */
export function geoLabel(geo: TimeseriesGeo): string {
  switch (geo) {
    case "sa2":
      return "SA2-level series";
    case "lga":
      return "LGA-level series";
    case "suburb":
      return "Suburb-level series";
  }
}
