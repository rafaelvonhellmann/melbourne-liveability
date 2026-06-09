import type { Feature, FeatureCollection, Polygon } from "geojson";
import { withBase } from "./asset-path";
import { tilesForPin, tilePath } from "./building-tiles";

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
 */
type BakedBuilding = { h: number; g: [number, number][] };
type BakedTile = { b: BakedBuilding[] };

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
 * Load baked building footprints near a pin (its tile + 8 neighbours). Never
 * throws and never blocks on a single tile: missing tiles (genuine gaps - water,
 * parkland) resolve to empty. Returns an empty FeatureCollection when nothing is
 * baked nearby, which the caller renders as "no mapped buildings here".
 */
export async function loadBuildingsNear(
  lng: number,
  lat: number,
  signal?: AbortSignal
): Promise<FeatureCollection> {
  const tiles = tilesForPin(lng, lat);
  const perTile = await Promise.all(
    tiles.map(async ({ x, y }) => {
      try {
        const res = await fetch(withBase(tilePath(x, y)), { signal });
        if (!res.ok) return [] as Feature<Polygon>[];
        return decodeTile((await res.json()) as BakedTile);
      } catch {
        return [] as Feature<Polygon>[];
      }
    })
  );
  return { type: "FeatureCollection", features: perTile.flat() };
}
