/**
 * Conservation / restriction planning-overlay polygons for Greater Melbourne,
 * from the Vicplan Planning Scheme Overlays service (same service as the flood +
 * heritage overlays). Writes ONE raw geojson, each feature tagged with its
 * overlay `code`, so normalize / apply-overlays can compute the per-SA2 area
 * SHARE of each overlay. CONTEXT only - these are planning CONTROLS, never scored.
 *
 * Layer ids verified against the live MapServer (2026-06):
 *   ESO=3  SLO=4  VPO=5  EMO=13  EAO=25  PAO=28
 *
 * Run `npm run data:apply-overlays` after, then `data:geo`.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Feature } from "geojson";
import { RAW } from "./lib/paths.js";
import { fetchPlanLayerGeoJson } from "./lib/arcgis-plan-vic.js";
import type { ConservationOverlayCode } from "../lib/types.js";

const OVERLAYS_URL =
  "https://plan-gis.mapshare.vic.gov.au/arcgis/rest/services/Planning/Vicplan_PlanningSchemeOverlays/MapServer";

const LAYERS: { code: ConservationOverlayCode; layerId: number }[] = [
  { code: "ESO", layerId: 3 },
  { code: "SLO", layerId: 4 },
  { code: "VPO", layerId: 5 },
  { code: "EMO", layerId: 13 },
  { code: "EAO", layerId: 25 },
  { code: "PAO", layerId: 28 },
];

// 100 features/page. EMO alone is ~36k polygons in the Melbourne bbox, so the
// cap must clear that; 500 pages = up to 50k per layer. A cap-hit is logged
// (never silently truncate coverage).
const MAX_PAGES = 500;

async function main() {
  await mkdir(RAW, { recursive: true });
  const features: Feature[] = [];
  for (const { code, layerId } of LAYERS) {
    console.log(`${code} - Vicplan layer ${layerId}...`);
    const fc = await fetchPlanLayerGeoJson(OVERLAYS_URL, layerId, MAX_PAGES);
    if (fc.features.length >= MAX_PAGES * 100) {
      console.warn(
        `  WARNING: ${code} hit the ${MAX_PAGES}-page cap (${fc.features.length}); coverage may be truncated - raise MAX_PAGES.`
      );
    }
    for (const f of fc.features) {
      f.properties = { ...(f.properties ?? {}), code };
      features.push(f);
    }
    console.log(`  ${fc.features.length} ${code} polygons`);
  }
  const out = path.join(RAW, "vic-conservation-overlays.geojson");
  await writeFile(out, JSON.stringify({ type: "FeatureCollection", features }));
  console.log(
    `Wrote ${out} (${features.length} polygons across ${LAYERS.length} overlays)`
  );
  console.log("fetch-overlays complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
