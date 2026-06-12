/**
 * Fetch hazard overlays for the pipeline region via the per-state hazard
 * adapter registry (scripts/lib/hazard-adapters.ts). VIC = Vicmap BPA +
 * LSIO/SBO (Melbourne output byte-identical to the pre-registry script);
 * QLD = QFES SPP Bushfire Prone Area + BCC City Plan flood overlay. States
 * without an adapter skip - their hazards domain stays unscored.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { RAW } from "./lib/paths.js";
import { PIPELINE_REGION } from "./lib/pipeline-region.js";
import { fetchPlanLayerGeoJson } from "./lib/arcgis-plan-vic.js";
import { hazardAdapterFor } from "./lib/hazard-adapters.js";

const OVERLAYS_URL =
  "https://plan-gis.mapshare.vic.gov.au/arcgis/rest/services/Planning/Vicplan_PlanningSchemeOverlays/MapServer";

async function main() {
  const adapter = hazardAdapterFor(PIPELINE_REGION);
  if (!adapter) {
    console.warn(
      `fetch-hazards: no ${PIPELINE_REGION.state} hazard adapter - skipped for ${PIPELINE_REGION.label}.`
    );
    return;
  }
  await mkdir(RAW, { recursive: true });

  await adapter.fetch(PIPELINE_REGION, RAW);

  // Heritage Overlay (HO) - VIC-only CONTEXT layer (planning control, not a
  // hazard, not scored), but fetched here since it shares the Vicplan overlay
  // service + the per-SA2 overlay-share computation. ~11.3k polygons -> ~115
  // pages.
  if (PIPELINE_REGION.stateSlug === "vic") {
    try {
      console.log("Heritage Overlay (HO)...");
      const ho = await fetchPlanLayerGeoJson(OVERLAYS_URL, 9, 150);
      await writeFile(path.join(RAW, "vic-ho.geojson"), JSON.stringify(ho));
      console.log(`  ${ho.features.length} polygons`);
    } catch (e) {
      console.warn("  HO skipped:", (e as Error).message);
    }
  }

  console.log("fetch-hazards complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
