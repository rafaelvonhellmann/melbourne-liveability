/**
 * Aged-care + retirement facilities (nursing homes, assisted living) from
 * OpenStreetMap (ODbL). ~200+ across Greater Melbourne - density verified via an
 * Overpass count before adding (unlike NDIS, which was too sparse to map fairly).
 * Context pin only, never scored. Run `npm run data:poi` after to rebuild
 * pins.geojson. Framed as a place/amenity (downsizers + care-near-parents), never
 * as a "type of neighbour" signal (DIGNITY-STANDARD).
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { RAW } from "./lib/paths.js";
import { overpassMelbourne } from "./lib/arcgis-fetch.js";
import { OVERPASS_BBOX as BBOX } from "./lib/pipeline-region.js";

async function main() {
  await mkdir(RAW, { recursive: true });
  console.log("Overpass aged-care / retirement facilities...");
  const data = await overpassMelbourne(`
    node["social_facility"~"nursing_home|assisted_living"]${BBOX};
    way["social_facility"~"nursing_home|assisted_living"]${BBOX};
  `);
  await writeFile(path.join(RAW, "osm-aged-care.json"), JSON.stringify(data));
  const n = (data as { elements?: unknown[] }).elements?.length ?? 0;
  console.log(`  aged-care: ${n}`);
  console.log("Done aged-care POI fetch.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
