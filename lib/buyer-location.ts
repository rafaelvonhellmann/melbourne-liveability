/**
 * Pure geometry/aggregation helpers for the Buyer "Location Check" - what is
 * near a dropped pin, and which SA2 it falls in. Deliberately dependency-free
 * (no Turf) so it stays light in the client map bundle and runs at build time
 * for the static sample report. Straight-line distance only (same honesty
 * caveat as the 15-minute-access layer: not street-network routing).
 */
import type { Feature, FeatureCollection, Point, Polygon, MultiPolygon } from "geojson";
import { WALK_THRESHOLD_KM, type WalkCategoryId } from "./walk-access";

export type LngLat = [number, number];

/** Great-circle distance in km between two [lng, lat] points. */
export function haversineKm(a: LngLat, b: LngLat): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Ray-casting point-in-ring (ring = array of [lng, lat]). */
function pointInRing(pt: LngLat, ring: number[][]): boolean {
  let inside = false;
  const x = pt[0];
  const y = pt[1];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Point-in-polygon honouring holes + MultiPolygon. */
export function pointInPolygon(pt: LngLat, geom: Polygon | MultiPolygon): boolean {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys) {
    if (poly.length === 0) continue;
    if (!pointInRing(pt, poly[0] as number[][])) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) {
      if (pointInRing(pt, poly[h] as number[][])) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

export type Sa2Hit = { sa2Code?: string; slug?: string; name?: string };

/** Find the SA2 polygon containing a point (from places.geojson). */
export function findSa2ForPoint(
  pt: LngLat,
  fc: FeatureCollection
): Sa2Hit | null {
  for (const f of fc.features) {
    const g = f.geometry;
    if (g.type !== "Polygon" && g.type !== "MultiPolygon") continue;
    if (pointInPolygon(pt, g as Polygon | MultiPolygon)) {
      const p = (f.properties ?? {}) as Record<string, unknown>;
      return {
        sa2Code: typeof p.sa2Code === "string" ? p.sa2Code : undefined,
        slug: typeof p.slug === "string" ? p.slug : undefined,
        name: typeof p.name === "string" ? p.name : undefined,
      };
    }
  }
  return null;
}

export type AmenityHit = {
  category: string;
  count: number;
  /** Distance to the nearest POI in this category (km, straight-line). */
  nearestKm: number;
};

/**
 * Group POIs within `radiusKm` of a pin by their `pinType`, with count +
 * nearest distance. Returns a map keyed by category id.
 */
export function amenitiesNear(
  pin: LngLat,
  pois: Feature<Point>[],
  radiusKm: number = WALK_THRESHOLD_KM
): Map<string, AmenityHit> {
  const byCat = new Map<string, AmenityHit>();
  for (const f of pois) {
    const c = f.geometry?.coordinates as LngLat | undefined;
    if (!c || c.length < 2) continue;
    const d = haversineKm(pin, c);
    if (d > radiusKm) continue;
    const cat = String((f.properties as { pinType?: string })?.pinType ?? "");
    if (!cat) continue;
    const cur = byCat.get(cat);
    if (!cur) byCat.set(cat, { category: cat, count: 1, nearestKm: d });
    else {
      cur.count++;
      if (d < cur.nearestKm) cur.nearestKm = d;
    }
  }
  return byCat;
}

/** Whether a walk-category is reachable within the threshold, for the summary. */
export function reachableWalkCategories(
  byCat: Map<string, AmenityHit>,
  categories: readonly WalkCategoryId[]
): { id: WalkCategoryId; hit: AmenityHit | null }[] {
  return categories.map((id) => ({ id, hit: byCat.get(id) ?? null }));
}
