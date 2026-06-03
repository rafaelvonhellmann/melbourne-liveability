/**
 * Enriches data/generated/places.json with coastal-inundation (sea-level-rise)
 * shares (place.context.coastalInundation.scenarioShares[year]) - the % of each
 * SA2 under modelled inundation per projection year, from
 * data/raw/vic-sea-level.geojson. Same overlay-share computation as the planning
 * overlays (scripts/lib/sa2-overlay-pct). Context only, never scored; NOT
 * parcel-level - a projection. Run after fetch-sea-level. Follow with data:geo.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { RAW, GENERATED } from "./lib/paths.js";
import { getProp, featureGeometry } from "./lib/abs-geo.js";
import { buildHazardIndex, overlayPctInSa2 } from "./lib/sa2-overlay-pct.js";
import { roundOverlayPct } from "../lib/planning-overlays.js";
import { COASTAL_SCENARIOS } from "../lib/coastal.js";
import type { Place, PlaceContext, CoastalScenario } from "../lib/types.js";

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
    await readFile(path.join(RAW, "vic-sea-level.geojson"), "utf8")
  ) as FeatureCollection;

  const byScenario = new Map<CoastalScenario, Feature[]>();
  for (const f of fc.features) {
    const sc = (f.properties?.scenario ?? "") as CoastalScenario;
    if (!COASTAL_SCENARIOS.some((s) => s.key === sc)) continue;
    let arr = byScenario.get(sc);
    if (!arr) {
      arr = [];
      byScenario.set(sc, arr);
    }
    arr.push(f);
  }
  const idxByScenario = new Map<
    CoastalScenario,
    ReturnType<typeof buildHazardIndex>
  >();
  for (const [sc, feats] of byScenario) {
    idxByScenario.set(
      sc,
      buildHazardIndex({ type: "FeatureCollection", features: feats })
    );
    console.log(`${sc}: ${feats.length} polygons`);
  }

  let enriched = 0;
  for (const p of places) {
    const geom = sa2GeomByCode.get(p.sa2Code);
    if (!geom) continue;
    const scenarioShares: Partial<Record<CoastalScenario, number>> = {};
    for (const [sc, idx] of idxByScenario) {
      const pct = roundOverlayPct(overlayPctInSa2(geom, idx));
      if (pct != null && pct > 0) scenarioShares[sc] = pct;
    }
    if (Object.keys(scenarioShares).length === 0) continue;
    const ctx: PlaceContext = {
      ...(p.context ?? {}),
      coastalInundation: {
        scenarioShares,
        sourceId: "vic-coastal-inundation",
        period: "2040-2100 projection",
      },
    };
    p.context = ctx;
    enriched++;
  }

  await writeFile(placesPath, JSON.stringify({ generatedAt, places }));
  console.log(`Applied coastal inundation to ${enriched} places`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
