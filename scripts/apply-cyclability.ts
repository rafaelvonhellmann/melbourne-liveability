/**
 * Enriches data/generated/places.json with the cyclability context layer
 * (place.context.cyclability), computed from OSM cycling infrastructure length
 * per SA2 normalised by land area.
 *
 * This is the SAME computation `scripts/normalize.ts` performs inline (both use
 * the shared `lib/cyclability.ts` + `scripts/lib/cyclability-compute.ts`
 * helpers). It exists as a standalone step so the cyclability metric can be
 * (re)applied to already-built artifacts without re-running the heavier
 * hazard-overlay intersection. A full `npm run data:build` produces the
 * identical field via normalize.
 *
 * Run after data:fetch (so osm-cycleways.json exists). Follow with data:geo
 * (re-emits places.geojson + pct_cyclability and copies places.json to public).
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { RAW, GENERATED } from "./lib/paths.js";
import { getProp, featureGeometry } from "./lib/abs-geo.js";
import { computeCyclabilityByCode } from "./lib/cyclability-compute.js";
import type { Place, PlaceContext } from "../lib/types.js";

async function main() {
  const placesPath = path.join(GENERATED, "places.json");
  const { generatedAt, places } = JSON.parse(
    await readFile(placesPath, "utf8")
  ) as { generatedAt: string; places: Place[] };

  const sa2Fc = JSON.parse(
    await readFile(path.join(RAW, "sa2-melbourne.geojson"), "utf8")
  ) as FeatureCollection;
  const sa2GeomByCode = new Map<string, Polygon | MultiPolygon>();
  for (const f of sa2Fc.features) {
    const code = getProp(f, ["SA2_CODE_2021", "sa2_code_2021"]);
    const geom = featureGeometry(f);
    if (code && geom) sa2GeomByCode.set(code, geom);
  }

  const cycleways = JSON.parse(
    (await readFile(path.join(RAW, "osm-cycleways.json"), "utf8").catch(
      () => "{}"
    )) || "{}"
  );
  const byCode = computeCyclabilityByCode(cycleways, sa2GeomByCode, {
    sourceId: "osm-cycleways",
    period: "current",
  });

  let enriched = 0;
  let totalKm = 0;
  for (const p of places) {
    const cyclability = byCode.get(p.sa2Code);
    if (!cyclability) continue;
    const ctx: PlaceContext = { ...(p.context ?? {}), cyclability };
    p.context = ctx;
    enriched++;
    totalKm += cyclability.cyclewayKm;
  }

  await writeFile(placesPath, JSON.stringify({ generatedAt, places }));
  console.log(
    `Applied cyclability to ${enriched} places (${totalKm.toFixed(0)} km cycle infrastructure total)`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
