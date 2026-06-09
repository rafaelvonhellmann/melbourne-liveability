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

/** The pin's tile plus its 8 neighbours - the set a shadow could reach across. */
export function tilesForPin(lng: number, lat: number): { x: number; y: number }[] {
  const { x, y } = lngLatToTile(lng, lat);
  const out: { x: number; y: number }[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      out.push({ x: x + dx, y: y + dy });
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
