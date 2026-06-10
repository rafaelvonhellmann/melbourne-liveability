import type { Feature, Point } from "geojson";
import { withBase } from "./asset-path";
import { lngLatToTile } from "./building-tiles";
import { haversineKm, type LngLat } from "./buyer-location";
import type { NoiseKind, NoiseLine } from "./noise";
import type { TrafficSegment } from "./traffic";
import type { BusStop } from "./transit";

/**
 * Runtime loader for the BAKED report tiles (see scripts/bake-report-tiles.ts).
 * The buyer report's big point/line inputs - POIs (7.8 MB), DTP traffic-AADT
 * segments (1.1 MB) and OSM noise corridors (1.0 MB), plus GTFS bus stops
 * (0.44 MB) - used to be fetched whole on the first pin drop (~10.6 MB parsed).
 * They are now baked into z14 tiles (the SAME grid as the building tiles, see
 * lib/building-tiles.ts) and a pin loads only its tile + 8 neighbours: worst
 * case a few hundred KB instead of ~10 MB.
 *
 * Coverage contract: a 3x3 z14 block guarantees ~1.9 km around the pin (one
 * full tile in the worst direction). Every report consumer of these kinds
 * scans well inside that - amenities 1.2 km, walk isochrone ~1.3 km, noise
 * 150 m, traffic 250 m, bus 1.2 km - EXCEPT the nearest-supermarket fallback
 * (8 km), which {@link loadPoisNear} handles by widening ring by ring until no
 * farther ring can hold a closer supermarket (see below).
 *
 * Each tile decodes back to the EXACT shapes lib/buyer-report.ts consumes
 * today (Feature<Point>[] / TrafficSegment[] / NoiseLine[] / BusStop[]), so
 * the report engine is untouched. Loaders never throw: a missing tile (water,
 * parkland, outside bake bbox) or a failed fetch resolves to empty.
 *
 * Caching is per tileKey (kind/x/y), NOT per call - moving the pin within the
 * same neighbourhood re-merges from cache without refetching. A genuinely
 * missing tile (HTTP 404) is cached as empty; a thrown fetch (network blip)
 * or a non-404 error status (transient 500/503) is NOT cached, so the next
 * pin retries it.
 */

/** Same z14 grid as the building tiles - one tile is ~1.9 km in Melbourne. */
export const REPORT_TILE_Z = 14;

export type ReportTileKind = "pois" | "traffic" | "noise" | "bus";

/** Slim baked POI: [lng, lat, pinType, name] (coords 6 dp, no GeoJSON envelope). */
export type BakedPoi = [number, number, string, string];

export type PoisTile = { p: BakedPoi[] };
export type TrafficTile = { t: TrafficSegment[] };
export type NoiseTile = { n: Partial<Record<NoiseKind, [number, number][][]>> };
export type BusTile = { s: BusStop[] };

/** Root-relative path of a baked report tile (prefix with withBase() to fetch). */
export function reportTilePath(
  kind: ReportTileKind,
  x: number,
  y: number,
  z: number = REPORT_TILE_Z
): string {
  return `/data/report-tiles/${kind}/${z}/${x}/${y}.json`;
}

/**
 * Tiles at Chebyshev distance exactly `r` from (cx, cy): r=0 is the centre
 * tile, r>=1 is the 8r-tile square ring around it. Rings 0+1 together are the
 * standard 3x3 pin neighbourhood.
 */
export function ringTiles(cx: number, cy: number, r: number): { x: number; y: number }[] {
  if (r <= 0) return [{ x: cx, y: cy }];
  const out: { x: number; y: number }[] = [];
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) === r) out.push({ x: cx + dx, y: cy + dy });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-kind decode back to the shapes lib/buyer-report.ts consumes today.
// ---------------------------------------------------------------------------

function decodePois(tile: PoisTile): Feature<Point>[] {
  return (tile.p ?? [])
    .filter((e) => Array.isArray(e) && e.length >= 3)
    .map(([lng, lat, pinType, name]) => ({
      type: "Feature" as const,
      properties: { pinType, name },
      geometry: { type: "Point" as const, coordinates: [lng, lat] },
    }));
}

function decodeTraffic(tile: TrafficTile): TrafficSegment[] {
  return (tile.t ?? []).filter((s) => s && Array.isArray(s.c) && s.c.length > 0);
}

function decodeNoise(tile: NoiseTile): NoiseLine[] {
  const g = tile.n ?? {};
  const lines: NoiseLine[] = [];
  (["rail", "tram", "freeway"] as const).forEach((k) =>
    (g[k] ?? []).forEach((coords) => lines.push({ kind: k, coords }))
  );
  return lines;
}

function decodeBus(tile: BusTile): BusStop[] {
  return (tile.s ?? []).filter((s) => Array.isArray(s) && s.length >= 3);
}

// ---------------------------------------------------------------------------
// Tile cache + fetch (never throws).
// ---------------------------------------------------------------------------

const tileCache = new Map<string, Promise<unknown[]>>();

/** Reset the per-tileKey cache (tests). */
export function clearReportTileCache(): void {
  tileCache.clear();
}

function decodeForKind(kind: ReportTileKind, raw: unknown): unknown[] {
  if (raw == null || typeof raw !== "object") return [];
  switch (kind) {
    case "pois":
      return decodePois(raw as PoisTile);
    case "traffic":
      return decodeTraffic(raw as TrafficTile);
    case "noise":
      return decodeNoise(raw as NoiseTile);
    case "bus":
      return decodeBus(raw as BusTile);
  }
}

function fetchTile(kind: ReportTileKind, x: number, y: number): Promise<unknown[]> {
  const key = `${kind}/${x}/${y}`;
  const hit = tileCache.get(key);
  if (hit) return hit;
  const p = (async () => {
    const res = await fetch(withBase(reportTilePath(kind, x, y)));
    if (!res.ok) {
      // 404 = genuinely not baked (water / outside bbox): cache as empty.
      // Any OTHER status (transient 500/503, rate limit) must NOT blank the
      // tile for the whole session: drop the cache entry and resolve empty
      // for this load only, so the next pin retries it.
      if (res.status !== 404) tileCache.delete(key);
      return [];
    }
    return decodeForKind(kind, (await res.json()) as unknown);
  })().catch(() => {
    // Network blip: resolve empty for THIS load but drop the cache entry so a
    // later pin retries instead of blanking the tile for the whole session.
    tileCache.delete(key);
    return [] as unknown[];
  });
  tileCache.set(key, p);
  return p;
}

async function loadRings(
  kind: ReportTileKind,
  cx: number,
  cy: number,
  rings: number[]
): Promise<unknown[]> {
  const tiles = rings.flatMap((r) => ringTiles(cx, cy, r));
  const perTile = await Promise.all(tiles.map(({ x, y }) => fetchTile(kind, x, y)));
  return perTile.flat();
}

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

/**
 * Merged, decoded features of one kind for the pin's 3x3 z14 neighbourhood.
 * Never throws; missing tiles resolve to empty.
 */
export async function loadReportTilesNear(
  lng: number,
  lat: number,
  kind: "pois"
): Promise<Feature<Point>[]>;
export async function loadReportTilesNear(
  lng: number,
  lat: number,
  kind: "traffic"
): Promise<TrafficSegment[]>;
export async function loadReportTilesNear(
  lng: number,
  lat: number,
  kind: "noise"
): Promise<NoiseLine[]>;
export async function loadReportTilesNear(
  lng: number,
  lat: number,
  kind: "bus"
): Promise<BusStop[]>;
export async function loadReportTilesNear(
  lng: number,
  lat: number,
  kind: ReportTileKind
): Promise<unknown[]> {
  const { x, y } = lngLatToTile(lng, lat, REPORT_TILE_Z);
  return loadRings(kind, x, y, [0, 1]);
}

/**
 * Widest ring the supermarket search may reach: ring 4 guarantees ~7.7 km
 * around the pin, matching the report's 8 km nearest-supermarket scan.
 */
export const SUPERMARKET_SEARCH_MAX_RING = 4;

/** Equatorial circumference (m) - for the per-tile ground span at a latitude. */
const EARTH_CIRCUMFERENCE_M = 40_075_016.686;

/**
 * POIs near a pin. Starts with the 3x3 neighbourhood, then widens ring by ring
 * (up to {@link SUPERMARKET_SEARCH_MAX_RING}) so the report's "nearest
 * supermarket is a short drive" fallback (an 8 km scan, the "The Basin" fix in
 * lib/buyer-report.ts) keeps working on the urban fringe.
 *
 * Chebyshev rings are NOT distance-ordered (a ring-2 corner tile can be
 * farther than a ring-3 edge tile), so stopping at the first ring containing
 * ANY supermarket could name the wrong nearest store. Instead we keep widening
 * until the NEXT ring's minimum possible distance - conservatively
 * ringIndex * tileSpanMeters at this latitude, since ring r+1 starts at least
 * r whole tiles from anywhere in the centre tile - exceeds the best
 * supermarket distance found so far. Dense areas have a close supermarket in
 * the 3x3, so they still never widen; fringe tiles are tiny, so the extra
 * rings cost little. Never throws.
 */
export async function loadPoisNear(lng: number, lat: number): Promise<Feature<Point>[]> {
  const { x, y } = lngLatToTile(lng, lat, REPORT_TILE_Z);
  const pin: LngLat = [lng, lat];
  const nearestSupermarketM = (feats: Feature<Point>[]): number | null => {
    let best: number | null = null;
    for (const f of feats) {
      if ((f.properties as { pinType?: string } | null)?.pinType !== "supermarket") continue;
      const coords = f.geometry?.coordinates as LngLat | undefined;
      if (!coords || coords.length < 2) continue;
      const m = haversineKm(pin, coords) * 1000;
      if (best == null || m < best) best = m;
    }
    return best;
  };
  // Ground span of one z14 tile at this latitude (Web Mercator: ~ equal in
  // both axes at a given latitude).
  const tileSpanMeters =
    (Math.cos((lat * Math.PI) / 180) * EARTH_CIRCUMFERENCE_M) / 2 ** REPORT_TILE_Z;
  let out = (await loadRings("pois", x, y, [0, 1])) as Feature<Point>[];
  let bestM = nearestSupermarketM(out);
  for (let r = 2; r <= SUPERMARKET_SEARCH_MAX_RING; r++) {
    // Ring r's tiles start at least (r - 1) whole tile spans from any point in
    // the centre tile - once that lower bound exceeds the best supermarket
    // found, no farther ring can hold a closer one.
    if (bestM != null && (r - 1) * tileSpanMeters > bestM) break;
    const extra = (await loadRings("pois", x, y, [r])) as Feature<Point>[];
    out = out.concat(extra);
    const m = nearestSupermarketM(extra);
    if (m != null && (bestM == null || m < bestM)) bestM = m;
  }
  return out;
}
