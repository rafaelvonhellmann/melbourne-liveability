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
import { timeoutSignal } from "./fetch-timeout";

export type ParcelInfo = { areaM2: number; lot?: string; plan?: string };

/**
 * ParcelInfo plus the outer boundary ring (lng,lat) of the polygon part that
 * contains the point - enough to draw the tiny static lot outline on the
 * parcel-confirmation card without a second map instance.
 */
export type ParcelShape = ParcelInfo & { ring: [number, number][] };

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

/**
 * The parcel containing the point: turf-derived area (m2), lot/plan, and the
 * outer ring of the polygon part under the point (for the confirm-card
 * outline). Area stays the FULL feature area (all MultiPolygon parts), exactly
 * as before; the ring is display-only. Returns null when nothing contains the
 * point.
 */
export function pickParcelShape(
  point: [number, number],
  fc: FeatureCollection | null | undefined
): ParcelShape | null {
  if (!fc?.features?.length) return null;
  const pt = turf.point(point);
  for (const f of fc.features as Feature[]) {
    const g = f.geometry;
    if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) continue;
    try {
      if (!turf.booleanPointInPolygon(pt, g as Polygon | MultiPolygon)) continue;
      const areaM2 = turf.area(f);
      if (!Number.isFinite(areaM2) || areaM2 <= 0) continue;
      // Outer ring of the part under the point (MultiPolygon: find that part).
      let rawRing: number[][] | undefined;
      if (g.type === "Polygon") {
        rawRing = g.coordinates[0] as number[][];
      } else {
        for (const part of g.coordinates) {
          const poly: Polygon = { type: "Polygon", coordinates: part as Polygon["coordinates"] };
          if (turf.booleanPointInPolygon(pt, poly)) {
            rawRing = part[0] as number[][];
            break;
          }
        }
        rawRing = rawRing ?? (g.coordinates[0]?.[0] as number[][] | undefined);
      }
      const ring: [number, number][] = (rawRing ?? [])
        .filter((c) => Array.isArray(c) && c.length >= 2)
        .map((c) => [c[0], c[1]] as [number, number]);
      const props = (f.properties ?? {}) as Record<string, unknown>;
      return {
        areaM2,
        lot: props.parcel_lot_number ? String(props.parcel_lot_number) : undefined,
        plan: props.parcel_plan_number ? String(props.parcel_plan_number) : undefined,
        ring,
      };
    } catch {
      /* skip malformed geometry */
    }
  }
  return null;
}

/** The parcel containing the point + its turf-derived area (m2), or null. */
export function pickParcelArea(
  point: [number, number],
  fc: FeatureCollection | null | undefined
): ParcelInfo | null {
  const s = pickParcelShape(point, fc);
  return s ? { areaM2: s.areaM2, lot: s.lot, plan: s.plan } : null;
}

/**
 * Browser-only: query the Vicmap parcel WFS for the parcel polygon at
 * (lng, lat) - area + lot/plan + the outer ring for the confirm-card outline.
 */
export async function fetchParcelShapeAt(
  lng: number,
  lat: number,
  signal?: AbortSignal
): Promise<ParcelShape | null> {
  const [s, w, n, e] = bboxAround(lng, lat);
  const url =
    `${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(TYPE)}` +
    `&outputFormat=application/json&srsName=EPSG:4326&count=30` +
    `&cql_filter=${encodeURIComponent(`BBOX(geom,${s},${w},${n},${e})`)}`;
  // The Vicmap WFS is a government GeoServer that can stall for a long time under
  // load. Always cap the request (combined with any caller signal) so it can
  // never hang the buyer report - lot size is optional context, not worth a wait.
  const t = timeoutSignal(8000, signal);
  try {
    const res = await fetch(url, { signal: t.signal });
    if (!res.ok) return null;
    const fc = (await res.json()) as FeatureCollection;
    return pickParcelShape([lng, lat], fc);
  } catch {
    return null;
  } finally {
    t.clear();
  }
}

/** Browser-only: query the Vicmap parcel WFS for the parcel at (lng, lat). */
export async function fetchParcelAreaAt(
  lng: number,
  lat: number,
  signal?: AbortSignal
): Promise<ParcelInfo | null> {
  return fetchParcelShapeAt(lng, lat, signal);
}
