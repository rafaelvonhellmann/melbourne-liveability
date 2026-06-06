/**
 * "How far can you get" reachability isochrone for the Buyer Location Check -
 * the feature inspired by isoportugal (house price x car reachability): from the
 * dropped pin, the polygon you can actually reach on the street network within a
 * time budget, by car or on foot. We then list which Melbourne suburbs fall
 * inside it and how they score on our open-data liveability blend (our honest
 * substitute for isoportugal's sale-price shading - we don't hold sale prices).
 *
 * Same design constraints as walk-isochrone.ts / route-drive.ts: a runtime,
 * client-side fetch (static-export safe, no server route), provider-isolated
 * (OpenRouteService isochrones), and never throwing to the caller. Reuses the
 * shared ORS isochrone response parser (parseOrsIsochrone) so the response shape
 * lives in one place. OSM-derived routing (ODbL); attribute contributors.
 */
import type { Polygon, MultiPolygon } from "geojson";
import type { LngLat } from "./buyer-location";
import { timeoutSignal } from "./fetch-timeout";
import { parseOrsIsochrone } from "./walk-isochrone";

export type ReachMode = "drive" | "walk";

const ORS_ISOCHRONES = "https://api.openrouteservice.org/v2/isochrones";

/** ORS routing profile for each travel mode. Exported for testing. */
export function reachProfile(mode: ReachMode): string {
  return mode === "drive" ? "driving-car" : "foot-walking";
}

/** Time budgets offered per mode (minutes). Walk tops out lower than drive. */
export const REACH_MINUTES: Record<ReachMode, number[]> = {
  drive: [15, 30, 45],
  walk: [10, 20, 30],
};

/** ORS API key (shared with walk-isochrone / route-drive). Public by necessity. */
function orsApiKey(): string | undefined {
  const k = process.env.NEXT_PUBLIC_ORS_API_KEY;
  return k && k.trim() ? k.trim() : undefined;
}

/** Whether the reachability feature is available in this deployment. */
export function isReachabilityConfigured(): boolean {
  return orsApiKey() !== undefined;
}

/**
 * Endpoint for a mode. Defaults to ORS; override the base with
 * NEXT_PUBLIC_ISOCHRONE_BASE_URL to point at self-hosted ORS or a key-hiding
 * proxy that returns an ORS-compatible FeatureCollection.
 */
function isochroneUrl(mode: ReachMode): string {
  const base = process.env.NEXT_PUBLIC_ISOCHRONE_BASE_URL;
  const root = base && base.trim() ? base.trim().replace(/\/$/, "") : ORS_ISOCHRONES;
  return `${root}/${reachProfile(mode)}`;
}

export type ReachResult =
  | { ok: true; geom: Polygon | MultiPolygon }
  | { ok: false; reason: string };

/**
 * Fetch a street-network reachability isochrone for `pin` ([lng, lat]) covering
 * `minutes` of travel by `mode`. Never throws: returns `{ ok: false }` when not
 * configured, the request fails, or no polygon comes back.
 */
export async function fetchReachabilityIsochrone(
  pin: LngLat,
  mode: ReachMode,
  minutes: number,
  opts: { signal?: AbortSignal } = {}
): Promise<ReachResult> {
  const key = orsApiKey();
  if (!key) return { ok: false, reason: "not-configured" };

  const seconds = Math.max(60, Math.round(minutes * 60));
  const t = timeoutSignal(12000, opts.signal);
  try {
    const res = await fetch(isochroneUrl(mode), {
      method: "POST",
      signal: t.signal,
      headers: {
        Authorization: key,
        "Content-Type": "application/json",
        Accept: "application/geo+json, application/json",
      },
      body: JSON.stringify({ locations: [pin], range: [seconds], range_type: "time" }),
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
