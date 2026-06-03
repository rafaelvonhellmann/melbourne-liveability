/**
 * Disamenity / nuisance PROXIMITY proxy (context/buyer-report only, never scored).
 *
 * Complements lib/noise.ts (transport noise) with point sources that can mean
 * odour, dust, pollution, heavy-vehicle traffic or industrial activity: industrial
 * estates, waste/landfill sites, sewage/wastewater works, and quarries (OSM). As
 * with noise we DO NOT measure emissions - this is straight-line distance to the
 * representative point of the nearest mapped source, flagged when close, honestly
 * caveated. We only FLAG; we never certify a place "clean".
 *
 * (Data centres are deliberately excluded for now - too sparsely/inconsistently
 * mapped in OSM to flag reliably.)
 */

export type NuisanceKind = "industrial" | "waste" | "sewage" | "quarry";

export type NuisancePoint = { kind: NuisanceKind; coord: [number, number]; name?: string };

/**
 * Distance (m) at/under which a source is "worth checking". Odour/dust carry, so
 * waste + sewage are generous; an industrial estate boundary matters closer in.
 * Conservative - the finding says "verify on site", it does not assert harm.
 */
export const NUISANCE_THRESHOLDS_M: Record<NuisanceKind, number> = {
  industrial: 300,
  waste: 1000,
  sewage: 800,
  quarry: 700,
};

const M_PER_DEG_LAT = 110574;
function mPerDegLng(lat: number): number {
  return 111320 * Math.cos((lat * Math.PI) / 180);
}

/** Nearest distance (rounded m) from `pin` to each nuisance kind present. */
export function nearestNuisances(
  pin: [number, number],
  points: NuisancePoint[]
): Record<NuisanceKind, number | null> {
  const [plng, plat] = pin;
  const kx = mPerDegLng(plat);
  const ky = M_PER_DEG_LAT;
  const out: Record<NuisanceKind, number | null> = {
    industrial: null,
    waste: null,
    sewage: null,
    quarry: null,
  };
  for (const p of points) {
    if (!p.coord || p.coord.length < 2) continue;
    const x = (p.coord[0] - plng) * kx;
    const y = (p.coord[1] - plat) * ky;
    const dist = Math.round(Math.sqrt(x * x + y * y));
    const cur = out[p.kind];
    if (cur == null || dist < cur) out[p.kind] = dist;
  }
  return out;
}

export type NuisanceFlag = { kind: NuisanceKind; distance: number };

/** Kinds whose nearest source is within threshold, closest first. */
export function nuisanceFlags(
  distances: Record<NuisanceKind, number | null>
): NuisanceFlag[] {
  return (Object.keys(NUISANCE_THRESHOLDS_M) as NuisanceKind[])
    .filter((k) => distances[k] != null && (distances[k] as number) <= NUISANCE_THRESHOLDS_M[k])
    .map((k) => ({ kind: k, distance: distances[k] as number }))
    .sort((a, b) => a.distance - b.distance);
}

const KIND_LABEL: Record<NuisanceKind, string> = {
  industrial: "industrial area",
  waste: "waste / landfill site",
  sewage: "sewage / wastewater works",
  quarry: "quarry",
};

export function nuisanceKindLabel(kind: NuisanceKind): string {
  return KIND_LABEL[kind];
}
