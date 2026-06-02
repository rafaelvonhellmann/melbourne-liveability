/**
 * Heritage Overlay (HO) polygons for Greater Melbourne, from the Vicplan Planning
 * Scheme Overlays service (same service as the flood overlays). Writes a raw
 * geojson so apply-heritage / normalize can compute the per-SA2 heritage-overlay
 * SHARE. CONTEXT only - a Heritage Overlay is a planning control (demolition /
 * external-change / subdivision restrictions), NOT a hazard and NOT scored.
 *
 * Run `npm run data:apply-heritage` after, then `data:geo`.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { RAW } from "./lib/paths.js";
import { fetchPlanLayerGeoJson } from "./lib/arcgis-plan-vic.js";

const OVERLAYS_URL =
  "https://plan-gis.mapshare.vic.gov.au/arcgis/rest/services/Planning/Vicplan_PlanningSchemeOverlays/MapServer";

async function main() {
  await mkdir(RAW, { recursive: true });
  // ~11.3k HO polygons in the Melbourne bbox (100/page) -> needs ~115 pages.
  console.log("Heritage Overlay (HO) polygons (Vicplan)...");
  const ho = await fetchPlanLayerGeoJson(OVERLAYS_URL, 9, 150);
  await writeFile(path.join(RAW, "vic-ho.geojson"), JSON.stringify(ho));
  console.log(`  ${ho.features.length} HO polygons`);
  console.log("fetch-heritage complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
