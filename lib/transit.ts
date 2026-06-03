/**
 * Nearest train-station distance (context/buyer-report only, never scored). A
 * commute-convenience signal: straight-line distance from the pin to the nearest
 * mapped train station (OSM railway=station/halt). Straight-line, not walking
 * distance - the walk can be longer, and frequency/line matter too.
 */

export type Station = { name: string; coord: [number, number] };

const M_PER_DEG_LAT = 110574;
function mPerDegLng(lat: number): number {
  return 111320 * Math.cos((lat * Math.PI) / 180);
}

export type NearestStation = { name: string; distanceM: number };

/** The nearest station to `pin` (straight-line metres), or null if none given. */
export function nearestStation(
  pin: [number, number],
  stations: Station[]
): NearestStation | null {
  const [plng, plat] = pin;
  const kx = mPerDegLng(plat);
  const ky = M_PER_DEG_LAT;
  let best: NearestStation | null = null;
  for (const s of stations) {
    if (!s.coord || s.coord.length < 2) continue;
    const x = (s.coord[0] - plng) * kx;
    const y = (s.coord[1] - plat) * ky;
    const d = Math.round(Math.sqrt(x * x + y * y));
    if (!best || d < best.distanceM) best = { name: s.name, distanceM: d };
  }
  return best;
}

/** A GTFS bus stop: [lng, lat, distinct weekday bus-route count]. */
export type BusStop = [number, number, number];
export type NearestBus = { distanceM: number; routeCount: number; stopsWithin400: number };

/**
 * Nearest bus stop to `pin` (straight-line metres) + that stop's distinct
 * weekday bus-route count + how many bus stops sit within 400 m. Route counts
 * are per-stop (the feed gives counts, not ids), so they are NOT summed across
 * stops - the nearest stop's count is reported as-is.
 */
export function nearestBusStop(
  pin: [number, number],
  stops: BusStop[] | null | undefined
): NearestBus | null {
  if (!Array.isArray(stops) || stops.length === 0) return null;
  const [plng, plat] = pin;
  const kx = mPerDegLng(plat);
  const ky = M_PER_DEG_LAT;
  let bestD = Infinity;
  let routeCount = 0;
  let within = 0;
  for (const s of stops) {
    if (!Array.isArray(s) || s.length < 3) continue;
    const x = (s[0] - plng) * kx;
    const y = (s[1] - plat) * ky;
    const d = Math.sqrt(x * x + y * y);
    if (d <= 400) within += 1;
    if (d < bestD) {
      bestD = d;
      routeCount = s[2];
    }
  }
  if (!Number.isFinite(bestD)) return null;
  return { distanceM: Math.round(bestD), routeCount, stopsWithin400: within };
}
