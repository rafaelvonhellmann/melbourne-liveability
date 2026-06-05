/**
 * Paid-tier "precise walk access" for the Buyer Location Check.
 *
 * The free tier answers "what's within ~15 min on foot of this pin" with
 * straight-line (haversine) distance - honest but it overstates real walking
 * access (see {@link amenitiesNear} in ./buyer-location and the caveat copy in
 * BuyerReport). This module is the opt-in upgrade: it asks a routing service for
 * a true street-network walk *isochrone* (the polygon actually reachable on foot
 * in N minutes) and classifies the same already-loaded POIs by whether they fall
 * inside that polygon - not by crow-flies radius.
 *
 * Design constraints honoured here:
 *  - Static export (`output: "export"`): everything is a *runtime, client-side*
 *    fetch. No build step, no Next API/server route, no new server dependency.
 *  - Pure vs networked split: the network call ({@link fetchWalkIsochrone}) and
 *    response parsing ({@link parseOrsIsochrone}) live here; turning the polygon
 *    into reachability is pure and lives in the report engine - `getNearbyAmenities`
 *    in ./buyer-report classifies the already-loaded POIs by isochrone containment
 *    (it already imports `pointInPolygon`), so the report engine stays network-free.
 *  - Provider-agnostic: the network call is isolated in {@link fetchWalkIsochrone}
 *    and the response shape in {@link parseOrsIsochrone}, so swapping the backend
 *    (Mapbox, a key-hiding proxy, or - with its own parser - Valhalla) is a small,
 *    contained change.
 *
 * Default backend: OpenRouteService isochrones (`foot-walking`, time range).
 * OSM-derived (ODbL); attribute contributors.
 *
 * Honesty / security caveats (deliberately documented, not hidden):
 *  - A `NEXT_PUBLIC_*` key is visible in the client bundle. That is acceptable
 *    for an opt-in prototype; production hardening = set
 *    `NEXT_PUBLIC_WALK_ISOCHRONE_URL` to a thin server proxy that holds the key
 *    and forwards to ORS (the response stays ORS-shaped, so no code change here).
 *  - ORS's free tier is rate-limited (~2k requests/day). This is why precise
 *    routing is opt-in per pin, not the default for every pin drop.
 */
import type { Polygon, MultiPolygon } from "geojson";
import type { LngLat } from "./buyer-location";
import { timeoutSignal } from "./fetch-timeout";

/** Walk budget for the buyer "on foot" check (minutes / seconds). */
export const WALK_MINUTES = 15;
export const WALK_RANGE_SECONDS = WALK_MINUTES * 60;

/** Default OpenRouteService isochrones endpoint (foot-walking profile). */
const ORS_FOOT_ISOCHRONE_URL =
  "https://api.openrouteservice.org/v2/isochrones/foot-walking";

/** ORS API key, if configured. Public by necessity (client-side fetch). */
function orsApiKey(): string | undefined {
  const k = process.env.NEXT_PUBLIC_ORS_API_KEY;
  return k && k.trim() ? k.trim() : undefined;
}

/**
 * Endpoint to POST to. Defaults to ORS; override with
 * `NEXT_PUBLIC_WALK_ISOCHRONE_URL` to point at a self-hosted ORS or a
 * key-hiding proxy that returns an ORS-compatible GeoJSON FeatureCollection.
 */
function isochroneUrl(): string {
  const u = process.env.NEXT_PUBLIC_WALK_ISOCHRONE_URL;
  return u && u.trim() ? u.trim() : ORS_FOOT_ISOCHRONE_URL;
}

/**
 * Whether the precise-walk (paid-tier) path is available in this deployment.
 * Mirrors the optional-feature env gating used elsewhere (Formspree alerts /
 * feedback). When false, callers keep the free straight-line behaviour and the
 * opt-in button is never rendered.
 */
export function isPreciseWalkConfigured(): boolean {
  return orsApiKey() !== undefined;
}

export type IsochroneResult =
  | { ok: true; geom: Polygon | MultiPolygon }
  | { ok: false; reason: string };

/**
 * Pull the isochrone polygon out of an OpenRouteService isochrones response.
 * Pure (no network) so it is unit-testable. Returns null for any shape that is
 * not a usable Polygon / MultiPolygon.
 */
export function parseOrsIsochrone(
  json: unknown
): Polygon | MultiPolygon | null {
  if (!json || typeof json !== "object") return null;
  const features = (json as { features?: unknown }).features;
  if (!Array.isArray(features) || features.length === 0) return null;
  // ORS returns one feature per requested range; we ask for a single range.
  for (const f of features) {
    const geom = (f as { geometry?: unknown } | null)?.geometry;
    if (!geom || typeof geom !== "object") continue;
    const t = (geom as { type?: unknown }).type;
    const coords = (geom as { coordinates?: unknown }).coordinates;
    if ((t === "Polygon" || t === "MultiPolygon") && Array.isArray(coords)) {
      return geom as Polygon | MultiPolygon;
    }
  }
  return null;
}

/**
 * Fetch a street-network walk isochrone for `pin` (a [lng, lat]) covering
 * `minutes` of walking. Never throws to the caller: returns `{ ok: false }`
 * when the feature is not configured, the request fails, or no polygon comes
 * back - callers then fall back to the free straight-line `amenitiesNear`.
 */
export async function fetchWalkIsochrone(
  pin: LngLat,
  minutes: number = WALK_MINUTES,
  opts: { signal?: AbortSignal } = {}
): Promise<IsochroneResult> {
  const key = orsApiKey();
  if (!key) return { ok: false, reason: "not-configured" };

  const seconds = Math.max(1, Math.round(minutes * 60));
  const t = timeoutSignal(9000, opts.signal);
  try {
    const res = await fetch(isochroneUrl(), {
      method: "POST",
      signal: t.signal,
      headers: {
        Authorization: key,
        "Content-Type": "application/json",
        Accept: "application/geo+json, application/json",
      },
      body: JSON.stringify({
        locations: [pin],
        range: [seconds],
        range_type: "time",
      }),
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const json: unknown = await res.json();
    const geom = parseOrsIsochrone(json);
    if (!geom) return { ok: false, reason: "no-geometry" };
    return { ok: true, geom };
  } catch (e) {
    return { ok: false, reason: (e as Error)?.name === "AbortError" ? "aborted" : "network" };
  } finally {
    t.clear();
  }
}
