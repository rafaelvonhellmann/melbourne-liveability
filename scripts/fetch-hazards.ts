/**
 * Fetch Vic planning hazard overlays (BPA, LSIO, SBO) for Greater Melbourne bbox.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { RAW } from "./lib/paths.js";
import { fetchPlanLayerGeoJson } from "./lib/arcgis-plan-vic.js";

const BPA_URL =
  "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Planning/FeatureServer";
const OVERLAYS_URL =
  "https://plan-gis.mapshare.vic.gov.au/arcgis/rest/services/Planning/Vicplan_PlanningSchemeOverlays/MapServer";

async function main() {
  await mkdir(RAW, { recursive: true });

  console.log("Bushfire Prone Areas (Vicmap Planning)...");
  const bpa = await fetchPlanLayerGeoJson(BPA_URL, 9, 50);
  await writeFile(path.join(RAW, "vic-bpa.geojson"), JSON.stringify(bpa));
  console.log(`  ${bpa.features.length} polygons`);

  let lsioFeatures = 0;
  let sboFeatures = 0;
  try {
    console.log("LSIO flood overlay...");
    const lsio = await fetchPlanLayerGeoJson(OVERLAYS_URL, 15, 80);
    await writeFile(path.join(RAW, "vic-lsio.geojson"), JSON.stringify(lsio));
    lsioFeatures = lsio.features.length;
    console.log(`  ${lsioFeatures} polygons`);
  } catch (e) {
    console.warn("  LSIO skipped:", (e as Error).message);
  }

  try {
    console.log("SBO flood overlay...");
    const sbo = await fetchPlanLayerGeoJson(OVERLAYS_URL, 16, 40);
    await writeFile(path.join(RAW, "vic-sbo.geojson"), JSON.stringify(sbo));
    sboFeatures = sbo.features.length;
    console.log(`  ${sboFeatures} polygons`);
  } catch (e) {
    console.warn("  SBO skipped:", (e as Error).message);
  }

  if (lsioFeatures === 0 && sboFeatures === 0) {
    console.warn("No flood overlays downloaded - hazards domain will use bushfire only.");
  }

  // Heritage Overlay (HO) - CONTEXT only (planning control, not a hazard, not
  // scored), but fetched here since it shares the Vicplan overlay service + the
  // per-SA2 overlay-share computation. ~11.3k polygons -> ~115 pages.
  try {
    console.log("Heritage Overlay (HO)...");
    const ho = await fetchPlanLayerGeoJson(OVERLAYS_URL, 9, 150);
    await writeFile(path.join(RAW, "vic-ho.geojson"), JSON.stringify(ho));
    console.log(`  ${ho.features.length} polygons`);
  } catch (e) {
    console.warn("  HO skipped:", (e as Error).message);
  }

  console.log("fetch-hazards complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
