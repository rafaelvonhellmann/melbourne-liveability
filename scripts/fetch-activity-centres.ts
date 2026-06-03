/**
 * Activity Centre Zones (ACZ) from Vicmap Planning (DTP, CC BY 4.0) - the
 * statutory upzoning instrument directing higher-density development to
 * designated activity centres. The forward "where growth is steered" Horizon
 * layer. GeoServer WFS (WGS84, no reprojection); ~175 ACZ polygons after the
 * Greater-Melbourne bbox clip (the metro bbox also catches Geelong-belt centres).
 *
 * Metro-clip + simplify (~30 m) into a compact public/data/activity-centres.json,
 * lazy-loaded on a pin-drop report. Context only, never scored. Honest framing:
 * ACZ != the full Plan Melbourne hierarchy. Run `npm run data:activity-centres`.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { PUBLIC_DATA } from "./lib/paths.js";
import type { ActivityCentreFeature } from "../lib/activity-centres.js";

const WFS = "https://opendata.maps.vic.gov.au/geoserver/wfs";
const TYPE = "open-data-platform:plan_zone";
const UA = "MelbourneLiveability/1.0";
const METRO: [number, number, number, number] = [144.3, -38.55, 145.55, -37.35];
const SIMPLIFY_TOLERANCE = 0.0003; // ~30 m

function overlapsMetro(bb: number[]): boolean {
  return !(bb[2] < METRO[0] || bb[0] > METRO[2] || bb[3] < METRO[1] || bb[1] > METRO[3]);
}

async function main() {
  console.log("Activity Centre Zones (Vicmap Planning WFS, ACZ)...");
  const url =
    `${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(TYPE)}` +
    `&outputFormat=application/json&srsName=EPSG:4326&count=1000` +
    `&cql_filter=${encodeURIComponent("zone_code LIKE 'ACZ%'")}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`WFS plan_zone ACZ ${res.status}`);
  const fc = (await res.json()) as FeatureCollection;

  const out: ActivityCentreFeature[] = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) continue;
    if (!overlapsMetro(turf.bbox(f))) continue;
    const props = f.properties as Record<string, unknown>;
    const zone = String(props?.zone_code ?? "").trim();
    if (!zone) continue;
    let simplified: Feature = f;
    try {
      simplified = turf.simplify(f, { tolerance: SIMPLIFY_TOLERANCE, highQuality: false, mutate: false });
    } catch {
      /* keep original */
    }
    out.push({
      type: "Feature",
      geometry: simplified.geometry as Polygon | MultiPolygon,
      properties: {
        z: zone,
        lga: props?.lga ? String(props.lga) : undefined,
      },
    });
  }
  if (out.length === 0) throw new Error("ACZ: 0 metro features - check cql_filter / bbox");

  await mkdir(PUBLIC_DATA, { recursive: true });
  const dest = path.join(PUBLIC_DATA, "activity-centres.json");
  const json = JSON.stringify({ type: "FeatureCollection", features: out });
  await writeFile(dest, json);
  console.log(
    `Wrote ${dest}: ${out.length} ACZ polygons, ${(Buffer.byteLength(json) / 1024).toFixed(0)} KB`
  );
  console.log("fetch-activity-centres complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
