/**
 * Re-fetch OSM POI layers used for map pins (police, post, GP, childcare, labs, NDIS).
 * Run: npx tsx scripts/fetch-osm-poi-extra.ts && npm run data:poi
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { RAW } from "./lib/paths.js";
import { overpassMelbourne } from "./lib/arcgis-fetch.js";

const BBOX = "-38.35,144.45,-37.45,145.65";

async function main() {
  console.log("Overpass hospitals + GP/clinics + police...");
  const health = await overpassMelbourne(`
    node["amenity"="hospital"](${BBOX});
    node["amenity"~"doctors|clinic|health_centre"](${BBOX});
    way["amenity"~"doctors|clinic|health_centre"](${BBOX});
    node["healthcare"~"doctor|clinic|centre"](${BBOX});
    way["healthcare"~"doctor|clinic|centre"](${BBOX});
    node["amenity"="police"](${BBOX});
    way["amenity"="police"](${BBOX});
    node["office"="police"](${BBOX});
  `);
  await writeFile(path.join(RAW, "osm-health.json"), JSON.stringify(health));

  console.log("Overpass schools + childcare...");
  const schools = await overpassMelbourne(`
    node["amenity"="school"](${BBOX});
    way["amenity"="school"](${BBOX});
    node["amenity"~"kindergarten|childcare|preschool"](${BBOX});
    way["amenity"~"kindergarten|childcare|preschool"](${BBOX});
  `);
  await writeFile(path.join(RAW, "osm-schools.json"), JSON.stringify(schools));

  console.log("Overpass post offices (Australia Post / LPO)...");
  const post = await overpassMelbourne(`
    node["amenity"="post_office"](${BBOX});
    way["amenity"="post_office"](${BBOX});
    node["shop"="post_office"](${BBOX});
    node["post_office"="post_partner"](${BBOX});
  `);
  await writeFile(path.join(RAW, "osm-post.json"), JSON.stringify(post));

  console.log("Overpass pathology labs + NDIS-related providers...");
  const clinical = await overpassMelbourne(`
    node["healthcare"~"laboratory|sample_collection"](${BBOX});
    way["healthcare"~"laboratory|sample_collection"](${BBOX});
    node["amenity"="clinic"]["healthcare:speciality"~"pathology|diagnostic"](${BBOX});
    node["social_facility"](${BBOX});
    node["office"~"association|ngo"](${BBOX});
    node["healthcare"="counselling"](${BBOX});
  `);
  await writeFile(path.join(RAW, "osm-clinical-social.json"), JSON.stringify(clinical));

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
