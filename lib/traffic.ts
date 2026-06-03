/**
 * Traffic-exposure proximity layer (context / buyer-report only, never scored).
 *
 * Uses DTP "Annual Average Daily Traffic Volume" segments (measured/estimated
 * vehicles per day on arterials and highways - residential streets are not
 * counted). For a dropped pin we find the BUSIEST mapped road within a short
 * radius and report its measured volume + heavy-vehicle share. Honest by
 * construction: straight-line distance to a mapped arterial, not modelled noise
 * or a parcel result, and the latest published year is 2019.
 */

/** One AADT road segment: r=road name, v=AADT (veh/day), h=% heavy vehicles, c=[lng,lat] vertices. */
export type TrafficSegment = { r: string; v: number; h: number; c: [number, number][] };

export type NearestRoad = {
  road: string;
  aadt: number;
  heavyPct: number;
  distanceMeters: number;
};

const M_PER_DEG_LAT = 110574;
function mPerDegLng(lat: number): number {
  return 111320 * Math.cos((lat * Math.PI) / 180);
}

/** Squared distance (m^2) from origin (0,0) to segment AB, all in local metres. */
function distSqToSegment(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return ax * ax + ay * ay;
  let t = -(ax * dx + ay * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return cx * cx + cy * cy;
}

/** Distance (rounded m) from pin to one segment's polyline, local equirectangular. */
function segmentDistanceM(
  pin: [number, number],
  coords: [number, number][],
  kx: number,
  ky: number
): number {
  const [plng, plat] = pin;
  if (coords.length === 1) {
    const x = (coords[0][0] - plng) * kx;
    const y = (coords[0][1] - plat) * ky;
    return Math.round(Math.sqrt(x * x + y * y));
  }
  let bestSq = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const ax = (coords[i][0] - plng) * kx;
    const ay = (coords[i][1] - plat) * ky;
    const bx = (coords[i + 1][0] - plng) * kx;
    const by = (coords[i + 1][1] - plat) * ky;
    const d2 = distSqToSegment(ax, ay, bx, by);
    if (d2 < bestSq) bestSq = d2;
  }
  return Math.round(Math.sqrt(bestSq));
}

/**
 * The busiest (highest-AADT) mapped road within `radiusMeters` of the pin, or
 * null if no monitored road is that close. Busiest-not-nearest because a buyer's
 * concern is the big road near them, not the quiet slip lane they sit on.
 */
export function busiestRoadNear(
  pin: [number, number],
  segments: TrafficSegment[],
  radiusMeters = 250
): NearestRoad | null {
  if (!Array.isArray(segments) || segments.length === 0) return null;
  const kx = mPerDegLng(pin[1]);
  const ky = M_PER_DEG_LAT;
  let best: NearestRoad | null = null;
  for (const s of segments) {
    if (!s?.c || s.c.length === 0 || !Number.isFinite(s.v)) continue;
    const dist = segmentDistanceM(pin, s.c, kx, ky);
    if (dist > radiusMeters) continue;
    if (!best || s.v > best.aadt) {
      best = { road: s.r, aadt: Math.round(s.v), heavyPct: Math.round(s.h), distanceMeters: dist };
    }
  }
  return best;
}
