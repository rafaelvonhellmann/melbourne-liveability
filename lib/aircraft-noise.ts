/**
 * Aircraft-noise exposure at a dropped pin - a v2 lens. Tests whether the point
 * falls inside an ANEF (Australian Noise Exposure Forecast) contour around
 * Melbourne's airports, using the Victorian Vicmap/VicPlan ANEF polygon layers
 * (Melbourne Airport 2022 Master Plan ANEF 20/25/30/35 + Avalon), on the same
 * DTP plan-gis ArcGIS host the planning overlays already use. Runtime,
 * client-side, keyless, CORS-open; never throws. Context only - never scored.
 *
 * Coverage caveat: only Tullamarine + Avalon publish ANEF here; Essendon and
 * Moorabbin do not, so this flags the major-jet contours, not every airfield.
 * CC BY 4.0 (c) State of Victoria (DTP); contours authored by airport operators.
 */
import type { LngLat } from "./buyer-location";
import { timeoutSignal } from "./fetch-timeout";
import { registryId } from "./source-ids";

const PLAN_GIS = "https://plan-gis.mapshare.vic.gov.au/arcgis/rest/services";
const TULLA = `${PLAN_GIS}/Planning/Melbourne_Airport_Master_Plan_2022_VicPlan/MapServer`;
const ENVIRONS = `${PLAN_GIS}/Radius/Airport_environs/MapServer`;
const AVALON_LAYER = 3; // Avalon ANEF 2031

/** Tullamarine ANEF contour bands: [arcgis layer id, ANEF value]. */
const TULLA_BANDS: [number, number][] = [
  [9, 35],
  [10, 30],
  [11, 25],
  [12, 20],
];

/** Source id in the data manifest (sources.json) for attribution. */
export const AIRCRAFT_NOISE_SOURCE_ID = registryId("vic-anef");

export type AircraftNoise = { airport: string; anef: number };

/** Pure: the highest ANEF among the bands the point is inside (0 = none). */
export function highestAnef(bandHits: { anef: number; hit: boolean }[]): number {
  return bandHits.reduce((m, b) => (b.hit && b.anef > m ? b.anef : m), 0);
}

async function pointHits(base: string, layer: number, pin: LngLat, signal: AbortSignal): Promise<boolean> {
  const url =
    `${base}/${layer}/query?where=1%3D1&geometry=${pin[0]},${pin[1]}` +
    `&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects` +
    `&returnGeometry=false&outFields=OBJECTID&f=json`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return false;
    const j = (await res.json()) as { features?: unknown[] };
    return Array.isArray(j.features) && j.features.length > 0;
  } catch {
    return false;
  }
}

/**
 * Resolve the ANEF band at `pin` ([lng, lat]). Never throws: returns null when
 * the point is outside every mapped contour (the common case) or on failure.
 */
export async function fetchAircraftNoise(
  pin: LngLat,
  opts: { signal?: AbortSignal } = {}
): Promise<AircraftNoise | null> {
  const t = timeoutSignal(9000, opts.signal);
  try {
    const [tulla35, tulla30, tulla25, tulla20, avalon] = await Promise.all([
      ...TULLA_BANDS.map(([layer]) => pointHits(TULLA, layer, pin, t.signal)),
      pointHits(ENVIRONS, AVALON_LAYER, pin, t.signal),
    ]);
    const anef = highestAnef([
      { anef: 35, hit: tulla35 },
      { anef: 30, hit: tulla30 },
      { anef: 25, hit: tulla25 },
      { anef: 20, hit: tulla20 },
    ]);
    if (anef > 0) return { airport: "Melbourne Airport (Tullamarine)", anef };
    if (avalon) return { airport: "Avalon Airport", anef: 20 };
    return null;
  } catch {
    return null;
  } finally {
    t.clear();
  }
}
