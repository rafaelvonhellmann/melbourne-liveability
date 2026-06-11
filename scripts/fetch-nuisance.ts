/**
 * Disamenity / nuisance source points for the buyer-report proximity proxy:
 * industrial estates, waste/landfill sites, sewage/wastewater works and quarries
 * (OSM, ODbL). Representative point per feature (`out center`). Writes a lean
 * public/data/nuisance-points.json = { industrial: [[lng,lat],...], waste, sewage,
 * quarry }. Context only - never scored. See lib/nuisance.ts. Run `npm run data:nuisance`.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { PUBLIC_DATA } from "./lib/paths.js";
import { overpassMelbourne } from "./lib/arcgis-fetch.js";
import { OVERPASS_BBOX as BBOX } from "./lib/pipeline-region.js";
import type { NuisanceKind } from "../lib/nuisance.js";

type OsmEl = {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function kindFor(tags: Record<string, string>): NuisanceKind | null {
  const lu = tags.landuse ?? "";
  if (lu === "industrial") return "industrial";
  if (lu === "landfill") return "waste";
  if (lu === "quarry") return "quarry";
  if (tags.amenity === "waste_transfer_station") return "waste";
  if (tags.man_made === "wastewater_plant") return "sewage";
  return null;
}

async function main() {
  console.log("Overpass nuisance sources (industrial / waste / sewage / quarry)...");
  const data = (await overpassMelbourne(`
    way["landuse"="industrial"]${BBOX};
    relation["landuse"="industrial"]${BBOX};
    way["landuse"="landfill"]${BBOX};
    way["landuse"="quarry"]${BBOX};
    node["amenity"="waste_transfer_station"]${BBOX};
    way["amenity"="waste_transfer_station"]${BBOX};
    node["man_made"="wastewater_plant"]${BBOX};
    way["man_made"="wastewater_plant"]${BBOX};
  `)) as { elements?: OsmEl[] };

  const grouped: Record<NuisanceKind, [number, number][]> = {
    industrial: [],
    waste: [],
    sewage: [],
    quarry: [],
  };
  for (const el of data.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const kind = kindFor(el.tags ?? {});
    if (!kind) continue;
    grouped[kind].push([Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]);
  }

  await mkdir(PUBLIC_DATA, { recursive: true });
  const out = path.join(PUBLIC_DATA, "nuisance-points.json");
  const json = JSON.stringify(grouped);
  await writeFile(out, json);
  console.log(
    `Wrote ${out} (industrial ${grouped.industrial.length}, waste ${grouped.waste.length}, sewage ${grouped.sewage.length}, quarry ${grouped.quarry.length}; ${(json.length / 1024).toFixed(0)} KB)`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
