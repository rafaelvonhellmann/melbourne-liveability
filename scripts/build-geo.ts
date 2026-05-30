/**
 * Builds public/data/places.geojson from SA2 boundaries + places.json scores
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { RAW, GENERATED, PUBLIC_DATA } from "./lib/paths.js";
import { getProp, featureGeometry } from "./lib/abs-geo.js";
import type { Place } from "../lib/types.js";
import type { DomainId } from "../lib/types.js";

function toFeature(geom: Polygon | MultiPolygon, props: Record<string, unknown>): Feature {
  return { type: "Feature", properties: props, geometry: geom };
}

async function main() {
  const sa2Fc = JSON.parse(
    await readFile(path.join(RAW, "sa2-melbourne.geojson"), "utf8")
  ) as FeatureCollection;
  const { places } = JSON.parse(
    await readFile(path.join(GENERATED, "places.json"), "utf8")
  ) as { places: Place[] };
  const byCode = new Map(places.map((p) => [p.sa2Code, p]));

  const features: Feature[] = [];
  for (const f of sa2Fc.features) {
    const code = getProp(f, ["SA2_CODE_2021", "sa2_code_2021"]);
    const geom = featureGeometry(f);
    if (!code || !geom) continue;
    const place = byCode.get(code);
    const simplified = turf.simplify(toFeature(geom, {}), {
      tolerance: 0.0008,
      highQuality: true,
    });
    const props: Record<string, unknown> = {
      sa2Code: code,
      slug: place?.slug,
      name: place?.name,
      nonResidential: place?.nonResidential ?? false,
    };
    for (const d of [
      "affordability",
      "transport",
      "safety",
      "health",
      "hazards",
      "education",
      "income",
    ] as DomainId[]) {
      props[`pct_${d}`] = place?.domains[d]?.percentile ?? null;
    }
    props.pct_confidence = place?.dataConfidence?.score ?? null;
    // Context layer (never scored): % of key everyday-amenity categories
    // reachable within a ~15-min walk of the SA2 centroid (straight-line).
    props.pct_walkaccess = place?.context?.walkAccess?.accessPct ?? null;
    // Context layer (never scored): coarse cyclability index (OSM cycle
    // infrastructure density per SA2). 0–100, not a percentile, not scored.
    props.pct_cyclability = place?.context?.cyclability?.index ?? null;
    features.push({
      type: "Feature",
      properties: props,
      geometry: simplified.geometry as Polygon | MultiPolygon,
    });
  }

  await mkdir(PUBLIC_DATA, { recursive: true });
  const fc: FeatureCollection = { type: "FeatureCollection", features };
  const outPath = path.join(PUBLIC_DATA, "places.geojson");
  await writeFile(outPath, JSON.stringify(fc));
  const mb = (Buffer.byteLength(JSON.stringify(fc)) / 1_000_000).toFixed(2);
  console.log(`Wrote ${outPath} (${features.length} features, ~${mb} MB)`);

  const placesPath = path.join(GENERATED, "places.json");
  const publicPlaces = path.join(PUBLIC_DATA, "places.json");
  await writeFile(publicPlaces, await readFile(placesPath));
  console.log(`Copied places.json → public/data/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
