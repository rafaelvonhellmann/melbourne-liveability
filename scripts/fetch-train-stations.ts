/**
 * Train stations (Metro + V/Line) from OpenStreetMap (ODbL) for the buyer
 * report's "nearest train station" distance. railway=station / halt nodes within
 * Greater Melbourne. Writes public/data/train-stations.json = [{name, coord}].
 * Context only - never scored. See lib/transit.ts. Run `npm run data:stations`.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { PUBLIC_DATA } from "./lib/paths.js";
import { overpassMelbourne } from "./lib/arcgis-fetch.js";
import { OVERPASS_BBOX as BBOX } from "./lib/pipeline-region.js";
import type { Station } from "../lib/transit.js";

type OsmEl = { lat?: number; lon?: number; tags?: Record<string, string> };

async function main() {
  console.log("Overpass train stations (railway=station / halt)...");
  const data = (await overpassMelbourne(`
    node["railway"="station"]${BBOX};
    node["railway"="halt"]${BBOX};
  `)) as { elements?: OsmEl[] };

  const seen = new Set<string>();
  const stations: Station[] = [];
  for (const el of data.elements ?? []) {
    if (el.lat == null || el.lon == null) continue;
    // Skip non-heavy-rail tagged stops if explicitly tram/subway-only.
    if (el.tags?.station === "subway") continue;
    const name = (el.tags?.name ?? "").trim() || "Station";
    const coord: [number, number] = [
      Math.round(el.lon * 1e5) / 1e5,
      Math.round(el.lat * 1e5) / 1e5,
    ];
    const key = `${name}:${coord[0]},${coord[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    stations.push({ name, coord });
  }

  await mkdir(PUBLIC_DATA, { recursive: true });
  const out = path.join(PUBLIC_DATA, "train-stations.json");
  await writeFile(out, JSON.stringify(stations));
  console.log(`Wrote ${out} (${stations.length} stations)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
