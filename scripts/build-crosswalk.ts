/**
 * Builds crosswalk.json: SA2 ↔ suburb/LGA with population-weighted overlap.
 * Requires: npm run data:fetch
 * Run: npm run data:crosswalk
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as turf from "@turf/turf";
import RBush from "rbush";
import type {
  Feature,
  FeatureCollection,
  Point,
  Polygon,
  MultiPolygon,
} from "geojson";
import {
  type CrosswalkFile,
  type Sa2CrosswalkEntry,
  type SuburbOverlap,
} from "../lib/crosswalk-types.js";
import { getProp, featureGeometry } from "./lib/abs-geo.js";
import {
  PIPELINE_REGION,
  sa2RawName,
  salRawName,
  lgaRawName,
} from "./lib/pipeline-region.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, "..", "data", "raw");
const OUT_DIR = path.join(__dirname, "..", "data", "generated");

type SalIndexItem = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  feature: Feature;
  geom: Polygon | MultiPolygon;
  salCode: string;
  suburb: string;
};

type LgaItem = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  name: string;
  feature: Feature;
};

async function loadGeo(name: string): Promise<FeatureCollection> {
  const raw = await readFile(path.join(RAW_DIR, name), "utf8");
  return JSON.parse(raw) as FeatureCollection;
}

function toFeature(geom: Polygon | MultiPolygon, props: Record<string, unknown>): Feature {
  return { type: "Feature", properties: props, geometry: geom };
}

function normalizeSuburbName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\(.*\)/g, "")
    .trim();
}

function bboxEntries(
  bbox: [number, number, number, number]
): Pick<SalIndexItem, "minX" | "minY" | "maxX" | "maxY"> {
  return { minX: bbox[0], minY: bbox[1], maxX: bbox[2], maxY: bbox[3] };
}

function intersectAreaKm2(
  sa2Geom: Polygon | MultiPolygon,
  otherGeom: Polygon | MultiPolygon
): number {
  try {
    const sa2F = toFeature(sa2Geom, {});
    const otherF = toFeature(otherGeom, {});
    const inter = turf.intersect(
      turf.featureCollection([sa2F, otherF]) as FeatureCollection<
        Polygon | MultiPolygon
      >
    );
    if (!inter) return 0;
    return turf.area(inter) / 1_000_000;
  } catch {
    return 0;
  }
}

function lgaForPoint(
  pt: Feature<Point>,
  lgaTree: RBush<LgaItem>
): string {
  if (pt.geometry.type !== "Point") return "Unknown";
  const [lng, lat] = pt.geometry.coordinates as [number, number];
  const hits = lgaTree.search({ minX: lng, minY: lat, maxX: lng, maxY: lat });
  for (const lga of hits) {
    if (
      turf.booleanPointInPolygon(
        pt,
        lga.feature as Feature<Polygon | MultiPolygon>
      )
    ) {
      return lga.name;
    }
  }
  return "Unknown";
}

async function main() {
  const [sa2Fc, salFc, lgaFc] = await Promise.all([
    loadGeo(sa2RawName()),
    loadGeo(salRawName()),
    loadGeo(lgaRawName()),
  ]);

  const regionBbox = turf.bbox(sa2Fc);

  const salTree = new RBush<SalIndexItem>();
  const salItems: SalIndexItem[] = [];

  for (const f of salFc.features) {
    const g = featureGeometry(f);
    const salCode = getProp(f, ["SAL_CODE_2021", "SAL_CODE21"]);
    const suburb = getProp(f, ["SAL_NAME_2021", "SAL_NAME21"]);
    if (!g || !salCode || !suburb) continue;
    const bb = turf.bbox(toFeature(g, {})) as [number, number, number, number];
    const c = turf.centroid(toFeature(g, {}));
    const [lng, lat] = c.geometry.coordinates;
    if (
      lng < regionBbox[0] ||
      lng > regionBbox[2] ||
      lat < regionBbox[1] ||
      lat > regionBbox[3]
    ) {
      continue;
    }
    salItems.push({
      ...bboxEntries(bb),
      feature: f,
      geom: g,
      salCode,
      suburb,
    });
  }
  salTree.load(salItems);
  console.log(
    `SAL index: ${salItems.length} suburbs in ${PIPELINE_REGION.label} envelope`
  );

  const lgaTree = new RBush<LgaItem>();
  const lgaItems: LgaItem[] = [];
  for (const f of lgaFc.features) {
    const name = getProp(f, ["LGA_NAME_2021", "LGA_NAME21"]);
    const g = featureGeometry(f);
    if (!name || !g) continue;
    const feat = toFeature(g, { name });
    const bb = turf.bbox(feat) as [number, number, number, number];
    lgaItems.push({ ...bboxEntries(bb), name, feature: feat });
  }
  lgaTree.load(lgaItems);

  const sa2ToSuburb: Record<string, Sa2CrosswalkEntry> = {};
  const suburbToSa2: CrosswalkFile["suburbToSa2"] = {};
  const suburbAliases: CrosswalkFile["suburbAliases"] = {};

  let processed = 0;
  for (const sa2 of sa2Fc.features) {
    const sa2Code = getProp(sa2, ["SA2_CODE_2021", "SA2_CODE21"]);
    const sa2Name = getProp(sa2, ["SA2_NAME_2021", "SA2_NAME21"]);
    const sa2Geom = featureGeometry(sa2);
    if (!sa2Code || !sa2Name || !sa2Geom) continue;

    const sa2Bbox = turf.bbox(toFeature(sa2Geom, {})) as [number, number, number, number];
    const candidates = salTree.search(bboxEntries(sa2Bbox));

    const overlaps: { sal: SalIndexItem; areaKm2: number }[] = [];
    for (const sal of candidates) {
      const areaKm2 = intersectAreaKm2(sa2Geom, sal.geom);
      if (areaKm2 >= 1e-6) overlaps.push({ sal, areaKm2 });
    }

    const totalArea = overlaps.reduce((s, o) => s + o.areaKm2, 0);
    const suburbs: SuburbOverlap[] = [];

    for (const o of overlaps) {
      const weight = totalArea > 0 ? o.areaKm2 / totalArea : 0;
      if (weight < 1e-6) continue;
      const centroid = turf.centroid(toFeature(o.sal.geom, {})) as Feature<Point>;
      const lgaName = lgaForPoint(centroid, lgaTree);

      suburbs.push({
        suburb: o.sal.suburb,
        salCode: o.sal.salCode,
        lga: lgaName,
        weight,
        method: "area-weighted",
      });

      if (!suburbToSa2[o.sal.salCode]) suburbToSa2[o.sal.salCode] = [];
      suburbToSa2[o.sal.salCode].push({ sa2Code, weight });

      const alias = normalizeSuburbName(o.sal.suburb);
      if (!suburbAliases[alias]) suburbAliases[alias] = [];
      if (!suburbAliases[alias].includes(o.sal.salCode)) {
        suburbAliases[alias].push(o.sal.salCode);
      }
    }

    suburbs.sort((a, b) => b.weight - a.weight);
    sa2ToSuburb[sa2Code] = { sa2Code, sa2Name, suburbs };
    processed++;
    if (processed % 50 === 0) console.log(`  ${processed}/${sa2Fc.features.length} SA2...`);
  }

  for (const salCode of Object.keys(suburbToSa2)) {
    suburbToSa2[salCode].sort((a, b) => b.weight - a.weight);
  }

  await mkdir(OUT_DIR, { recursive: true });
  // The crosswalk's region field stays the GCCSA code (e.g. "2GMEL") - the
  // registry is the source of truth; the value is unchanged for Melbourne.
  const out: CrosswalkFile = {
    region: PIPELINE_REGION.gccsa,
    generatedAt: new Date().toISOString(),
    sa2ToSuburb,
    suburbToSa2,
    suburbAliases,
  };

  const outPath = path.join(OUT_DIR, "crosswalk.json");
  await writeFile(outPath, JSON.stringify(out), "utf8");
  console.log(`Wrote ${outPath} (${Object.keys(sa2ToSuburb).length} SA2)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
