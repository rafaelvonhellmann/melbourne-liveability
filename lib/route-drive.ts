/**
 * Real DRIVING travel time + road distance from the property pin to a buyer's
 * saved anchor (work / school / family), for the "Distance to your places"
 * section. Upgrade over the straight-line ("as the crow flies") default, which
 * understates real trips - a straight line is not a road.
 *
 * Same design constraints as walk-isochrone.ts: a runtime, client-side fetch
 * (static export safe, no server route), provider-isolated (OpenRouteService
 * driving-car), and never throwing to the caller - on any failure callers keep
 * the straight-line distance. OSM-derived routing (ODbL); attribute contributors.
 *
 * ORS free tier is rate-limited (~2k directions/day), and anchors are usually
 * 1-3, so this fires a handful of calls per pin - acceptable for low traffic;
 * production hardening = a key-hiding proxy via NEXT_PUBLIC_DRIVE_ROUTE_URL.
 */
import type { LngLat } from "./buyer-location";

const ORS_DRIVE_URL =
  "https://api.openrouteservice.org/v2/directions/driving-car/geojson";

/** ORS API key (shared with the walk-isochrone feature). Public by necessity. */
function orsApiKey(): string | undefined {
  const k = process.env.NEXT_PUBLIC_ORS_API_KEY;
  return k && k.trim() ? k.trim() : undefined;
}

function driveUrl(): string {
  const u = process.env.NEXT_PUBLIC_DRIVE_ROUTE_URL;
  return u && u.trim() ? u.trim() : ORS_DRIVE_URL;
}

/** Whether driving-time routing is available in this deployment. */
export function isDriveRoutingConfigured(): boolean {
  return orsApiKey() !== undefined;
}

export type DriveRoute =
  | { ok: true; durationMin: number; distanceKm: number }
  | { ok: false; reason: string };

/**
 * Pull duration (minutes) + distance (km) out of an ORS directions GeoJSON
 * response. Pure (no network) so it is unit-testable. Returns null for any
 * shape without a usable summary.
 */
export function parseOrsDrive(
  json: unknown
): { durationMin: number; distanceKm: number } | null {
  if (!json || typeof json !== "object") return null;
  const features = (json as { features?: unknown }).features;
  if (!Array.isArray(features) || features.length === 0) return null;
  const props = (features[0] as { properties?: unknown } | null)?.properties;
  const summary = (props as { summary?: unknown } | null)?.summary as
    | { duration?: unknown; distance?: unknown }
    | undefined;
  const dur = Number(summary?.duration);
  const dist = Number(summary?.distance);
  if (!Number.isFinite(dur) || !Number.isFinite(dist)) return null;
  return {
    durationMin: Math.round(dur / 60),
    distanceKm: Math.round((dist / 1000) * 10) / 10,
  };
}

/**
 * Fetch a driving route from `from` to `to` ([lng, lat] each). Never throws:
 * returns `{ ok: false }` when not configured, the request fails, or no usable
 * summary comes back - callers then keep the straight-line distance.
 */
export async function fetchDriveRoute(
  from: LngLat,
  to: LngLat,
  opts: { signal?: AbortSignal } = {}
): Promise<DriveRoute> {
  const key = orsApiKey();
  if (!key) return { ok: false, reason: "not-configured" };
  try {
    const res = await fetch(driveUrl(), {
      method: "POST",
      signal: opts.signal,
      headers: {
        Authorization: key,
        "Content-Type": "application/json",
        Accept: "application/geo+json, application/json",
      },
      body: JSON.stringify({ coordinates: [from, to] }),
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const parsed = parseOrsDrive(await res.json());
    if (!parsed) return { ok: false, reason: "no-route" };
    return { ok: true, ...parsed };
  } catch (e) {
    return { ok: false, reason: (e as Error)?.name === "AbortError" ? "aborted" : "network" };
  }
}
