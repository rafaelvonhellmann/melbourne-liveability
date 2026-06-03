/**
 * Resolve which Victorian Government school zone(s) contain a point - the
 * address-level "what school am I zoned to" answer for the Buyer Check. Pure
 * (turf point-in-polygon only), so it is unit-testable and runs client-side
 * against a lazy-loaded, simplified zone set. Context only, never scored.
 *
 * Zones are POINT-specific (not SA2), so this is computed for a dropped pin, not
 * an area centroid. Boundaries are simplified for transport; the report always
 * tells the buyer to confirm the exact address on findmyschool.vic.gov.au.
 */
import * as turf from "@turf/turf";
import type { Feature, Polygon, MultiPolygon } from "geojson";

/** Compact zone-feature properties shipped to the client: s = school name, y = year level. */
export type SchoolZoneProps = { s: string; y?: string };
export type SchoolZoneFeature = Feature<Polygon | MultiPolygon, SchoolZoneProps>;
export type SchoolZonesData = {
  /** Boundary year of the zone set, e.g. 2026. */
  year?: number;
  primary: SchoolZoneFeature[];
  secondary: SchoolZoneFeature[];
};

/** School whose zone contains the point, or null if none does. First match wins. */
export function zoneSchoolAt(
  point: { lat: number; lng: number },
  feats: SchoolZoneFeature[] | null | undefined
): string | null {
  if (!Array.isArray(feats) || feats.length === 0) return null;
  const pt = turf.point([point.lng, point.lat]);
  for (const f of feats) {
    const g = f?.geometry;
    if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) continue;
    try {
      if (turf.booleanPointInPolygon(pt, g)) return f.properties?.s ?? null;
    } catch {
      /* skip malformed geometry */
    }
  }
  return null;
}

/** Primary + secondary (Year 7) zone schools containing the point. */
export function resolveSchoolZones(
  point: { lat: number; lng: number },
  data: SchoolZonesData | null | undefined
): { primary: string | null; secondary: string | null } {
  if (!data) return { primary: null, secondary: null };
  return {
    primary: zoneSchoolAt(point, data.primary),
    secondary: zoneSchoolAt(point, data.secondary),
  };
}
