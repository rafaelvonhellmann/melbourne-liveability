/**
 * Data-completeness audit (QA artifact, no network). Assigns every POI to the SA2
 * it falls in, then reports per-category coverage (how many areas have it / lack
 * it) + a per-SA2 "has vs lacks" table. Surfaces sparse/suspect categories (NDIS,
 * police, childcare...) so we know what to trust, fix or flag -> data/generated/data-audit.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FeatureCollection, Feature, Point, Polygon, MultiPolygon } from "geojson";
import { GENERATED, PUBLIC_DATA } from "./lib/paths.js";
import { pointInPolygon, type LngLat } from "../lib/buyer-location.js";
import { POI_CATEGORY_IDS } from "../lib/poi-categories.js";

const places = JSON.parse(
  readFileSync(path.join(PUBLIC_DATA, "places.geojson"), "utf8")
) as FeatureCollection;
const pois = JSON.parse(
  readFileSync(path.join(PUBLIC_DATA, "pois.geojson"), "utf8")
) as FeatureCollection;

type Sa2 = {
  code: string;
  name: string;
  geom: Polygon | MultiPolygon;
  bbox: [number, number, number, number];
  counts: Record<string, number>;
};

function bboxOf(g: Polygon | MultiPolygon): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const rings = g.type === "Polygon" ? g.coordinates : g.coordinates.flat();
  for (const ring of rings) for (const [x, y] of ring as [number, number][]) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

const sa2s: Sa2[] = [];
for (const f of places.features) {
  const g = f.geometry;
  if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) continue;
  const p = (f.properties ?? {}) as Record<string, unknown>;
  if (p.nonResidential === true) continue;
  sa2s.push({
    code: String(p.sa2Code ?? ""),
    name: String(p.name ?? ""),
    geom: g as Polygon | MultiPolygon,
    bbox: bboxOf(g as Polygon | MultiPolygon),
    counts: Object.fromEntries(POI_CATEGORY_IDS.map((c) => [c, 0])),
  });
}

let assigned = 0;
const totalByCat: Record<string, number> = Object.fromEntries(POI_CATEGORY_IDS.map((c) => [c, 0]));
for (const poi of pois.features as Feature<Point>[]) {
  const c = poi.geometry?.coordinates as LngLat | undefined;
  const cat = String((poi.properties as { pinType?: string })?.pinType ?? "");
  if (!c || c.length < 2 || !cat) continue;
  totalByCat[cat] = (totalByCat[cat] ?? 0) + 1;
  for (const s of sa2s) {
    if (c[0] < s.bbox[0] || c[0] > s.bbox[2] || c[1] < s.bbox[1] || c[1] > s.bbox[3]) continue;
    if (pointInPolygon(c, s.geom)) { s.counts[cat]++; assigned++; break; }
  }
}

const N = sa2s.length;
const perCategory = POI_CATEGORY_IDS.map((cat) => {
  const withIt = sa2s.filter((s) => s.counts[cat] > 0).length;
  const vals = sa2s.map((s) => s.counts[cat]).sort((a, b) => a - b);
  return {
    category: cat,
    total: totalByCat[cat] ?? 0,
    sa2sWith: withIt,
    sa2sWithout: N - withIt,
    coveragePct: Math.round((withIt / N) * 1000) / 10,
    median: vals[Math.floor(N / 2)],
  };
}).sort((a, b) => a.coveragePct - b.coveragePct);

console.log(`SA2s (residential): ${N} | POIs assigned: ${assigned}/${pois.features.length}\n`);
console.log("category          total   areas-with  coverage%  median/area");
for (const r of perCategory) {
  console.log(
    `${r.category.padEnd(16)} ${String(r.total).padStart(6)}   ${String(r.sa2sWith).padStart(8)}   ${String(r.coveragePct).padStart(7)}   ${r.median}`
  );
}

const perSa2 = sa2s
  .map((s) => ({
    code: s.code,
    name: s.name,
    has: POI_CATEGORY_IDS.filter((c) => s.counts[c] > 0),
    lacks: POI_CATEGORY_IDS.filter((c) => s.counts[c] === 0),
    counts: s.counts,
  }))
  .sort((a, b) => a.has.length - b.has.length);

writeFileSync(
  path.join(GENERATED, "data-audit.json"),
  JSON.stringify({ generatedAt: "build", residentialSa2s: N, perCategory, perSa2 }, null, 2)
);
console.log(`\nWrote data/generated/data-audit.json (per-SA2 has/lacks table).`);
