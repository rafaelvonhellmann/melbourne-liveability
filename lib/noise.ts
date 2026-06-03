/**
 * Transport-noise PROXIMITY proxy (context/buyer-report only, never scored).
 *
 * There is no clean open per-address acoustic dataset for Melbourne, so we DO NOT
 * claim measured noise. Instead we measure straight-line distance from the pin to
 * the nearest rail line, tram line, and freeway / major road (OSM line geometry)
 * and flag a property that sits very close to one as "likely to get traffic/rail
 * noise - verify by visiting at peak and after dark". Honest by construction: it
 * is a proximity proxy, not decibels; line-of-sight, barriers, cuttings, traffic
 * volume and time of day all matter and are not modelled.
 */

export type NoiseKind = "rail" | "tram" | "freeway";

/** A noise-source polyline: ordered [lng, lat] vertices of one OSM way. */
export type NoiseLine = { kind: NoiseKind; coords: [number, number][] };

/** Distance (m) at/under which a source is "likely noticeable" - conservative. */
export const NOISE_THRESHOLDS_M: Record<NoiseKind, number> = {
  freeway: 150,
  rail: 150,
  tram: 50,
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
  // Projection of P=(0,0) onto AB, clamped to [0,1].
  let t = -(ax * dx + ay * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return cx * cx + cy * cy;
}

/**
 * Nearest distance (rounded metres) from `pin` to each noise-source kind present
 * in `lines`. A kind with no lines is null. Uses a local equirectangular metre
 * projection centred on the pin - accurate at city scale.
 */
export function nearestNoiseSources(
  pin: [number, number],
  lines: NoiseLine[]
): Record<NoiseKind, number | null> {
  const [plng, plat] = pin;
  const kx = mPerDegLng(plat);
  const ky = M_PER_DEG_LAT;
  const out: Record<NoiseKind, number | null> = { rail: null, tram: null, freeway: null };

  for (const line of lines) {
    const c = line.coords;
    if (!c || c.length === 0) continue;
    let bestSq = Infinity;
    if (c.length === 1) {
      const x = (c[0][0] - plng) * kx;
      const y = (c[0][1] - plat) * ky;
      bestSq = x * x + y * y;
    } else {
      for (let i = 0; i < c.length - 1; i++) {
        const ax = (c[i][0] - plng) * kx;
        const ay = (c[i][1] - plat) * ky;
        const bx = (c[i + 1][0] - plng) * kx;
        const by = (c[i + 1][1] - plat) * ky;
        const d2 = distSqToSegment(ax, ay, bx, by);
        if (d2 < bestSq) bestSq = d2;
      }
    }
    const dist = Math.round(Math.sqrt(bestSq));
    const cur = out[line.kind];
    if (cur == null || dist < cur) out[line.kind] = dist;
  }
  return out;
}

export type NoiseFlag = { kind: NoiseKind; distance: number };

/** The kinds whose nearest source is within the "noticeable" threshold, closest first. */
export function noiseFlags(
  distances: Record<NoiseKind, number | null>
): NoiseFlag[] {
  return (Object.keys(NOISE_THRESHOLDS_M) as NoiseKind[])
    .filter((k) => distances[k] != null && (distances[k] as number) <= NOISE_THRESHOLDS_M[k])
    .map((k) => ({ kind: k, distance: distances[k] as number }))
    .sort((a, b) => a.distance - b.distance);
}

const KIND_LABEL: Record<NoiseKind, string> = {
  rail: "railway line",
  tram: "tram line",
  freeway: "freeway / major road",
};

export function noiseKindLabel(kind: NoiseKind): string {
  return KIND_LABEL[kind];
}
