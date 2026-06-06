/**
 * "How far can you get" reachability isochrone for the Buyer Location Check -
 * the feature inspired by isoportugal (house price x car reachability): from the
 * dropped pin, the polygon you can actually reach on the street network within a
 * time budget, by car or on foot. We then list which Melbourne suburbs fall
 * inside it and how they score on our open-data liveability blend (our honest
 * substitute for isoportugal's sale-price shading - we don't hold sale prices).
 *
 * Keyless by default: uses the public OpenStreetMap Valhalla isochrone service
 * (no API key, CORS-open) so the feature works on the static deploy out of the
 * box. If NEXT_PUBLIC_ORS_API_KEY is set, it upgrades to OpenRouteService
 * isochrones (higher quotas / your own key). Either way the response is reduced
 * to a Polygon/MultiPolygon by the shared parseOrsIsochrone parser.
 *
 * Same design constraints as walk-isochrone.ts / route-drive.ts: a runtime,
 * client-side fetch (static-export safe, no server route), provider-isolated,
 * and never throwing to the caller. OSM-derived routing (ODbL); attribute OSM.
 */
import type { Polygon, MultiPolygon } from "geojson";
import type { LngLat } from "./buyer-location";
import { timeoutSignal } from "./fetch-timeout";
import { parseOrsIsochrone } from "./walk-isochrone";

export type ReachMode = "drive" | "walk";

const ORS_ISOCHRONES = "https://api.openrouteservice.org/v2/isochrones";
const VALHALLA_ISOCHRONE = "https://valhalla1.openstreetmap.de/isochrone";

/** ORS routing profile for each travel mode. Exported for testing. */
export function reachProfile(mode: ReachMode): string {
  return mode === "drive" ? "driving-car" : "foot-walking";
}

/** Valhalla costing model for each travel mode. Exported for testing. */
export function valhallaCosting(mode: ReachMode): string {
  return mode === "drive" ? "auto" : "pedestrian";
}

/** Time budgets offered per mode (minutes). Walk tops out lower than drive. */
export const REACH_MINUTES: Record<ReachMode, number[]> = {
  drive: [15, 30, 45],
  walk: [10, 20, 30],
};

/** Optional ORS API key (shared with walk-isochrone / route-drive). */
function orsApiKey(): string | undefined {
  const k = process.env.NEXT_PUBLIC_ORS_API_KEY;
  return k && k.trim() ? k.trim() : undefined;
}

/**
 * Always true: the feature has a keyless default (public Valhalla), so it is
 * available on every deploy. Kept as a hook so a deployment could disable it.
 */
export function isReachabilityConfigured(): boolean {
  return true;
}

/** Override the Valhalla endpoint (e.g. self-hosted) via env; else the OSM one. */
function valhallaUrl(): string {
  const u = process.env.NEXT_PUBLIC_VALHALLA_ISOCHRONE_URL;
  return u && u.trim() ? u.trim() : VALHALLA_ISOCHRONE;
}

/** ORS endpoint for a mode. Base overridable via NEXT_PUBLIC_ISOCHRONE_BASE_URL. */
function orsUrl(mode: ReachMode): string {
  const base = process.env.NEXT_PUBLIC_ISOCHRONE_BASE_URL;
  const root = base && base.trim() ? base.trim().replace(/\/$/, "") : ORS_ISOCHRONES;
  return `${root}/${reachProfile(mode)}`;
}

export type ReachResult =
  | { ok: true; geom: Polygon | MultiPolygon }
  | { ok: false; reason: string };

/**
 * Fetch a street-network reachability isochrone for `pin` ([lng, lat]) covering
 * `minutes` of travel by `mode`. Uses ORS when a key is set, else the keyless
 * public Valhalla service. Never throws: returns `{ ok: false }` on any failure.
 */
export async function fetchReachabilityIsochrone(
  pin: LngLat,
  mode: ReachMode,
  minutes: number,
  opts: { signal?: AbortSignal } = {}
): Promise<ReachResult> {
  const key = orsApiKey();
  const t = timeoutSignal(12000, opts.signal);
  try {
    const res = key
      ? await fetch(orsUrl(mode), {
          method: "POST",
          signal: t.signal,
          headers: {
            Authorization: key,
            "Content-Type": "application/json",
            Accept: "application/geo+json, application/json",
          },
          body: JSON.stringify({
            locations: [pin],
            range: [Math.max(60, Math.round(minutes * 60))],
            range_type: "time",
          }),
        })
      : await fetch(valhallaUrl(), {
          method: "POST",
          signal: t.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locations: [{ lat: pin[1], lon: pin[0] }],
            costing: valhallaCosting(mode),
            contours: [{ time: Math.max(1, Math.round(minutes)) }],
            polygons: true,
          }),
        });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const geom = parseOrsIsochrone(await res.json());
    if (!geom) return { ok: false, reason: "no-geometry" };
    return { ok: true, geom };
  } catch (e) {
    return { ok: false, reason: (e as Error)?.name === "AbortError" ? "aborted" : "network" };
  } finally {
    t.clear();
  }
}
