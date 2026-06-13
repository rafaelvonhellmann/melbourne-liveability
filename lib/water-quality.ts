/**
 * Waterway (creek / river) health near a dropped pin - a v2 Water-quality lens.
 * Queries Melbourne Water's Healthy Waterways Strategy 2018 macroinvertebrate
 * habitat-suitability index (CURRENT_1 = 0-1 stream-condition score per reach) on
 * the Melbourne Water ArcGIS Online service, buffered around the point, and
 * averages the local reaches. Runtime, client-side, keyless, CORS-open (ArcGIS
 * Online); never throws. Context only - never scored.
 *
 * Honest scope: a MODELLED 2018 baseline waterway-condition index (not live water
 * quality), and "near" means within ~1 km of a mapped reach - so it omits itself
 * where there's no nearby waterway. CC BY 3.0 AU (c) Melbourne Water.
 */
import type { LngLat } from "./buyer-location";
import { timeoutSignal } from "./fetch-timeout";
import { registryId } from "./source-ids";

const MW_MACRO_URL =
  "https://services5.arcgis.com/ZSYwjtv8RKVhkXIL/arcgis/rest/services/MACROS_HSM_HWS/FeatureServer/1/query";

/** Source id in the data manifest (sources.json) for attribution. */
export const WATERWAY_SOURCE_ID = registryId("mw-hws-macros");

export type WaterwayHealth = {
  /** 0-100 condition score (averaged local reaches). */
  score: number;
  band: "very low" | "low" | "moderate" | "high" | "very high";
};

function band(score01: number): WaterwayHealth["band"] {
  if (score01 < 0.2) return "very low";
  if (score01 < 0.4) return "low";
  if (score01 < 0.6) return "moderate";
  if (score01 < 0.8) return "high";
  return "very high";
}

/**
 * Average CURRENT_1 across the reaches an ArcGIS query returned (the local
 * waterway condition). Pure (no network) so it is unit-testable; null when no
 * reach with a usable score is present.
 */
export function parseWaterwayHealth(json: unknown): WaterwayHealth | null {
  const features = (json as { features?: unknown }).features;
  if (!Array.isArray(features) || features.length === 0) return null;
  const vals: number[] = [];
  for (const f of features) {
    const v = Number((f as { attributes?: { CURRENT_1?: unknown } } | null)?.attributes?.CURRENT_1);
    if (Number.isFinite(v)) vals.push(v);
  }
  if (vals.length === 0) return null;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  return { score: Math.round(mean * 100), band: band(mean) };
}

function serviceUrl(): string {
  const u = process.env.NEXT_PUBLIC_MW_MACRO_URL;
  return u && u.trim() ? u.trim() : MW_MACRO_URL;
}

/**
 * Waterway health within ~1 km of `pin` ([lng, lat]). Never throws: returns null
 * when no mapped reach is nearby (not near a creek/river) or on failure.
 */
export async function fetchWaterwayHealth(
  pin: LngLat,
  opts: { signal?: AbortSignal } = {}
): Promise<WaterwayHealth | null> {
  const url =
    `${serviceUrl()}?geometry=${pin[0]},${pin[1]}&geometryType=esriGeometryPoint&inSR=4326` +
    `&distance=1000&units=esriSRUnit_Meter&spatialRel=esriSpatialRelIntersects` +
    `&outFields=CURRENT_1&returnGeometry=false&f=json`;
  const t = timeoutSignal(9000, opts.signal);
  try {
    const res = await fetch(url, { signal: t.signal });
    if (!res.ok) return null;
    return parseWaterwayHealth(await res.json());
  } catch {
    return null;
  } finally {
    t.clear();
  }
}
