/**
 * Builds public/data/pois.geojson from raw OSM / Vic hospital extracts.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Feature, FeatureCollection, Point } from "geojson";
import { RAW, PUBLIC_DATA } from "./lib/paths.js";

type OsmEl = {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function osmToFeatures(
  data: { elements?: OsmEl[] } | null,
  type: string,
  filter: (tags: Record<string, string>) => boolean
): Feature<Point>[] {
  const out: Feature<Point>[] = [];
  for (const el of data?.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const tags = el.tags ?? {};
    if (!filter(tags)) continue;
    out.push({
      type: "Feature",
      properties: {
        pinType: type,
        name: tags.name ?? type,
      },
      geometry: { type: "Point", coordinates: [lon, lat] },
    });
  }
  return out;
}

async function main() {
  const health = JSON.parse(
    await readFile(path.join(RAW, "osm-health.json"), "utf8").catch(() => "{}")
  );
  const schools = JSON.parse(
    await readFile(path.join(RAW, "osm-schools.json"), "utf8").catch(() => "{}")
  );
  const vic = JSON.parse(
    await readFile(path.join(RAW, "vic-hospitals.json"), "utf8").catch(() => "{}")
  ) as { points?: [number, number][] };

  const features: Feature<Point>[] = [
    ...osmToFeatures(health, "police", (t) => t.amenity === "police"),
    ...osmToFeatures(health, "gp", (t) => /doctors|clinic/.test(t.amenity ?? "")),
    ...osmToFeatures(health, "hospital", (t) => t.amenity === "hospital"),
    ...osmToFeatures(schools, "school", (t) => t.amenity === "school"),
    ...osmToFeatures(schools, "childcare", (t) => t.amenity === "kindergarten"),
  ];

  for (const [lon, lat] of vic.points ?? []) {
    features.push({
      type: "Feature",
      properties: { pinType: "hospital", name: "Hospital" },
      geometry: { type: "Point", coordinates: [lon, lat] },
    });
  }

  const fc: FeatureCollection = { type: "FeatureCollection", features };
  await mkdir(PUBLIC_DATA, { recursive: true });
  const out = path.join(PUBLIC_DATA, "pois.geojson");
  await writeFile(out, JSON.stringify(fc));
  console.log(`Wrote ${out} (${features.length} POIs)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
