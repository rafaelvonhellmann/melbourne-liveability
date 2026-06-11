/**
 * Community-amenity POI categories: places of worship (all faiths) + community /
 * cultural centres. Writes a new raw file so build-poi can add them WITHOUT a
 * full data:fetch / score rebuild (run `npm run data:poi` after). OSM (ODbL) —
 * attribute. These are CONTEXT pins only; nothing here enters any score.
 *
 * Reshaping "community" to amenities (faith-neutral places of worship + civic
 * community/cultural centres) is deliberate - we do NOT map demographics
 * (religion/ethnicity %) per area. See DIGNITY-STANDARD.md.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { RAW } from "./lib/paths.js";
import { overpassMelbourne } from "./lib/arcgis-fetch.js";
import { OVERPASS_BBOX as BBOX } from "./lib/pipeline-region.js";

async function main() {
  console.log("Overpass places of worship + community/cultural centres...");
  const community = await overpassMelbourne(`
    node["amenity"="place_of_worship"]${BBOX};
    way["amenity"="place_of_worship"]${BBOX};
    node["amenity"~"^(community_centre|social_centre|arts_centre)$"]${BBOX};
    way["amenity"~"^(community_centre|social_centre|arts_centre)$"]${BBOX};
  `);
  await writeFile(
    path.join(RAW, "osm-community.json"),
    JSON.stringify(community)
  );
  const n = (community as { elements?: unknown[] }).elements?.length ?? 0;
  console.log(`  worship + community/cultural: ${n}`);
  console.log("Done community POI fetch.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
