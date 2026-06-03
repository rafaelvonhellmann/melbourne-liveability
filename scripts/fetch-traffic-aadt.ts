/**
 * DTP Annual Average Daily Traffic Volume (CC BY 4.0) - the measured "how busy
 * is the nearest road" layer for the Buyer Check. The DTP release is GeoJSON
 * (WGS84, no reprojection): arterial/highway segments with an AADT volume and a
 * heavy-vehicle share. Residential streets are NOT counted.
 *
 * We take the latest published year (2019), clip to Greater Melbourne, simplify
 * the geometry (~20 m) and round coordinates, writing a compact
 * public/data/traffic-aadt.json (~1.1 MB, lazy-loaded only when a pin-drop
 * report runs). Context only, never scored. Run `npm run data:traffic`.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import * as turf from "@turf/turf";
import type { FeatureCollection } from "geojson";
import { RAW, PUBLIC_DATA } from "./lib/paths.js";
import { downloadToFile } from "./lib/gov-fetch.js";
import type { TrafficSegment } from "../lib/traffic.js";

const AADT_YEAR = 2019;
const AADT_URL =
  "https://opendata.transport.vic.gov.au/dataset/26fafd1a-8d59-4da0-93cd-29f371147d8f/resource/425799c9-658c-41cf-b9b0-6c9a145856cf/download/yearly_aadt_volume_2019.geojson";

const METRO: [number, number, number, number] = [144.3, -38.55, 145.55, -37.35];
const SIMPLIFY_TOLERANCE = 0.0002; // ~20 m
const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

function overlapsMetro(bb: number[]): boolean {
  return !(bb[2] < METRO[0] || bb[0] > METRO[2] || bb[3] < METRO[1] || bb[1] > METRO[3]);
}

async function main() {
  console.log(`DTP Annual Average Daily Traffic Volume ${AADT_YEAR} (GeoJSON)...`);
  await mkdir(RAW, { recursive: true });
  const src = path.join(RAW, "traffic-aadt.geojson");
  await downloadToFile(AADT_URL, src);

  const fc = JSON.parse(await readFile(src, "utf8")) as FeatureCollection;
  const out: TrafficSegment[] = [];
  for (const f of fc.features) {
    if (f.geometry?.type !== "LineString") continue;
    const v = Number((f.properties as Record<string, unknown>)["Average Annual Daily Traffic Volume"]);
    if (!Number.isFinite(v) || v <= 0) continue;
    if (!overlapsMetro(turf.bbox(f))) continue;
    let simplified = f;
    try {
      simplified = turf.simplify(f, { tolerance: SIMPLIFY_TOLERANCE, highQuality: false, mutate: false });
    } catch {
      /* keep original on simplify failure */
    }
    const coords = (simplified.geometry as { coordinates: [number, number][] }).coordinates.map(
      (c) => [r5(c[0]), r5(c[1])] as [number, number]
    );
    const props = f.properties as Record<string, unknown>;
    out.push({
      r: String(props["Road Name"] ?? "").trim(),
      v: Math.round(v),
      h: Math.round(Number(props["Percentage of Heavy Vehicles"] ?? 0) * 100),
      c: coords,
    });
  }
  if (out.length === 0) throw new Error("AADT: 0 metro segments after clip - check bbox / attribute names");

  await mkdir(PUBLIC_DATA, { recursive: true });
  const dest = path.join(PUBLIC_DATA, "traffic-aadt.json");
  const json = JSON.stringify(out);
  await writeFile(dest, json);
  console.log(
    `Wrote ${dest}: ${out.length} metro segments (${AADT_YEAR}), ${(Buffer.byteLength(json) / 1024 / 1024).toFixed(2)} MB`
  );
  console.log("fetch-traffic-aadt complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
