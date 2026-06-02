/**
 * EV charging stations (NestCheck-parity amenity) from OpenStreetMap (ODbL).
 * Writes a raw file so build-poi can add an `ev_charging` pin category WITHOUT a
 * full data:fetch (run `npm run data:poi` after). Context pin only - never scored.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { RAW } from "./lib/paths.js";
import { overpassMelbourne } from "./lib/arcgis-fetch.js";

const BBOX = "(-38.35,144.45,-37.45,145.65)";

async function main() {
  await mkdir(RAW, { recursive: true });
  console.log("Overpass EV charging stations...");
  const ev = await overpassMelbourne(`
    node["amenity"="charging_station"]${BBOX};
    way["amenity"="charging_station"]${BBOX};
  `);
  await writeFile(path.join(RAW, "osm-ev.json"), JSON.stringify(ev));
  const n = (ev as { elements?: unknown[] }).elements?.length ?? 0;
  console.log(`  EV charging: ${n}`);
  console.log("Done EV POI fetch.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
