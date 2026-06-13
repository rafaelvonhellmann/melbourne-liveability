/**
 * Urban heat at a dropped pin - the "Environment" v2 lens. Queries the Victorian
 * "Cooling and Greening Melbourne" Urban Heat 2018 layer (UHI18_M = average
 * Landsat-derived land-SURFACE-temperature uplift in degrees C vs a non-urban
 * vegetated baseline, ~30 m mesh-block resolution) at the exact point, via the
 * DTP ArcGIS REST service. Runtime, client-side (static-export safe), keyless,
 * CORS-open; never throws. Context only - never scored.
 *
 * Honest scope: this is SURFACE (skin) temperature uplift on a hot day, not air
 * temperature and not a heatwave forecast. A 2018 snapshot (historical character,
 * not a projection). CC BY 4.0 (c) State of Victoria (DTP).
 */
import type { LngLat } from "./buyer-location";
import { timeoutSignal } from "./fetch-timeout";
import { registryId } from "./source-ids";

const COOLING_GREENING_URL =
  "https://plan-gis.mapshare.vic.gov.au/arcgis/rest/services/CoolingGreening/CoolingGreening/MapServer";

/** Urban-heat layer (mesh-block Urban Heat 2018) on the CoolingGreening service. */
const UHI_LAYER = 55;

/** Source id in the data manifest (sources.json) for attribution + verify-sources. */
export const URBAN_HEAT_SOURCE_ID = registryId("vic-cooling-greening");

export type UrbanHeat = {
  /** Land-surface-temperature uplift vs non-urban baseline, degrees C. */
  uhiC: number;
  /** Plain-English band derived from uhiC (relative, for ELI5 copy). */
  band: "cooler" | "moderate" | "hot" | "very hot";
  sa2Name?: string;
};

function heatBand(uhiC: number): UrbanHeat["band"] {
  if (uhiC < 4) return "cooler";
  if (uhiC < 7) return "moderate";
  if (uhiC < 10) return "hot";
  return "very hot";
}

/**
 * Pull UHI18_M (+ SA2 name) out of an ArcGIS point-query response. Pure (no
 * network) so it is unit-testable. Returns null for any shape without a usable
 * numeric uplift.
 */
export function parseUrbanHeat(json: unknown): UrbanHeat | null {
  const features = (json as { features?: unknown }).features;
  if (!Array.isArray(features) || features.length === 0) return null;
  const attrs = (features[0] as { attributes?: Record<string, unknown> } | null)?.attributes;
  const uhi = Number(attrs?.UHI18_M);
  if (!Number.isFinite(uhi)) return null;
  const uhiC = Math.round(uhi * 10) / 10;
  const name = attrs?.SA2_NAME16;
  return {
    uhiC,
    band: heatBand(uhiC),
    sa2Name: typeof name === "string" ? name : undefined,
  };
}

/** Endpoint override for self-hosting / a proxy; defaults to the DTP service. */
function serviceUrl(): string {
  const u = process.env.NEXT_PUBLIC_COOLING_GREENING_URL;
  return (u && u.trim() ? u.trim() : COOLING_GREENING_URL).replace(/\/$/, "");
}

/**
 * Fetch the urban-heat uplift at `pin` ([lng, lat]). Never throws: returns null
 * when the point isn't covered (outside metro Melbourne) or the request fails -
 * callers then simply omit the heat card.
 */
export async function fetchUrbanHeat(
  pin: LngLat,
  opts: { signal?: AbortSignal } = {}
): Promise<UrbanHeat | null> {
  const url =
    `${serviceUrl()}/${UHI_LAYER}/query?geometry=${pin[0]},${pin[1]}` +
    `&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects` +
    `&outFields=UHI18_M,SA2_NAME16&returnGeometry=false&f=json`;
  const t = timeoutSignal(9000, opts.signal);
  try {
    const res = await fetch(url, { signal: t.signal });
    if (!res.ok) return null;
    return parseUrbanHeat(await res.json());
  } catch {
    return null;
  } finally {
    t.clear();
  }
}
