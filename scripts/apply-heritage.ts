/**
 * Enriches data/generated/places.json with the heritage-overlay context
 * (place.context.planning.heritageOverlayPct) - the % of each SA2 within a
 * Heritage Overlay, from data/raw/vic-ho.geojson. Same computation normalize.ts
 * performs inline (both use scripts/lib/sa2-overlay-pct + lib/planning-overlays).
 * Standalone so the metric can be (re)applied without a full hazard rebuild.
 * Context only - a planning control, never scored.
 *
 * Run after fetch-heritage. Follow with data:geo.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { RAW, GENERATED } from "./lib/paths.js";
import { getProp, featureGeometry } from "./lib/abs-geo.js";
import { buildHazardIndex, overlayPctInSa2 } from "./lib/sa2-overlay-pct.js";
import { roundOverlayPct } from "../lib/planning-overlays.js";
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

  const ho = JSON.parse(
    await readFile(path.join(RAW, "vic-ho.geojson"), "utf8")
  ) as FeatureCollection;
  const hoIdx = buildHazardIndex(ho);
  console.log(`Heritage Overlay polygons: ${ho.features.length}`);

  let enriched = 0;
  for (const p of places) {
    const geom = sa2GeomByCode.get(p.sa2Code);
    if (!geom) continue;
    const pct = roundOverlayPct(overlayPctInSa2(geom, hoIdx));
    if (pct == null) continue;
    const ctx: PlaceContext = {
      ...(p.context ?? {}),
      planning: {
        heritageOverlayPct: pct,
        sourceId: "vic-planning-heritage",
        period: "current",
      },
    };
    p.context = ctx;
    enriched++;
  }

  await writeFile(placesPath, JSON.stringify({ generatedAt, places }));
  console.log(`Applied heritage overlay to ${enriched} places`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
