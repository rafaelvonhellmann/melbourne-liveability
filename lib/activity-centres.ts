/**
 * Resolve whether a point sits in a designated Activity Centre Zone (ACZ) - the
 * statutory planning instrument that directs higher-density development to
 * Victoria's activity centres. The forward "where growth is steered" Horizon
 * signal. Context only, never scored. Pure (turf point-in-polygon), testable.
 *
 * HONESTY: ACZ covers only centres that have ADOPTED the zone - it is NOT the
 * full named Plan Melbourne activity-centre hierarchy (many centres still sit
 * under commercial zones). The report copy must say so.
 */
import * as turf from "@turf/turf";
import type { Feature, Polygon, MultiPolygon } from "geojson";

/** Compact ACZ feature: z = zone_code (ACZ1/ACZ2/...), lga = council name. */
export type ActivityCentreProps = { z: string; lga?: string };
export type ActivityCentreFeature = Feature<Polygon | MultiPolygon, ActivityCentreProps>;

/** The Activity Centre Zone containing the point, or null. First match wins. */
export function activityCentreAt(
  point: [number, number],
  feats: ActivityCentreFeature[] | null | undefined
): { zone: string; lga?: string } | null {
  if (!Array.isArray(feats) || feats.length === 0) return null;
  const pt = turf.point(point);
  for (const f of feats) {
    const g = f?.geometry;
    if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) continue;
    try {
      if (turf.booleanPointInPolygon(pt, g)) return { zone: f.properties?.z, lga: f.properties?.lga };
    } catch {
      /* skip malformed geometry */
    }
  }
  return null;
}
