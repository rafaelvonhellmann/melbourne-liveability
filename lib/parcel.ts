/**
 * Parcel (lot) size at a dropped pin - a RUNTIME client-side lookup against the
 * open Vicmap parcel WFS (CC BY 4.0, CORS-enabled). There is no land-area field
 * on the layer, so we derive area from the polygon with turf.area; and parcels
 * are millions statewide, so this is a per-pin query (never a bundled asset or a
 * per-SA2 median). Context only, never scored.
 *
 * The fetch (fetchParcelAreaAt) runs only in the browser, like the walk-isochrone
 * paid tier; the geometry math (bboxAround, pickParcelArea) is pure + unit-tested.
 */
import * as turf from "@turf/turf";
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from "geojson";

export type ParcelInfo = { areaM2: number; lot?: string; plan?: string };

const WFS = "https://opendata.maps.vic.gov.au/geoserver/wfs";
const TYPE = "open-data-platform:v_parcel_mp";

/** A small bbox around a point as [south, west, north, east] (WFS 2.0 lat,lon axis order). */
export function bboxAround(
  lng: number,
  lat: number,
  meters = 40
): [number, number, number, number] {
  const dLat = meters / 111320;
  const dLng = meters / (111320 * Math.cos((lat * Math.PI) / 180) || 1);
  return [lat - dLat, lng - dLng, lat + dLat, lng + dLng];
}

/** The parcel containing the point + its turf-derived area (m2), or null. */
export function pickParcelArea(
  point: [number, number],
  fc: FeatureCollection | null | undefined
): ParcelInfo | null {
  if (!fc?.features?.length) return null;
  const pt = turf.point(point);
  for (const f of fc.features as Feature[]) {
    const g = f.geometry;
    if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) continue;
    try {
      if (!turf.booleanPointInPolygon(pt, g as Polygon | MultiPolygon)) continue;
      const areaM2 = turf.area(f);
      if (!Number.isFinite(areaM2) || areaM2 <= 0) return null;
      const props = (f.properties ?? {}) as Record<string, unknown>;
      return {
        areaM2,
        lot: props.parcel_lot_number ? String(props.parcel_lot_number) : undefined,
        plan: props.parcel_plan_number ? String(props.parcel_plan_number) : undefined,
      };
    } catch {
      /* skip malformed geometry */
    }
  }
  return null;
}

/** Browser-only: query the Vicmap parcel WFS for the parcel at (lng, lat). */
export async function fetchParcelAreaAt(
  lng: number,
  lat: number,
  signal?: AbortSignal
): Promise<ParcelInfo | null> {
  const [s, w, n, e] = bboxAround(lng, lat);
  const url =
    `${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(TYPE)}` +
    `&outputFormat=application/json&srsName=EPSG:4326&count=30` +
    `&cql_filter=${encodeURIComponent(`BBOX(geom,${s},${w},${n},${e})`)}`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const fc = (await res.json()) as FeatureCollection;
    return pickParcelArea([lng, lat], fc);
  } catch {
    return null;
  }
}
