/**
 * Nearest EPA Victoria air-monitoring site to a point - the "air quality
 * monitored nearby" context for the Buyer Check. Context only, never scored.
 *
 * The EPA AirWatch network is sparse (~90 fixed sites statewide), so the nearest
 * monitor can be several km away, and readings are HOURLY while this site is
 * static - so the report shows the captured band as a DATED snapshot and always
 * points to live AirWatch. Pure (haversine), unit-testable.
 */

/** Compact shipped site: n=name, lat/lon, b=health-advice band, p=parameter, t=reading time (ISO). */
export type EpaAirSite = {
  n: string;
  lat: number;
  lon: number;
  b?: string | null;
  p?: string | null;
  t?: string | null;
};

export type NearestAirSite = {
  name: string;
  distanceMeters: number;
  band: string | null;
  param: string | null;
  since: string | null;
};

const R = 6371000; // earth radius m
function haversineM(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Nearest air-monitoring site to `pin` ([lng, lat]); null if none provided. */
export function nearestAirSite(
  pin: [number, number],
  sites: EpaAirSite[] | null | undefined
): NearestAirSite | null {
  if (!Array.isArray(sites) || sites.length === 0) return null;
  const [plng, plat] = pin;
  let best: EpaAirSite | null = null;
  let bestM = Infinity;
  for (const s of sites) {
    if (!Number.isFinite(s?.lat) || !Number.isFinite(s?.lon)) continue;
    const d = haversineM(plng, plat, s.lon, s.lat);
    if (d < bestM) {
      bestM = d;
      best = s;
    }
  }
  if (!best) return null;
  return {
    name: best.n,
    distanceMeters: Math.round(bestM),
    band: best.b ?? null,
    param: best.p ?? null,
    since: best.t ?? null,
  };
}
