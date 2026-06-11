/**
 * Shared slippy-tile math for the BAKED building tiles that back the sun/shadow
 * view. Pure + dependency-free so it can be imported by BOTH the runtime loader
 * (lib/buildings.ts, client bundle) and the bake script (scripts/, build-time) -
 * a single source of truth for the tiling, so the two can never disagree.
 *
 * z14 grid: a tile is ~2.4 km E-W in Melbourne, comfortably larger than the
 * ~180 m shadow radius, so loading the pin tile + its 8 neighbours always covers
 * the buildings that could cast a shadow onto the pin.
 */
export const BUILDING_TILE_Z = 14;

export function lngLatToTile(
  lng: number,
  lat: number,
  z: number = BUILDING_TILE_Z
): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n);
  const clamp = (v: number) => Math.max(0, Math.min(n - 1, v));
  return { x: clamp(x), y: clamp(y) };
}

/** Root-relative path of a baked tile (prefix with withBase() before fetching). */
export function tilePath(x: number, y: number, z: number = BUILDING_TILE_Z): string {
  return `/data/buildings/${z}/${x}/${y}.json`;
}

/** Geographic bounding box of a slippy tile (west < east, south < north). */
export function tileBounds(
  x: number,
  y: number,
  z: number = BUILDING_TILE_Z
): { west: number; east: number; south: number; north: number } {
  const n = 2 ** z;
  const latFromY = (yy: number) =>
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * yy) / n))) * 180) / Math.PI;
  return {
    west: (x / n) * 360 - 180,
    east: ((x + 1) / n) * 360 - 180,
    north: latFromY(y),
    south: latFromY(y + 1),
  };
}

/**
 * The pin's tile plus the neighbours a shadow could reach across.
 *
 * Without `radiusM`: the full 3x3 block (bake-time / conservative callers).
 * With `radiusM`: neighbours whose nearest edge is farther than `radiusM`
 * from the pin are skipped - at z14 a tile is ~2.4 km across, so a ~350 m
 * shadow radius usually needs just 1 tile (2-4 near a tile edge/corner),
 * saving most of the 9 fetches. The pin's own tile is always included.
 */
export function tilesForPin(
  lng: number,
  lat: number,
  radiusM?: number
): { x: number; y: number }[] {
  const { x, y } = lngLatToTile(lng, lat);
  const mPerDegLat = 110574;
  const mPerDegLng = 111320 * Math.cos((lat * Math.PI) / 180);
  const out: { x: number; y: number }[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const tx = x + dx;
      const ty = y + dy;
      if (radiusM != null && (dx !== 0 || dy !== 0)) {
        // Nearest point of the neighbour tile to the pin = the pin clamped to
        // the tile's bbox. Equirectangular metres are plenty at this scale.
        const b = tileBounds(tx, ty);
        const dLng = (Math.min(Math.max(lng, b.west), b.east) - lng) * mPerDegLng;
        const dLat = (Math.min(Math.max(lat, b.south), b.north) - lat) * mPerDegLat;
        if (dLng * dLng + dLat * dLat > radiusM * radiusM) continue;
      }
      out.push({ x: tx, y: ty });
    }
  }
  return out;
}

/**
 * Estimate a building height (metres) from OSM tags: explicit `height`, else
 * `building:levels` x 3.2 m/storey, else ~2 storeys when untagged. Capped at
 * 400 m to bound stray data. Used at BAKE time so the runtime ships heights.
 */
export function estimateHeight(tags: Record<string, unknown> | null | undefined): number {
  const t = tags ?? {};
  const h = parseFloat(String(t["height"] ?? ""));
  if (Number.isFinite(h) && h > 0) return Math.min(h, 400);
  const levels = parseFloat(String(t["building:levels"] ?? ""));
  if (Number.isFinite(levels) && levels > 0) return Math.min(levels * 3.2, 400);
  return 6;
}
