/**
 * Past-fire history polygons for Greater Melbourne, from the Vicmap/DEECA
 * "Fire History - Last Burnt" layer via the DataVic GeoServer WFS (open, no
 * token; the native ArcGIS REST needs a token). Writes a raw geojson so
 * apply-fire-history / normalize compute the per-SA2 burnt SHARE. CONTEXT only,
 * never scored; HISTORY (where fire has been), NOT the forward-looking Bushfire
 * Prone Area overlay, and NOT parcel-level.
 *
 * Run `npm run data:apply-fire-history` after, then `data:geo`.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { RAW } from "./lib/paths.js";
import { fetchWfsLayerGeoJson } from "./lib/wfs-vic.js";

const WFS = "https://opendata.maps.vic.gov.au/geoserver/wfs";
const TYPE = "open-data-platform:fire_history_lastburnt";

async function main() {
  await mkdir(RAW, { recursive: true });
  console.log("Fire history - last burnt (Vicmap GeoServer WFS)...");
  const fc = await fetchWfsLayerGeoJson(WFS, TYPE, {
    geomField: "geom",
    propertyName: "geom,season,firetype,fire_severity",
    pageSize: 1000,
    maxPages: 60,
  });
  await writeFile(path.join(RAW, "vic-fire-history.geojson"), JSON.stringify(fc));
  console.log(`  ${fc.features.length} fire-history polygons`);
  console.log("fetch-fire-history complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
