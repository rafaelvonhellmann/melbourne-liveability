/**
 * Enriches data/generated/places.json with the past-fire burnt SHARE
 * (place.context.fireHistory.burntPct) - the % of each SA2 mapped as burnt in
 * the Vicmap fire-history record, from data/raw/vic-fire-history.geojson. Same
 * overlay-share computation as the planning overlays (scripts/lib/sa2-overlay-pct).
 * Context only, never scored; HISTORY (not forward bushfire risk), NOT parcel-level.
 * Run after fetch-fire-history. Follow with data:geo.
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

  const fc = JSON.parse(
    await readFile(path.join(RAW, "vic-fire-history.geojson"), "utf8")
  ) as FeatureCollection;
  const idx = buildHazardIndex(fc, { simplifyTolerance: 0.0015 });
  console.log(`Fire-history polygons: ${fc.features.length} (simplified for SA2-share)`);

  let enriched = 0;
  for (const p of places) {
    const geom = sa2GeomByCode.get(p.sa2Code);
    if (!geom) continue;
    const pct = roundOverlayPct(overlayPctInSa2(geom, idx));
    if (pct == null || pct <= 0) continue;
    p.context = {
      ...(p.context ?? {}),
      fireHistory: { burntPct: pct, sourceId: "vic-fire-history", period: "to 2022-23" },
    } satisfies PlaceContext;
    enriched++;
  }

  await writeFile(placesPath, JSON.stringify({ generatedAt, places }));
  console.log(`Applied fire history to ${enriched} places`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
