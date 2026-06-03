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

/**
 * Drop degenerate rings/polygons left behind by `turf.bboxClip`.
 *
 * `bboxClip` uses Sutherland–Hodgman clipping, which on concave multipolygons
 * can emit rings with fewer than 4 positions (or empty polygons). Those make
 * `turf.intersect` (polyclip-ts) throw "not a valid Polygon or MultiPolygon",
 * which previously zeroed out the whole overlay. Removing the degenerate rings
 * yields a valid geometry whose area is identical to the clip, so the overlap
 * percentage is exact. Returns null if nothing valid remains.
 */
function sanitizeClipped(
  geom: Polygon | MultiPolygon | null | undefined
): Polygon | MultiPolygon | null {
  if (!geom) return null;
  if (geom.type === "Polygon") {
    const rings = geom.coordinates.filter((r) => r.length >= 4);
    return rings.length > 0 ? { type: "Polygon", coordinates: rings } : null;
  }
  if (geom.type === "MultiPolygon") {
    const polys = geom.coordinates
      .map((p) => p.filter((r) => r.length >= 4))
      .filter((p) => p.length > 0);
    return polys.length > 0 ? { type: "MultiPolygon", coordinates: polys } : null;
  }
  return null;
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

export function buildHazardIndex(
  overlay: FeatureCollection,
  opts: { simplifyTolerance?: number } = {}
): RBush<HazardItem> {
  const tree = new RBush<HazardItem>();
  const items: HazardItem[] = [];
  for (const f of overlay.features) {
    if (!f.geometry) continue;
    if (f.geometry.type !== "Polygon" && f.geometry.type !== "MultiPolygon") continue;
    let feat = f as Feature<Polygon | MultiPolygon>;
    // Optional pre-simplify for very vertex-dense overlays (e.g. the 16k detailed
    // fire-history scars) so the per-SA2 intersect stays tractable. The overlap
    // SHARE is area-level + caveated, so a ~150 m tolerance is immaterial.
    if (opts.simplifyTolerance) {
      try {
        feat = turf.simplify(feat, {
          tolerance: opts.simplifyTolerance,
          highQuality: false,
          mutate: false,
        });
      } catch {
        /* keep the original geometry if simplify fails */
      }
    }
    const item = bboxItem(feat);
    if (item) items.push(item);
  }
  tree.load(items);
  return tree;
}

/**
 * % of SA2 area covered by hazard overlay polygons (0–100).
 *
 * Performance note: the Vic planning overlays contain a handful of enormous
 * multipolygons (bushfire-prone-area blocks span whole rural districts with
 * 100k+ vertices). Running `turf.intersect` of an SA2 directly against those
 * full polygons is pathologically slow (superlinear in vertex count) and was
 * the blocker that made `data:build` unable to finish on constrained machines.
 *
 * Fix: before the heavy intersection we (1) prune candidates with the RBush
 * bbox index and (2) clip each candidate to the SA2 bounding box with the
 * linear-time `turf.bboxClip`. Because an SA2 polygon is always a subset of
 * its own bbox, clipping a candidate to that bbox discards only area that
 * could not possibly intersect the SA2 - so the resulting overlap area (and
 * thus the percentage) is identical to intersecting the full candidate, just
 * far cheaper. The summed-area semantics are unchanged.
 */
export function overlayPctInSa2(
  sa2Geom: Polygon | MultiPolygon,
  tree: RBush<HazardItem>
): number {
  const sa2Feat = toPolyFeature(sa2Geom);
  const total = turf.area(sa2Feat);
  if (total <= 0) return 0;

  const b = turf.bbox(sa2Feat);
  const sa2Bbox: [number, number, number, number] = [b[0], b[1], b[2], b[3]];
  const candidates = tree.search({
    minX: b[0],
    minY: b[1],
    maxX: b[2],
    maxY: b[3],
  });

  let covered = 0;
  for (const c of candidates) {
    try {
      // Cheap linear clip to the SA2 bbox first - turns the giant candidate
      // into a small local piece so the polygon-clipping intersect below is
      // fast. Exact for area because the SA2 lies entirely within its bbox.
      const clipped = turf.bboxClip(c.feature, sa2Bbox);
      const clean = sanitizeClipped(clipped.geometry as Polygon | MultiPolygon);
      if (!clean) continue;
      const inter = turf.intersect(
        turf.featureCollection([sa2Feat, toPolyFeature(clean)])
      );
      if (inter) covered += turf.area(inter);
    } catch {
      /* skip invalid intersections */
    }
  }
  return Math.min(100, (covered / total) * 100);
}
