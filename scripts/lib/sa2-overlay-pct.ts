import * as turf from "@turf/turf";
import RBush from "rbush";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";

type HazardItem = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  feature: Feature<Polygon | MultiPolygon>;
};

function toPolyFeature(geom: Polygon | MultiPolygon): Feature<Polygon | MultiPolygon> {
  return { type: "Feature", properties: {}, geometry: geom };
}

function bboxItem(f: Feature<Polygon | MultiPolygon>): HazardItem | null {
  const b = turf.bbox(f);
  if (!b.every(Number.isFinite)) return null;
  return {
    minX: b[0],
    minY: b[1],
    maxX: b[2],
    maxY: b[3],
    feature: f,
  };
}

export function buildHazardIndex(overlay: FeatureCollection): RBush<HazardItem> {
  const tree = new RBush<HazardItem>();
  const items: HazardItem[] = [];
  for (const f of overlay.features) {
    if (!f.geometry) continue;
    if (f.geometry.type !== "Polygon" && f.geometry.type !== "MultiPolygon") continue;
    const item = bboxItem(f as Feature<Polygon | MultiPolygon>);
    if (item) items.push(item);
  }
  tree.load(items);
  return tree;
}

/** % of SA2 area covered by hazard overlay polygons (0–100). */
export function overlayPctInSa2(
  sa2Geom: Polygon | MultiPolygon,
  tree: RBush<HazardItem>
): number {
  const sa2Feat = toPolyFeature(sa2Geom);
  const total = turf.area(sa2Feat);
  if (total <= 0) return 0;

  const b = turf.bbox(sa2Feat);
  const candidates = tree.search({
    minX: b[0],
    minY: b[1],
    maxX: b[2],
    maxY: b[3],
  });

  let covered = 0;
  for (const c of candidates) {
    try {
      const inter = turf.intersect(
        turf.featureCollection([sa2Feat, c.feature])
      );
      if (inter) covered += turf.area(inter);
    } catch {
      /* skip invalid intersections */
    }
  }
  return Math.min(100, (covered / total) * 100);
}
