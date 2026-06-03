/**
 * Enriches data/generated/places.json with VIF2023 SA2 population + dwelling
 * projections (place.context.projections) from data/raw/vif2023-sa2.xlsx. The
 * forward-looking "Horizon" lens. Context only, never scored; a PROJECTION (not
 * a forecast/target). Run after fetch-vif. Follow with data:geo.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { RAW, GENERATED } from "./lib/paths.js";
import { readVifProjections } from "./lib/vif-parse.js";
import type { Place, PlaceContext } from "../lib/types.js";

async function main() {
  const placesPath = path.join(GENERATED, "places.json");
  const { generatedAt, places } = JSON.parse(
    await readFile(placesPath, "utf8")
  ) as { generatedAt: string; places: Place[] };

  const vif = readVifProjections(path.join(RAW, "vif2023-sa2.xlsx"));
  console.log(`VIF rows: ${vif.size} SA2s`);

  let enriched = 0;
  for (const p of places) {
    const rec = vif.get(p.sa2Code);
    if (
      !rec ||
      (Object.keys(rec.population).length === 0 && Object.keys(rec.dwellings).length === 0)
    ) {
      continue;
    }
    p.context = {
      ...(p.context ?? {}),
      projections: {
        population: rec.population,
        dwellings: rec.dwellings,
        sourceId: "vif2023-sa2",
        period: "2021-2036",
      },
    } satisfies PlaceContext;
    enriched++;
  }

  await writeFile(placesPath, JSON.stringify({ generatedAt, places }));
  console.log(`Applied VIF projections to ${enriched} places`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
