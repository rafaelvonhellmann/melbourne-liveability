/**
 * Bake OSM building footprints into static z14 tiles for the sun/shadow view.
 *
 * Input: a GeoJSON-Text-Sequence (`.geojsonseq`, one Feature per line, RS-framed)
 * produced in CI by osmium from the Geofabrik Victoria extract:
 *   osmium extract -b <GM bbox> victoria.osm.pbf -o metro.osm.pbf
 *   osmium tags-filter metro.osm.pbf w/building -o metro-buildings.osm.pbf
 *   osmium export metro-buildings.osm.pbf -f geojsonseq -o metro-buildings.geojsonseq
 *
 * Output: public/data/buildings/14/{x}/{y}.json  ({ b: [{ h, g }] }) + manifest.
 * Streamed line-by-line so it never holds the whole input in memory.
 */
import { createReadStream, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { lngLatToTile, estimateHeight, BUILDING_TILE_Z } from "../lib/building-tiles";

// Greater Melbourne clip - matches the CI osmium `extract -b` bbox. Buildings
// whose centroid falls outside are skipped (the rest of Victoria isn't needed).
const GM = { minLng: 144.3, minLat: -38.55, maxLng: 145.9, maxLat: -37.2 };

// ASCII Record Separator: GeoJSON-Text-Sequence frames each record with it.
const RS = 0x1e;

type Ring = [number, number][];
type Geom = { type: string; coordinates: unknown };

function outerRings(geom: Geom): Ring[] {
  if (geom.type === "Polygon") {
    const c = geom.coordinates as Ring[];
    return c[0] ? [c[0]] : [];
  }
  if (geom.type === "MultiPolygon") {
    const c = geom.coordinates as Ring[][];
    return c.map((poly) => poly[0]).filter((r): r is Ring => Array.isArray(r));
  }
  return [];
}

function centroid(ring: Ring): [number, number] {
  let sx = 0;
  let sy = 0;
  for (const [lng, lat] of ring) {
    sx += lng;
    sy += lat;
  }
  return [sx / ring.length, sy / ring.length];
}

// ~6 dp (~0.1 m) is plenty for a shadow footprint and keeps the tiles small.
function trim(ring: Ring): Ring {
  return ring.map(([lng, lat]) => [
    Math.round(lng * 1e6) / 1e6,
    Math.round(lat * 1e6) / 1e6,
  ]);
}

async function main(): Promise<void> {
  const input = process.argv[2];
  if (!input || !existsSync(input)) {
    console.error("usage: tsx scripts/build-building-tiles.ts <metro-buildings.geojsonseq>");
    process.exit(1);
    return;
  }
  const outDir = path.join(process.cwd(), "public", "data", "buildings");
  rmSync(outDir, { recursive: true, force: true });

  const tiles = new Map<string, { h: number; g: Ring }[]>();
  let seen = 0;
  let kept = 0;

  const rl = createInterface({ input: createReadStream(input), crlfDelay: Infinity });
  for await (const raw of rl) {
    // Strip the leading Record-Separator that frames each geojsonseq record.
    const line = (raw.charCodeAt(0) === RS ? raw.slice(1) : raw).trim();
    if (!line) continue;
    let f: { geometry?: Geom; properties?: Record<string, unknown> };
    try {
      f = JSON.parse(line) as typeof f;
    } catch {
      continue;
    }
    if (!f.geometry) continue;
    seen++;
    const h = estimateHeight(f.properties);
    for (const ring of outerRings(f.geometry)) {
      if (ring.length < 4) continue;
      const [clng, clat] = centroid(ring);
      if (clng < GM.minLng || clng > GM.maxLng || clat < GM.minLat || clat > GM.maxLat) continue;
      const { x, y } = lngLatToTile(clng, clat);
      const key = `${x}/${y}`;
      let bucket = tiles.get(key);
      if (!bucket) {
        bucket = [];
        tiles.set(key, bucket);
      }
      bucket.push({ h, g: trim(ring) });
      kept++;
    }
  }

  mkdirSync(outDir, { recursive: true });
  let written = 0;
  for (const [key, blds] of tiles) {
    const [x, y] = key.split("/");
    const dir = path.join(outDir, String(BUILDING_TILE_Z), x);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${y}.json`), JSON.stringify({ b: blds }));
    written++;
  }
  writeFileSync(
    path.join(outDir, "manifest.json"),
    JSON.stringify({ z: BUILDING_TILE_Z, tiles: written, bbox: GM })
  );
  console.log(`buildings: seen=${seen} kept=${kept} tiles=${written}`);
}

void main();
