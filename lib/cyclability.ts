import type { Cyclability } from "./types";

/**
 * Cyclability index helpers (context-only, never scored).
 *
 * We compile OpenStreetMap cycling infrastructure - dedicated cycleways
 * (`highway=cycleway`), on-road bike lanes (`cycleway=*` tags on roads) and
 * bicycle-designated paths (`bicycle=designated`) - and summarise, per SA2, how
 * much cycle infrastructure exists relative to the SA2's land area.
 *
 * Honesty notes:
 *  - This is an *infrastructure density* measure, not a safety, comfort or
 *    connectivity rating. A high index means "more mapped cycle infrastructure
 *    per km²", not "good to cycle in".
 *  - OSM cycle tagging is community-maintained and uneven; separated paths vs
 *    painted on-road lanes are both counted (we record the split but do not
 *    weight them differently - distinguishing quality reliably needs far more
 *    tag parsing than OSM consistently provides).
 *  - Segments are attributed to the SA2 that contains their midpoint, so a long
 *    trail spanning two SA2s lands wholly in one. Coarse, documented.
 *  - Nothing here enters the composite score, its weights, or Data Confidence.
 */

/**
 * Density (km of cycle infrastructure per km² of SA2 land) at which the coarse
 * index saturates to 100. Chosen so dense inner-city SA2s (a few km of lanes
 * across a small area) land near the top without a hard outlier dominating.
 */
export const CYCLABILITY_SATURATION_KM_PER_KM2 = 4;

/**
 * "~15-min bike" reach radius drawn around the buyer pin. A conservative casual
 * urban speed (allowing for stops, lights and hills), NOT a sports pace - and
 * straight-line, like the walk radius, so it OVERSTATES real road-network reach
 * (rivers, freeways and rail are not subtracted). A range indicator, not routing.
 */
export const CYCLE_SPEED_KMH = 14;
export const CYCLE_MINUTES = 15;

/** Straight-line km coverable in `minutes` at `speedKmh`. */
export function bikeReachKm(minutes: number, speedKmh: number = CYCLE_SPEED_KMH): number {
  return (speedKmh * minutes) / 60;
}

/** Radius (km) of the ~15-min bike ring. */
export const CYCLE_THRESHOLD_KM = bikeReachKm(CYCLE_MINUTES);

export type CyclewayKind = "separated" | "on_road" | null;

/**
 * Classify an OSM way's tags as cycling infrastructure (and, when it is, whether
 * it is a separated path or an on-road lane). Returns `null` when the way is not
 * cycle infrastructure.
 */
export function classifyCycleway(
  tags: Record<string, string> | undefined
): CyclewayKind {
  if (!tags) return null;
  const highway = tags.highway ?? "";
  const bicycle = tags.bicycle ?? "";

  // Dedicated cycleway / bicycle-designated path → separated.
  if (highway === "cycleway") return "separated";
  if ((highway === "path" || highway === "footway") && bicycle === "designated") {
    return "separated";
  }
  if (highway !== "" && bicycle === "designated") return "separated";

  // On-road bike lanes tagged on the carriageway.
  const laneTags = [
    tags.cycleway,
    tags["cycleway:left"],
    tags["cycleway:right"],
    tags["cycleway:both"],
  ];
  const ON_ROAD = /^(lane|track|opposite_lane|opposite_track|shared_lane|share_busway|crossing|opposite)$/;
  if (laneTags.some((v) => v != null && ON_ROAD.test(v))) return "on_road";

  return null;
}

/**
 * Build the per-SA2 cyclability summary from already-aggregated lengths.
 *
 * `index` is a coarse 0–100 context measure: cycle-infrastructure density
 * (km per km²) saturating at {@link CYCLABILITY_SATURATION_KM_PER_KM2}. It is
 * deliberately NOT a percentile and NOT scored.
 */
export function summariseCyclability(
  input: {
    separatedKm: number;
    onRoadKm: number;
    segments: number;
    areaKm2: number;
  },
  opts: { sourceId: string; period: string }
): Cyclability {
  const separatedKm = Math.max(0, input.separatedKm);
  const onRoadKm = Math.max(0, input.onRoadKm);
  const cyclewayKm = separatedKm + onRoadKm;
  const areaKm2 = input.areaKm2 > 0 ? input.areaKm2 : 0;
  const densityKmPerKm2 = areaKm2 > 0 ? cyclewayKm / areaKm2 : 0;
  const index = Math.round(
    Math.min(1, densityKmPerKm2 / CYCLABILITY_SATURATION_KM_PER_KM2) * 100
  );

  return {
    cyclewayKm: Math.round(cyclewayKm * 100) / 100,
    separatedKm: Math.round(separatedKm * 100) / 100,
    onRoadKm: Math.round(onRoadKm * 100) / 100,
    areaKm2: Math.round(areaKm2 * 100) / 100,
    densityKmPerKm2: Math.round(densityKmPerKm2 * 1000) / 1000,
    index,
    segments: input.segments,
    sourceId: opts.sourceId,
    period: opts.period,
  };
}
