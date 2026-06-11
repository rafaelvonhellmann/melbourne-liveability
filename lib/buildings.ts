import type { Feature, FeatureCollection, Polygon } from "geojson";
import { withBase } from "./asset-path";
import { tilesForPin, tilePath } from "./building-tiles";
import { timeoutSignal } from "./fetch-timeout";

/**
 * Runtime loader for the BAKED building tiles (see scripts/build-building-tiles.ts
 * + the bake-buildings CI workflow). Replaces the old live City-of-Melbourne API +
 * public Overpass fetches in SunShadowView - those flaky third-party endpoints were
 * the reason the sun view "didn't work" outside the CBD. Now the footprints are our
 * own static assets on Pages: cacheable, no rate-limits, no live dependency.
 *
 * Each tile is `{ b: [{ h, g }] }` - h = height (m), g = the outer ring as
 * [lng, lat] pairs. We decode to exactly the FeatureCollection shape
 * SunShadowView's computeShadows + the `blds-3d` fill-extrusion layer expect
 * (properties.structure_extrusion = height, geometry = Polygon).
 *
 * Failure-mode contract (the sun view's honesty depends on it):
 * - "loaded": every needed tile resolved and >=1 building is within the shadow
 *   radius of the pin.
 * - "empty":  every needed tile resolved (200-with-data, or 404 = genuine gap -
 *   water/parkland, the bake skips empty tiles) but nothing is near the pin.
 * - "failed": ANY tile fetch errored or timed out. Callers must NOT present
 *   this as "no buildings here" - it's a connectivity problem, offer a retry.
 */
type BakedBuilding = { h: number; g: [number, number][] };
type BakedTile = { b: BakedBuilding[] };

export type BuildingsNearResult =
  | { status: "loaded"; buildings: FeatureCollection }
  | { status: "empty" }
  | { status: "failed" };

/**
 * Only buildings within this distance of the pin can shade it: the tallest
 * baked height is capped at 400 m and shadow length is capped at 25x height /
 * ~150 footprints in SunShadowView, so ~350 m covers every shadow that could
 * reach the pin while dropping the bulk of a dense tile's decode+render cost.
 */
export const SHADOW_RADIUS_M = 350;

/**
 * Per-tile fetch budget. Each of the (up to 9, usually 1-4) tile fetches gets
 * its OWN 10 s timeout, run in parallel - NOT one shared deadline across all of
 * them, which made total bytes the budget and aborted dense-CBD loads (~1 MB/tile)
 * on perfectly healthy connections.
 */
const TILE_TIMEOUT_MS = 10_000;

function decodeTile(tile: BakedTile): Feature<Polygon>[] {
  return (tile.b ?? [])
    .filter((b) => Array.isArray(b.g) && b.g.length >= 3)
    .map((b) => {
      const ring = [...b.g];
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
      return {
        type: "Feature" as const,
        properties: { structure_extrusion: b.h },
        geometry: { type: "Polygon" as const, coordinates: [ring] },
      };
    });
}

/**
 * Decoded-tile cache, module-level so pin moves / re-mounts within a session
 * reuse both the bytes AND the decode work (the browser HTTP cache only saves
 * the bytes). Keyed by tile path; failures are never cached, so a retry after
 * a network blip refetches. Insertion-order eviction bounds memory.
 */
const tileCache = new Map<string, Feature<Polygon>[]>();
const TILE_CACHE_MAX = 32;

/** Test hook: reset the module-level tile cache. */
export function clearBuildingTileCache(): void {
  tileCache.clear();
}

/** One tile's buildings, or null on fetch error/timeout (404 = legit empty). */
async function fetchTile(
  x: number,
  y: number,
  upstream?: AbortSignal
): Promise<Feature<Polygon>[] | null> {
  const key = tilePath(x, y);
  const hit = tileCache.get(key);
  if (hit) {
    // Refresh recency so hot tiles survive eviction.
    tileCache.delete(key);
    tileCache.set(key, hit);
    return hit;
  }
  const t = timeoutSignal(TILE_TIMEOUT_MS, upstream);
  try {
    const res = await fetch(withBase(key), { signal: t.signal });
    if (res.status === 404) {
      // Genuine gap (water, parkland): the bake only emits tiles with buildings.
      tileCache.set(key, []);
      return [];
    }
    if (!res.ok) return null;
    const feats = decodeTile((await res.json()) as BakedTile);
    if (tileCache.size >= TILE_CACHE_MAX) {
      const oldest = tileCache.keys().next().value;
      if (oldest !== undefined) tileCache.delete(oldest);
    }
    tileCache.set(key, feats);
    return feats;
  } catch {
    return null; // network error, malformed JSON, per-tile timeout, or upstream abort
  } finally {
    t.clear();
  }
}

/** True when any ring vertex is within radiusM of the pin (equirectangular). */
function ringWithinRadius(
  ring: number[][],
  lng: number,
  lat: number,
  radiusM: number
): boolean {
  const mPerDegLat = 110574;
  const mPerDegLng = 111320 * Math.cos((lat * Math.PI) / 180);
  const r2 = radiusM * radiusM;
  for (const c of ring) {
    const dx = (c[0] - lng) * mPerDegLng;
    const dy = (c[1] - lat) * mPerDegLat;
    if (dx * dx + dy * dy <= r2) return true;
  }
  return false;
}

/**
 * Load baked building footprints near a pin. Fetches the tiles a ~350 m shadow
 * radius can touch (1-4 of the 3x3 block; each with its own 10 s timeout, in
 * parallel), then keeps only the buildings within that radius - shadows need
 * just the immediate surroundings, and the filter cuts decode+render cost on
 * dense tiles by an order of magnitude. Never throws; see BuildingsNearResult
 * for the loaded / empty / failed contract.
 */
export async function loadBuildingsNear(
  lng: number,
  lat: number,
  signal?: AbortSignal
): Promise<BuildingsNearResult> {
  const tiles = tilesForPin(lng, lat, SHADOW_RADIUS_M);
  const perTile = await Promise.all(tiles.map(({ x, y }) => fetchTile(x, y, signal)));
  if (perTile.some((t) => t === null)) return { status: "failed" };
  const features = (perTile as Feature<Polygon>[][])
    .flat()
    // Any-vertex test: only wrong for a footprint with >700 m edges whose every
    // vertex is outside the radius - vanishingly rare, and it errs by omission.
    .filter((f) => ringWithinRadius(f.geometry.coordinates[0], lng, lat, SHADOW_RADIUS_M));
  if (!features.length) return { status: "empty" };
  return { status: "loaded", buildings: { type: "FeatureCollection", features } };
}
