/**
 * Pure OSM-tag classifiers + de-duplication for the map POI pins built by
 * `scripts/build-poi.ts`. Extracted into a lib module so the build script can
 * import them and the unit tests can exercise them without running the script's
 * top-level `main()` (which reads raw files and writes pois.geojson).
 *
 * Tags are raw OSM key/values. Each predicate decides whether an element belongs
 * to a given pin category. Pins are context-only — never folded into scores.
 */
import type { Feature, Point } from "geojson";

export type OsmTags = Record<string, string>;

export function isPolice(tags: OsmTags): boolean {
  return (
    tags.amenity === "police" ||
    tags.office === "police" ||
    tags.building === "police"
  );
}

export function isPathologyLab(tags: OsmTags): boolean {
  const hc = tags.healthcare ?? "";
  const spec = tags["healthcare:speciality"] ?? tags.healthcare_speciality ?? "";
  return (
    /laboratory|sample_collection/i.test(hc) ||
    /pathology|diagnostic/i.test(spec) ||
    /pathology|laboratory|diagnostic/i.test(tags.name ?? "")
  );
}

/**
 * GP / general-clinic pin predicate. Deliberately EXCLUDES hospitals and
 * pathology/lab/imaging/diagnostic sites so a collection centre or radiology
 * clinic is not mislabelled as a "GP / clinic" pin (those have their own
 * `pathology_lab` category). This is the pin-layer definition only; the scored
 * `gpCount2km` indicator has its own (separate) filter in `normalize.ts`.
 */
export function isGpClinic(tags: OsmTags): boolean {
  if (tags.amenity === "hospital") return false;
  if (isPathologyLab(tags)) return false;
  const hc = tags.healthcare ?? "";
  // Non-GP clinical specialities that the broad `centre|clinic` match would
  // otherwise sweep in.
  if (/laboratory|sample_collection|radiology|imaging|diagnostic/i.test(hc)) {
    return false;
  }
  return (
    /doctors|clinic|health_centre/.test(tags.amenity ?? "") ||
    /doctor|clinic|centre/.test(hc)
  );
}

/**
 * NDIS / disability-service pin predicate. Requires an explicit disability or
 * NDIS signal. A bare `social_facility=day_care` is NOT treated as NDIS — most
 * day cares are childcare, not disability services (the previous `day_care`
 * shortcut produced false NDIS pins).
 */
export function isNdisProvider(tags: OsmTags): boolean {
  const name = tags.name ?? "";
  const brand = tags.brand ?? "";
  const operator = tags.operator ?? "";
  const combined = `${name} ${brand} ${operator}`;
  return (
    /\bndis\b/i.test(combined) ||
    /national disability/i.test(combined) ||
    tags["social_facility:for"] === "disabled" ||
    (tags.social_facility != null && /disability|ndis/i.test(combined))
  );
}

/** Place of worship of ANY faith (church, mosque, synagogue, temple, gurdwara…). */
export function isPlaceOfWorship(tags: OsmTags): boolean {
  return tags.amenity === "place_of_worship";
}

/**
 * Community / cultural gathering place — community + social centres and civic
 * arts/cultural centres. Deliberately faith-neutral and non-commercial: a venue
 * where residents gather, run by the community or council, not a private hall let
 * out for hire (those aren't tagged with these amenity values).
 */
export function isCommunityCentre(tags: OsmTags): boolean {
  return (
    tags.amenity === "community_centre" ||
    tags.amenity === "social_centre" ||
    tags.amenity === "arts_centre"
  );
}

export function isPostOffice(tags: OsmTags): boolean {
  return (
    tags.amenity === "post_office" ||
    tags.shop === "post_office" ||
    tags.post_office === "post_partner" ||
    /australia\s*post/i.test(tags.brand ?? "") ||
    /australia\s*post/i.test(tags.operator ?? "") ||
    /\bLPO\b/i.test(tags.name ?? "")
  );
}

type PoiProps = { pinType?: string; name?: string; osmUrl?: string };

/**
 * De-dup key for a built POI feature. ALWAYS namespaced by `pinType` so a single
 * OSM element that legitimately matches two categories (e.g. a clinic that is
 * also a pathology collection centre) survives under BOTH categories instead of
 * being collapsed to whichever was emitted first. `osmUrl` (when present) keeps
 * the key stable across re-fetches; otherwise fall back to name + coordinates.
 */
export function poiDedupeKey(props: PoiProps, coordKey: string): string {
  const within = props.osmUrl ?? `${props.name ?? ""}:${coordKey}`;
  return `${props.pinType ?? ""}::${within}`;
}

export function dedupeFeatures(features: Feature<Point>[]): Feature<Point>[] {
  const seen = new Set<string>();
  const out: Feature<Point>[] = [];
  for (const f of features) {
    const props = (f.properties ?? {}) as PoiProps;
    const [lon, lat] = f.geometry.coordinates;
    const key = poiDedupeKey(props, `${lon},${lat}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

type OsmElement = {
  type?: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: OsmTags;
};

/**
 * SCORED GP/clinic points — a LOCKED, deliberately narrow definition: OSM
 * *nodes* tagged amenity=doctors|clinic, returned as [lon, lat]. Clinics/doctors
 * mapped as building *ways* are intentionally EXCLUDED.
 *
 * Why: commit 32c5c83 widened the osm-health Overpass query to also fetch
 * `way[amenity~doctors|clinic]` (emitted with `out center`), which silently
 * raised the SCORED gpCount2km. Pinning the scored set to nodes keeps the
 * locked seven-domain Health composite independent of the (broader) map-pin
 * fetch. NOTE honestly: this is NARROWER than counting nodes+ways — it reverts
 * the scored basis to the pre-32c5c83 node-only set, so it lowers gpCount2km vs
 * a build that counted ways. This is the agreed "isolate" choice and is
 * documented in /methodology. CONTEXT layers (e.g. 15-minute walk access) must
 * use the full node+way set, NOT this scored set.
 */
export function scoredGpPoints(
  data: { elements?: OsmElement[] } | null
): [number, number][] {
  const pts: [number, number][] = [];
  for (const el of data?.elements ?? []) {
    if (el.type !== "node" || el.lat == null || el.lon == null) continue;
    if (!/doctors|clinic/.test(el.tags?.amenity ?? "")) continue;
    pts.push([el.lon, el.lat]);
  }
  return pts;
}
