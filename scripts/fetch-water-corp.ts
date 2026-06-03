/**
 * Victorian water corporation service boundaries (Vicmap, CC BY 4.0) - which
 * retailer services an address (Yarra Valley Water / South East Water / Greater
 * Western Water in metro Melbourne). The DataVic file is manual-order-only SHP,
 * but the SAME layer is served as GeoJSON over the Vicmap GeoServer WFS
 * (open-data-platform:water_corp, WGS84) - no manual order, no reprojection.
 *
 * ~20 statewide polygons; we keep name + url, simplify (~100 m, immaterial for
 * an SA2-level "who services this area" lookup) and write data/raw/water-corp.geojson.
 * normalize.ts assigns each SA2 the corporation that contains its centroid.
 * Context only, never scored. Run `npm run data:water-corp`.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { RAW } from "./lib/paths.js";

const WFS = "https://opendata.maps.vic.gov.au/geoserver/wfs";
const TYPE = "open-data-platform:water_corp";
const UA = "MelbourneLiveability/1.0";
const SIMPLIFY_TOLERANCE = 0.001; // ~100 m

async function main() {
  console.log("Victorian water corporation boundaries (Vicmap WFS)...");
  const url =
    `${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(TYPE)}` +
    `&outputFormat=application/json&srsName=EPSG:4326&count=1000`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`WFS water_corp ${res.status}`);
  const fc = (await res.json()) as FeatureCollection;

  const out: Feature[] = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) continue;
    const props = f.properties as Record<string, unknown>;
    // Keep only the 3 metro RETAILERS (Yarra Valley / South East / Greater
    // Western Water). Exclude "Melbourne Water Corporation" (the wholesaler,
    // whose boundary overlaps all metro) and rural/regional corps.
    if (String(props?.watercorp_type ?? "") !== "Melbourne Water Retailer") continue;
    const name = String(props?.watercorp_name ?? "").trim();
    if (!name) continue;
    const urlVal = (f.properties as Record<string, unknown>)?.url;
    let simplified: Feature = f;
    try {
      simplified = turf.simplify(f, { tolerance: SIMPLIFY_TOLERANCE, highQuality: false, mutate: false });
    } catch {
      /* keep original */
    }
    out.push({
      type: "Feature",
      geometry: simplified.geometry as Polygon | MultiPolygon,
      properties: { watercorp_name: name, url: urlVal ? String(urlVal) : undefined },
    });
  }
  if (out.length === 0) throw new Error("water_corp: 0 polygon features parsed");

  await mkdir(RAW, { recursive: true });
  const dest = path.join(RAW, "water-corp.geojson");
  await writeFile(dest, JSON.stringify({ type: "FeatureCollection", features: out }));
  console.log(`Wrote ${dest}: ${out.length} water corporations`);
  console.log("fetch-water-corp complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
