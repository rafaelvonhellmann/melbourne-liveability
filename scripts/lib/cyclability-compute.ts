import * as turf from "@turf/turf";
import RBush from "rbush";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import {
  classifyCycleway,
  summariseCyclability,
} from "../../lib/cyclability.js";
import type { Cyclability } from "../../lib/types.js";

/** OSM `out geom` way: inline node coordinates + tags. */
type OsmWay = {
  type?: string;
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
};

type Sa2Item = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  code: string;
  feat: Feature<Polygon | MultiPolygon>;
};

/**
 * Aggregate OSM cycling-infrastructure length per SA2 → cyclability summary.
 *
 * Each cycleway way is attributed in full to the SA2 that contains its midpoint
 * (a coarse, documented choice - a long trail straddling two SA2s lands wholly
 * in one). Length is straight-line geodesic via turf. A `Cyclability` is emitted
 * for every SA2 (index 0 where no infrastructure is mapped). Context-only.
 */
export function computeCyclabilityByCode(
  data: { elements?: OsmWay[] } | null,
  sa2GeomByCode: Map<string, Polygon | MultiPolygon>,
  opts: { sourceId: string; period: string }
): Map<string, Cyclability> {
  const tree = new RBush<Sa2Item>();
  const items: Sa2Item[] = [];
  const featByCode = new Map<string, Feature<Polygon | MultiPolygon>>();
  for (const [code, geom] of sa2GeomByCode) {
    const feat: Feature<Polygon | MultiPolygon> = {
      type: "Feature",
      properties: {},
      geometry: geom,
    };
    featByCode.set(code, feat);
    const b = turf.bbox(feat);
    if (!b.every(Number.isFinite)) continue;
    items.push({
      minX: b[0],
      minY: b[1],
      maxX: b[2],
      maxY: b[3],
      code,
      feat,
    });
  }
  tree.load(items);

  const agg = new Map<
    string,
    { separatedKm: number; onRoadKm: number; segments: number }
  >();

  for (const el of data?.elements ?? []) {
    if (el.type && el.type !== "way") continue;
    const geom = el.geometry;
    if (!geom || geom.length < 2) continue;
    const kind = classifyCycleway(el.tags);
    if (!kind) continue;

    const coords = geom.map((g) => [g.lon, g.lat] as [number, number]);
    let line;
    try {
      line = turf.lineString(coords);
    } catch {
      continue;
    }
    const lengthKm = turf.length(line, { units: "kilometers" });
    if (!(lengthKm > 0)) continue;

    let mid;
    try {
      mid = turf.along(line, lengthKm / 2, { units: "kilometers" });
    } catch {
      continue;
    }
    const [mx, my] = mid.geometry.coordinates;
    const candidates = tree.search({
      minX: mx,
      minY: my,
      maxX: mx,
      maxY: my,
    });
    let code: string | null = null;
    for (const c of candidates) {
      try {
        if (turf.booleanPointInPolygon(mid, c.feat)) {
          code = c.code;
          break;
        }
      } catch {
        /* skip degenerate polygon */
      }
    }
    if (!code) continue;

    const a = agg.get(code) ?? { separatedKm: 0, onRoadKm: 0, segments: 0 };
    if (kind === "separated") a.separatedKm += lengthKm;
    else a.onRoadKm += lengthKm;
    a.segments += 1;
    agg.set(code, a);
  }

  const out = new Map<string, Cyclability>();
  for (const [code, feat] of featByCode) {
    const areaKm2 = turf.area(feat) / 1_000_000;
    const a = agg.get(code) ?? { separatedKm: 0, onRoadKm: 0, segments: 0 };
    out.set(code, summariseCyclability({ ...a, areaKm2 }, opts));
  }
  return out;
}
