/**
 * Victorian Government School Zones (Dept of Education, CC BY 4.0) - the
 * address-level "what school am I zoned to" layer for the Buyer Check. The
 * DataVic release ships GeoJSON (CRS84 / WGS84, no reprojection) inside a zip.
 *
 * We take the Primary (P-6) and Secondary Year 7 integrated zones - the two a
 * buyer cares about most - clip to Greater Melbourne, simplify the boundaries
 * (~30 m, immaterial at the verify-the-exact-address level we caveat to) and
 * write a compact public/data/school-zones.json (~0.6 MB, lazy-loaded only when
 * a pin-drop report runs). Context only, never scored.
 *
 * Refresh: annual (zones are set per school year). Bump SCHOOL_ZONES_URL to the
 * latest DataVic release. Run `npm run data:school-zones`.
 */
import unzipper from "unzipper";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { PUBLIC_DATA } from "./lib/paths.js";
import { downloadToFile } from "./lib/gov-fetch.js";
import { RAW } from "./lib/paths.js";
import type { SchoolZoneFeature } from "../lib/school-zones.js";

// 2026 school year zones (dv418, published Mar 2026).
const SCHOOL_ZONES_URL =
  "https://www.education.vic.gov.au/Documents/about/research/datavic/dv418_DataVic_School_Zones_2026_MAR26.zip";
const PRIMARY_ENTRY = "Primary_Integrated";
const SECONDARY_ENTRY = "Secondary_Integrated_Year7";

// Greater Melbourne bbox [west, south, east, north] - generous; rural zones dropped.
const METRO: [number, number, number, number] = [144.3, -38.55, 145.55, -37.35];
const SIMPLIFY_TOLERANCE = 0.0003; // ~30 m

function overlapsMetro(bb: number[]): boolean {
  return !(bb[2] < METRO[0] || bb[0] > METRO[2] || bb[3] < METRO[1] || bb[1] > METRO[3]);
}

/** Metro-clip + simplify one zone FeatureCollection into compact {s} features. */
function slim(fc: FeatureCollection): { feats: SchoolZoneFeature[]; year: number | undefined } {
  const out: SchoolZoneFeature[] = [];
  let year: number | undefined;
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) continue;
    if (!overlapsMetro(turf.bbox(f))) continue;
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const name = String(props.School_Name ?? props.Campus_Name ?? "").trim();
    if (!name) continue;
    if (year === undefined && props.Boundary_Year != null) year = Number(props.Boundary_Year);
    let simplified: Feature;
    try {
      simplified = turf.simplify(f, { tolerance: SIMPLIFY_TOLERANCE, highQuality: false, mutate: false });
    } catch {
      simplified = f;
    }
    out.push({
      type: "Feature",
      geometry: simplified.geometry as Polygon | MultiPolygon,
      properties: { s: name },
    });
  }
  return { feats: out, year };
}

async function readEntry(zip: unzipper.CentralDirectory, contains: string): Promise<FeatureCollection> {
  const entry = zip.files.find((f) => f.path.includes(contains) && f.path.endsWith(".geojson"));
  if (!entry) throw new Error(`School zones: no .geojson entry matching "${contains}" in the zip`);
  return JSON.parse((await entry.buffer()).toString("utf8")) as FeatureCollection;
}

async function main() {
  console.log("Victorian Government School Zones (DataVic, GeoJSON)...");
  await mkdir(RAW, { recursive: true });
  const zipPath = path.join(RAW, "school-zones.zip");
  await downloadToFile(SCHOOL_ZONES_URL, zipPath);

  const zip = await unzipper.Open.file(zipPath);
  const primary = slim(await readEntry(zip, PRIMARY_ENTRY));
  const secondary = slim(await readEntry(zip, SECONDARY_ENTRY));
  const year = primary.year ?? secondary.year;
  if (primary.feats.length === 0 || secondary.feats.length === 0) {
    throw new Error("School zones: 0 metro zones after clip - check bbox / entry names");
  }

  const payload = { year, primary: primary.feats, secondary: secondary.feats };
  await mkdir(PUBLIC_DATA, { recursive: true });
  const dest = path.join(PUBLIC_DATA, "school-zones.json");
  const json = JSON.stringify(payload);
  await writeFile(dest, json);
  console.log(
    `Wrote ${dest}: year ${year}, ${primary.feats.length} primary + ${secondary.feats.length} secondary(Y7) metro zones, ${(Buffer.byteLength(json) / 1024 / 1024).toFixed(2)} MB`
  );
  console.log("fetch-school-zones complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
