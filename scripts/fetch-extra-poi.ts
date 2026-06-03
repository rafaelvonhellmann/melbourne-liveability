/**
 * Targeted extra buyer-POI categories: banks, TAFE/college, university.
 * Writes new raw files so build-poi can add them WITHOUT a full data:fetch /
 * score rebuild (run `npm run data:poi` after). OSM (ODbL) - attribute.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { RAW } from "./lib/paths.js";
import { overpassMelbourne } from "./lib/arcgis-fetch.js";

const BBOX = "(-38.35,144.45,-37.45,145.65)";

async function main() {
  console.log("Overpass banks...");
  const finance = await overpassMelbourne(`
    node["amenity"="bank"]${BBOX};
    way["amenity"="bank"]${BBOX};
  `);
  await writeFile(path.join(RAW, "osm-finance.json"), JSON.stringify(finance));
  console.log(`  banks: ${(finance as { elements?: unknown[] }).elements?.length ?? 0}`);

  console.log("Overpass TAFE/college + university...");
  const edu = await overpassMelbourne(`
    node["amenity"="college"]${BBOX};
    way["amenity"="college"]${BBOX};
    node["amenity"="university"]${BBOX};
    way["amenity"="university"]${BBOX};
  `);
  await writeFile(path.join(RAW, "osm-education-extra.json"), JSON.stringify(edu));
  console.log(`  college+uni: ${(edu as { elements?: unknown[] }).elements?.length ?? 0}`);

  console.log("Done extra POI fetch.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
