/**
 * Transport-noise source lines for the buyer-report proximity proxy: rail,
 * light-rail/subway, tram tracks, and freeways/highways (OSM, ODbL). Fetches the
 * line geometry, simplifies it (Douglas-Peucker, ~28 m) and writes a LEAN
 * polyline file (no GeoJSON per-feature boilerplate, since this is used only for
 * distance maths, not rendered): public/data/noise-lines.json =
 *   { rail: [[[lng,lat],...], ...], tram: [...], freeway: [...] }.
 * Context only - never scored. See lib/noise.ts. Run via `npm run data:noise`.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { PUBLIC_DATA } from "./lib/paths.js";
import { overpassMelbourne } from "./lib/arcgis-fetch.js";
import { OVERPASS_BBOX as BBOX } from "./lib/pipeline-region.js";
import type { NoiseKind } from "../lib/noise.js";

type OsmWay = {
  type?: string;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
};

function kindFor(tags: Record<string, string>): NoiseKind | null {
  const rw = tags.railway ?? "";
  if (rw === "tram") return "tram";
  if (rw === "rail" || rw === "light_rail" || rw === "subway") return "rail";
  const hw = tags.highway ?? "";
  if (/^(motorway|trunk)(_link)?$/.test(hw)) return "freeway";
  return null;
}

/** Perpendicular distance (deg) from P to line A-B. */
function perpDist(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): number {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Douglas-Peucker line simplification (tolerance in degrees). */
function simplify(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length <= 2) return pts;
  let maxD = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > tol) {
    const left = simplify(pts.slice(0, idx + 1), tol);
    const right = simplify(pts.slice(idx), tol);
    return [...left.slice(0, -1), ...right];
  }
  return [pts[0], pts[pts.length - 1]];
}

async function main() {
  console.log("Overpass noise-source lines (rail / tram / freeway)...");
  const data = (await overpassMelbourne(
    `
    way["railway"~"^(rail|light_rail|subway|tram)$"]${BBOX};
    way["highway"~"^(motorway|trunk)(_link)?$"]${BBOX};
  `,
    { out: "geom" }
  )) as { elements?: OsmWay[] };

  const grouped: Record<NoiseKind, [number, number][][]> = {
    rail: [],
    tram: [],
    freeway: [],
  };
  for (const el of data.elements ?? []) {
    if (el.type !== "way" || !el.geometry || el.geometry.length < 2) continue;
    const kind = kindFor(el.tags ?? {});
    if (!kind) continue;
    const raw: [number, number][] = el.geometry.map((g) => [g.lon, g.lat]);
    const coords = simplify(raw, 0.00025).map(
      ([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5] as [number, number]
    );
    if (coords.length < 2) continue;
    grouped[kind].push(coords);
  }

  await mkdir(PUBLIC_DATA, { recursive: true });
  const out = path.join(PUBLIC_DATA, "noise-lines.json");
  const json = JSON.stringify(grouped);
  await writeFile(out, json);
  console.log(
    `Wrote ${out} (rail ${grouped.rail.length}, tram ${grouped.tram.length}, freeway ${grouped.freeway.length}; ${(json.length / 1024 / 1024).toFixed(2)} MB)`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
