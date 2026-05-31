/**
 * Builds public/data/pois.geojson from raw OSM / Vic hospital extracts.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Feature, FeatureCollection, Point } from "geojson";
import { RAW, PUBLIC_DATA } from "./lib/paths.js";
import { classifyOsmAmenity } from "../lib/walk-access.js";
import {
  isPolice,
  isPathologyLab,
  isNdisProvider,
  isPostOffice,
  isGpClinic,
  dedupeFeatures,
} from "./lib/poi-classify.js";

type OsmEl = {
  id?: number;
  type?: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function normalizeWebsite(tags: Record<string, string>): string | undefined {
  const raw = tags.website ?? tags["contact:website"];
  if (!raw?.trim()) return undefined;
  const t = raw.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function osmFeatureUrl(el: OsmEl): string | undefined {
  if (el.id == null || !el.type) return undefined;
  if (el.type !== "node" && el.type !== "way" && el.type !== "relation") {
    return undefined;
  }
  return `https://www.openstreetmap.org/${el.type}/${el.id}`;
}

function poiProperties(
  el: OsmEl,
  pinType: string,
  tags: Record<string, string>
): { pinType: string; name: string; url?: string; osmUrl?: string } {
  const props: { pinType: string; name: string; url?: string; osmUrl?: string } = {
    pinType,
    name: tags.name ?? tags.brand ?? pinType.replace(/_/g, " "),
  };
  const url = normalizeWebsite(tags);
  if (url) props.url = url;
  const osmUrl = osmFeatureUrl(el);
  if (osmUrl) props.osmUrl = osmUrl;
  return props;
}

function osmToFeatures(
  data: { elements?: OsmEl[] } | null,
  pinType: string,
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
      properties: poiProperties(el, pinType, tags),
      geometry: { type: "Point", coordinates: [lon, lat] },
    });
  }
  return out;
}

/** Everyday-amenity pins for the 15-min access context layer. */
function amenitiesToFeatures(
  data: { elements?: OsmEl[] } | null
): Feature<Point>[] {
  const out: Feature<Point>[] = [];
  for (const el of data?.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const tags = el.tags ?? {};
    const cat = classifyOsmAmenity(tags);
    if (!cat) continue;
    out.push({
      type: "Feature",
      properties: poiProperties(el, cat, tags),
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
  const post = JSON.parse(
    await readFile(path.join(RAW, "osm-post.json"), "utf8").catch(() => "{}")
  );
  const vic = JSON.parse(
    await readFile(path.join(RAW, "vic-hospitals.json"), "utf8").catch(() => "{}")
  ) as { points?: [number, number][] };
  const amenities = JSON.parse(
    await readFile(path.join(RAW, "osm-amenities.json"), "utf8").catch(() => "{}")
  );
  const clinical = JSON.parse(
    await readFile(path.join(RAW, "osm-clinical-social.json"), "utf8").catch(() => "{}")
  );

  const features = dedupeFeatures([
    ...osmToFeatures(health, "police", isPolice),
    ...osmToFeatures(health, "gp", isGpClinic),
    ...osmToFeatures(health, "hospital", (t) => t.amenity === "hospital"),
    ...osmToFeatures(schools, "school", (t) => t.amenity === "school"),
    ...osmToFeatures(
      schools,
      "childcare",
      (t) => /kindergarten|childcare|preschool/.test(t.amenity ?? "")
    ),
    ...osmToFeatures(post, "post_office", isPostOffice),
    ...osmToFeatures(clinical, "pathology_lab", isPathologyLab),
    ...osmToFeatures(clinical, "ndis_provider", isNdisProvider),
    ...amenitiesToFeatures(amenities),
  ]);

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
