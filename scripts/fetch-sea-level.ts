/**
 * Coastal inundation (sea-level rise) scenario polygons for Greater Melbourne,
 * from DEECA Future Coasts via the CoastKit LCHAInundation ArcGIS MapServer - the
 * queryable REST path (the data.vic copy is download-only SHP). Writes ONE raw
 * geojson, each feature tagged with its `scenario`, so apply-sea-level / normalize
 * compute the per-SA2 inundation SHARE per projection year. CONTEXT only, never
 * scored; NOT parcel-level (dataset ~1:75,000) - a projection/scenario.
 *
 * Layer ids verified 2026-06 (4=2040, 5=2070, 6=2100); they can shift on a
 * republish, so a maintainer should re-confirm against the MapServer layer list.
 * Run `npm run data:apply-sea-level` after, then `data:geo`.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Feature } from "geojson";
import { RAW } from "./lib/paths.js";
import { fetchPlanLayerGeoJson } from "./lib/arcgis-plan-vic.js";
import { COASTAL_SCENARIOS } from "../lib/coastal.js";

const COASTKIT_URL =
  "https://biod-gis.mapshare.vic.gov.au/arcgis/rest/services/CoastKit/LCHAInundation/MapServer";

async function main() {
  await mkdir(RAW, { recursive: true });
  const features: Feature[] = [];
  for (const s of COASTAL_SCENARIOS) {
    console.log(`Sea-level rise ${s.slr} (${s.label}) - CoastKit layer ${s.layerId}...`);
    const fc = await fetchPlanLayerGeoJson(COASTKIT_URL, s.layerId, 300);
    for (const f of fc.features) {
      f.properties = { ...(f.properties ?? {}), scenario: s.key };
      features.push(f);
    }
    console.log(`  ${fc.features.length} polygons`);
  }
  const out = path.join(RAW, "vic-sea-level.geojson");
  await writeFile(out, JSON.stringify({ type: "FeatureCollection", features }));
  console.log(
    `Wrote ${out} (${features.length} polygons across ${COASTAL_SCENARIOS.length} scenarios)`
  );
  console.log("fetch-sea-level complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
