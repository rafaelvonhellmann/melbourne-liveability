/**
 * Tree canopy at a dropped pin - a v2 Environment/greenery lens. Queries the
 * Victorian "Vegetation Cover for Metropolitan Melbourne 2018" layer (PERANYTREE
 * = % of the ABS mesh block under any tree canopy 3 m+, ~aerial-derived) at the
 * exact point, via the same DTP CoolingGreening ArcGIS service used by the urban
 * heat lens. Runtime, client-side (static-export safe), keyless, CORS-open;
 * never throws. Context only - never scored. CC BY 4.0 (c) State of Victoria (DTP).
 */
import type { LngLat } from "./buyer-location";
import { timeoutSignal } from "./fetch-timeout";

const COOLING_GREENING_URL =
  "https://plan-gis.mapshare.vic.gov.au/arcgis/rest/services/CoolingGreening/CoolingGreening/MapServer";

/** "All trees (2018) (MB)" layer on the CoolingGreening service. */
const CANOPY_LAYER = 25;

/** Source id in the data manifest (sources.json) for attribution. */
export const TREE_CANOPY_SOURCE_ID = "vic-tree-canopy";

export type TreeCanopy = {
  /** % of the surrounding mesh block under tree canopy (3 m+). */
  canopyPct: number;
  /** Plain-English band (metro Melbourne averages ~15%). */
  band: "sparse" | "moderate" | "leafy" | "very leafy";
  sa2Name?: string;
};

function canopyBand(pct: number): TreeCanopy["band"] {
  if (pct < 8) return "sparse";
  if (pct < 18) return "moderate";
  if (pct < 28) return "leafy";
  return "very leafy";
}

/**
 * Pull PERANYTREE (+ SA2 name) out of an ArcGIS point-query response. Pure (no
 * network) so it is unit-testable. Returns null for any shape without a usable
 * numeric canopy %.
 */
export function parseTreeCanopy(json: unknown): TreeCanopy | null {
  const features = (json as { features?: unknown }).features;
  if (!Array.isArray(features) || features.length === 0) return null;
  const attrs = (features[0] as { attributes?: Record<string, unknown> } | null)?.attributes;
  const pct = Number(attrs?.PERANYTREE);
  if (!Number.isFinite(pct)) return null;
  const canopyPct = Math.round(pct * 10) / 10;
  const name = attrs?.SA2_NAME16;
  return {
    canopyPct,
    band: canopyBand(canopyPct),
    sa2Name: typeof name === "string" ? name : undefined,
  };
}

function serviceUrl(): string {
  const u = process.env.NEXT_PUBLIC_COOLING_GREENING_URL;
  return (u && u.trim() ? u.trim() : COOLING_GREENING_URL).replace(/\/$/, "");
}

/**
 * Fetch tree-canopy % at `pin` ([lng, lat]). Never throws: returns null when the
 * point isn't covered (outside metro Melbourne) or the request fails.
 */
export async function fetchTreeCanopy(
  pin: LngLat,
  opts: { signal?: AbortSignal } = {}
): Promise<TreeCanopy | null> {
  const url =
    `${serviceUrl()}/${CANOPY_LAYER}/query?geometry=${pin[0]},${pin[1]}` +
    `&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects` +
    `&outFields=PERANYTREE,SA2_NAME16&returnGeometry=false&f=json`;
  const t = timeoutSignal(9000, opts.signal);
  try {
    const res = await fetch(url, { signal: t.signal });
    if (!res.ok) return null;
    return parseTreeCanopy(await res.json());
  } catch {
    return null;
  } finally {
    t.clear();
  }
}
