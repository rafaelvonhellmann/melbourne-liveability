/**
 * Shared decoding of Overpass `out center` extracts into [lon, lat] points.
 *
 * The fetches use `nwr[...]` (node + way + relation) with `out center`, so an
 * element carries its coordinate either inline (`lat`/`lon` on nodes) or as a
 * representative `center` point (ways and multipolygon relations). Counting
 * nodes only was the root cause of the AMENITY-AUDIT.md undercounts (cafes
 * -45% in Brighton, schools -75%); this module is the single place that
 * understands both shapes, shared by normalize.ts and apply-walk-access.ts.
 */

export type OsmEl = {
  id?: number;
  type?: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

/**
 * Representative point of one Overpass element: node coords, else the
 * `out center` centroid for ways/relations. Null when neither is present.
 */
export function osmPointOf(el: OsmEl): [number, number] | null {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;
  return [lon, lat];
}

/** All decodable element points, optionally filtered by tags. */
export function osmPoints(
  data: { elements?: OsmEl[] } | null,
  filter?: (tags: Record<string, string>) => boolean
): [number, number][] {
  const pts: [number, number][] = [];
  for (const el of data?.elements ?? []) {
    const pt = osmPointOf(el);
    if (!pt) continue;
    if (filter && !filter(el.tags ?? {})) continue;
    pts.push(pt);
  }
  return pts;
}

/**
 * Childcare category predicate for the schools extract. The fetch already
 * retrieved amenity=childcare (380 elements metro-wide) but the old
 * `=== "kindergarten"` filters discarded them, zeroing childcare counts in
 * growth suburbs (Tarneit -100%, Box Hill -67% per AMENITY-AUDIT.md).
 */
export function isChildcareAmenity(tags: Record<string, string>): boolean {
  return /^(kindergarten|childcare|preschool)$/.test(tags.amenity ?? "");
}
