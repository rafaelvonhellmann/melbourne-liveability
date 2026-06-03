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
