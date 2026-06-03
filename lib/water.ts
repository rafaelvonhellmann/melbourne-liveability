/**
 * Resolve which Victorian water corporation (retailer) services a point - the
 * "who's my water retailer" context for the Buyer Check / SA2 profile. Pure
 * (turf point-in-polygon), so it is unit-testable and deterministic. Context
 * only, never scored.
 */
import * as turf from "@turf/turf";
import type { Polygon, MultiPolygon } from "geojson";

export type WaterCorp = { name: string; url?: string; geometry: Polygon | MultiPolygon };

/** The water corporation whose boundary contains the point, or null. First match wins. */
export function waterRetailerAt(
  point: [number, number],
  corps: WaterCorp[] | null | undefined
): { name: string; url?: string } | null {
  if (!Array.isArray(corps) || corps.length === 0) return null;
  const pt = turf.point(point);
  for (const c of corps) {
    const g = c?.geometry;
    if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) continue;
    try {
      if (turf.booleanPointInPolygon(pt, g)) return { name: c.name, url: c.url };
    } catch {
      /* skip malformed geometry */
    }
  }
  return null;
}
